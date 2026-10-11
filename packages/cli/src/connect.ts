import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

import { DiagnosisSchema, createOpenAICompatibleClient, diagnoseWithModel } from '@crucible/ai';
import { remediateRuntimeFinding } from '@crucible/ai';
import { ScenarioSchema, compileJourney, createVerifiedReplay, inspectProject, runLocalTest, withExecutionVerification, type ProjectSnapshot } from '@crucible/core';
import { CertificateRegistryAbi, attachPassportAttestation, createRuntimePassport, verifyRuntimePassport, type RuntimePassport } from '@crucible/certificate';
import { runMonadTestnetTest } from './testnet.js';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export type RunnerOptions = { root: string; name?: string; host?: string; port?: number };
export type RunnerHandle = { server: Server; url: string; snapshot: ProjectSnapshot; close: () => Promise<void> };

function json(response: import('node:http').ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  response.end(JSON.stringify(body));
}

async function body(request: import('node:http').IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of request) {
    raw += String(chunk);
    if (raw.length > 1_000_000) throw new Error('Request body is too large.');
  }
  return raw ? JSON.parse(raw) as unknown : {};
}

function foundryOptions(root: string, snapshot: ProjectSnapshot) {
  const foundryRoot = snapshot.detection.toolchain.foundry.configPaths[0]?.split('/').slice(0, -1).join('/') || '.';
  return { foundryRoot: resolve(root, foundryRoot), artifactDir: 'out' };
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function statePath(root: string): string { return join(root, 'crucible', 'results', 'm21d-state.json'); }

async function readState(root: string): Promise<Record<string, unknown>> {
  try { return JSON.parse(await readFile(statePath(root), 'utf8')) as Record<string, unknown>; } catch { return {}; }
}

async function writeState(root: string, value: Record<string, unknown>): Promise<void> {
  await mkdir(join(root, 'crucible', 'results'), { recursive: true });
  await writeFile(statePath(root), `${JSON.stringify(value, null, 2)}\n`);
}

function fallbackDiagnosis(result: import('@crucible/core').RunResult) {
  const failed = result.nodes.find((node) => node.status === 'failed') ?? result.nodes[0];
  if (!failed) return undefined;
  return DiagnosisSchema.parse({
    runId: result.runId,
    status: 'ready',
    rootCause: failed.error?.message ?? `Node ${failed.id} did not complete successfully.`,
    evidence: [{ nodeId: failed.id, field: failed.error?.message ? 'error.message' : 'status', value: failed.error?.message ?? failed.status }],
    suggestedFix: failed.error?.kind === 'assertion' ? 'Update the journey input or contract implementation so the assertion matches the intended state.' : 'Inspect the failed node and its source mapping, then rerun the same journey after the change.',
    confidence: 0.7,
    followUpTests: [`Rerun ${result.scenario} and confirm node ${failed.id} passes.`]
  });
}

export async function startLocalRunner(options: RunnerOptions): Promise<RunnerHandle> {
  const host = options.host ?? '127.0.0.1';
  const root = resolve(options.root);
  const snapshot = inspectProject(root, options.name);
  let persisted = await readState(root);
  const server = createServer(async (request, response) => {
    if (request.method === 'OPTIONS') return json(response, 204, {});
    const path = new URL(request.url ?? '/', `http://${host}`).pathname;
    if (path === '/health') return json(response, 200, { ok: true, service: 'crucible-local-runner', version: '0.1.0' });
    try {
      if (request.method === 'GET' && path === '/project') return json(response, 200, snapshot);
      if (request.method === 'GET' && path === '/contracts') return json(response, 200, { project: snapshot.project, contracts: snapshot.contracts });
      if (request.method === 'GET' && path === '/state') return json(response, 200, persisted);
      if (request.method !== 'POST') return json(response, 405, { error: 'Use GET for inspection or POST for compile/run.' });
      const input = await body(request);
      if (path === '/journeys/compile') {
        const value = input as Record<string, unknown>;
        const compiled = compileJourney({
          root,
          ...foundryOptions(root, snapshot),
          name: String(value.name ?? 'manual-journey'),
          contract: String(value.contract ?? ''),
          call: String(value.call ?? ''),
          assertion: String(value.assertion ?? ''),
          constructorArgs: Array.isArray(value.constructorArgs) ? value.constructorArgs : [],
          callArgs: Array.isArray(value.callArgs) ? value.callArgs : [],
          assertionArgs: Array.isArray(value.assertionArgs) ? value.assertionArgs : [],
          expected: typeof value.expected === 'string' || typeof value.expected === 'number' || typeof value.expected === 'boolean' ? value.expected : undefined,
          source: value.source && typeof value.source === 'object' ? value.source as never : undefined
        });
        return json(response, 200, { scenario: compiled.scenario, contract: compiled.contract });
      }
      if (path === '/runs') {
        const value = input as Record<string, unknown>;
        const scenario = ScenarioSchema.parse(value.scenario);
        const mode = value.mode === 'testnet' ? 'testnet' : 'local';
        if (mode === 'testnet') {
          const confirmed = value.confirmed === true;
          const testnet = await runMonadTestnetTest({ scenario, ...foundryOptions(root, snapshot), confirmed, dryRun: !confirmed });
          return json(response, testnet.runResult ? 200 : 409, { mode, ...testnet, ...(testnet.runResult ? { result: withExecutionVerification(testnet.runResult) } : {}) });
        }
        const result = withExecutionVerification(await runLocalTest({ scenario, ...foundryOptions(root, snapshot) }));
        persisted = { ...persisted, scenario, ...(result.status === 'failed' && !persisted.beforeRun ? { beforeRun: result } : {}), ...(result.status === 'passed' ? { afterRun: result } : {}), updatedAt: new Date().toISOString() };
        await writeState(root, persisted);
        return json(response, 200, { mode, result });
      }
      if (path === '/passport') {
        const value = input as Record<string, unknown>;
        const beforeRun = value.beforeRun as import('@crucible/core').RunResult;
        const afterRun = value.afterRun as import('@crucible/core').RunResult;
        const scenario = value.scenario;
        const replay = createVerifiedReplay({ beforeRun, afterRun, scenarioHash: hash(scenario), ruleSetHash: hash(afterRun.runtimeVerification?.findings.map((finding) => finding.ruleId).sort()) });
        const privateKeyPem = process.env.PASSPORT_PRIVATE_KEY_PEM;
        if (!privateKeyPem) throw new Error('Passport generation requires PASSPORT_PRIVATE_KEY_PEM in the local runner environment.');
        const passport = createRuntimePassport({
          runResult: afterRun,
          replay,
          repository: snapshot.project.root,
          commit: String(value.commit ?? process.env.CRUCIBLE_COMMIT ?? 'local-uncommitted'),
          runtimeVersion: String(value.runtimeVersion ?? 'local-anvil'),
          journeyHashes: Object.fromEntries(afterRun.runtimeVerification?.findings.map((finding) => [finding.journeyId, hash(finding)]) ?? []),
          issuer: String(value.issuer ?? 'crucible-local-runner'),
          privateKeyPem
        });
        persisted = { ...persisted, scenario, beforeRun, afterRun, replay, passport, updatedAt: new Date().toISOString() };
        await writeState(root, persisted);
        return json(response, 200, { passport, replay });
      }
      if (path === '/passport/publish') {
        const value = input as Record<string, unknown>;
        const passport = verifyRuntimePassport(value.passport);
        const registry = String(value.registry ?? '');
        if (!/^0x[a-fA-F0-9]{40}$/.test(registry)) throw new Error('Invalid registry address.');
        const keyName = String(value.keyEnv ?? 'DEPLOYER_PRIVATE_KEY');
        const privateKey = process.env[keyName] as Hex | undefined;
        if (!privateKey) throw new Error(`Missing ${keyName} in the local runner environment.`);
        const rpcUrl = String(value.rpc ?? process.env.LOCAL_RPC_URL ?? 'http://127.0.0.1:8545');
        const account = privateKeyToAccount(privateKey);
        const publicClient = createPublicClient({ transport: http(rpcUrl) });
        const walletClient = createWalletClient({ account, transport: http(rpcUrl) });
        const chainId = await publicClient.getChainId();
        const transactionHash = await walletClient.writeContract({ chain: null, address: registry as `0x${string}`, abi: CertificateRegistryAbi, functionName: 'registerPassport', args: [`0x${passport.passportHash}` as `0x${string}`, String(value.uri ?? `crucible://passport/${passport.passportId}`), passport.suiteVersion] });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
        if (receipt.status !== 'success') throw new Error('Runtime Passport registry transaction failed.');
        const published = attachPassportAttestation(passport, { chainId, registryAddress: registry as `0x${string}`, transactionHash, suiteVersion: passport.suiteVersion });
        persisted = { ...persisted, passport: published, updatedAt: new Date().toISOString() };
        await writeState(root, persisted);
        return json(response, 200, { passport: published });
      }
      if (path === '/diagnose') {
        const value = input as Record<string, unknown>;
        const result = value.runResult as import('@crucible/core').RunResult;
        const scenario = value.scenario;
        const apiKey = process.env.AI_API_KEY;
        const client = apiKey ? createOpenAICompatibleClient({ apiKey, endpoint: process.env.AI_API_URL ?? 'https://api.openai.com/v1/chat/completions', model: process.env.AI_MODEL ?? 'gpt-4o-mini' }) : undefined;
        const diagnosis = await diagnoseWithModel({ runResult: result, scenario, source: typeof value.source === 'string' ? value.source : undefined }, { client, fallback: fallbackDiagnosis(result) });
        return json(response, 200, diagnosis);
      }
      if (path === '/remediate') {
        const value = input as Record<string, unknown>;
        const finding = value.finding as import('@crucible/core').RuntimeFinding;
        const scenario = value.scenario;
        const fallback = {
          status: 'ai-suggested',
          findingId: finding.findingId,
          ruleId: finding.ruleId,
          explanation: finding.summary,
          rootCause: finding.userImpact ?? finding.summary,
          remediation: 'Review the failing evidence and update the scenario or contract logic before rerunning.',
          suggestedDiff: 'No automatic source change was applied. Use the source mapping and evidence to make the change intentionally.',
          followUpTests: [`Rerun the ${finding.journeyId} journey and verify ${finding.ruleId} passes.`],
          confidence: 0.65
        };
        const result = await remediateRuntimeFinding({ finding, scenario }, { fallback });
        return json(response, 200, result);
      }
      if (path === '/replay') {
        const value = input as Record<string, unknown>;
        const beforeRun = value.beforeRun as import('@crucible/core').RunResult;
        const afterRun = value.afterRun as import('@crucible/core').RunResult;
        const replay = createVerifiedReplay({ beforeRun, afterRun, scenarioHash: hash(value.scenario), ruleSetHash: hash(afterRun.runtimeVerification?.findings.map((finding) => finding.ruleId).sort()) });
        return json(response, 200, replay);
      }
      return json(response, 404, { error: 'Not found' });
    } catch (error) {
      return json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 8787, host, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port ?? 8787;
  return {
    server,
    url: `http://${host}:${port}`,
    snapshot,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
