import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';

import { DiagnosisSchema, createOpenAICompatibleClient, diagnoseWithModel, remediateRuntimeFinding } from '@crucible/ai';
import { RunResultSchema, RuntimeFindingSchema, ScenarioSchema, compileJourney, createVerifiedReplay, inspectProject, runLocalTest, withExecutionVerification, type ProjectSnapshot } from '@crucible/core';
import { CertificateRegistryAbi, attachPassportAttestation, createRuntimePassport, verifyRuntimePassport } from '@crucible/certificate';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { runMonadTestnetTest } from './testnet.js';

export type RunnerApiHandlerOptions = {
  root: string;
  name?: string;
  host?: string;
  allowedOrigins?: string[];
  allowSameOrigin?: boolean;
};

export type RunnerApiHandler = {
  handle: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  snapshot: ProjectSnapshot;
};

const localOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173'];

function json(response: ServerResponse, status: number, body: unknown, origin?: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-private-network': 'true'
  };
  if (origin) headers['access-control-allow-origin'] = origin;
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}

async function body(request: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of request) {
    raw += String(chunk);
    if (raw.length > 1_000_000) throw new Error('Request body is too large.');
  }
  return raw ? JSON.parse(raw) as unknown : {};
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !path.split(sep).includes('..'));
}

async function assertSafeRepositoryPath(root: string, candidate: string, label: string): Promise<void> {
  const resolvedRoot = await realpath(root);
  const resolvedCandidate = await realpath(candidate);
  if (!isWithin(resolvedRoot, resolvedCandidate)) throw new Error(`${label} must stay inside the connected repository root.`);
}

async function foundryOptions(root: string, snapshot: ProjectSnapshot) {
  const foundryRoot = snapshot.detection.toolchain.foundry.configPaths[0]?.split('/').slice(0, -1).join('/') || '.';
  const resolvedFoundryRoot = resolve(root, foundryRoot);
  await assertSafeRepositoryPath(root, resolvedFoundryRoot, 'Foundry root');
  return { foundryRoot: resolvedFoundryRoot, artifactDir: 'out' };
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function statePath(root: string): string { return join(root, 'crucible', 'results', 'm21d-state.json'); }

async function assertSafeStateDirectory(root: string): Promise<void> {
  const crucible = join(root, 'crucible');
  const results = join(crucible, 'results');
  for (const path of [crucible, results]) {
    try {
      if ((await lstat(path)).isSymbolicLink()) throw new Error('State directory symlinks are not allowed.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

async function readState(root: string): Promise<Record<string, unknown>> {
  try { return JSON.parse(await readFile(statePath(root), 'utf8')) as Record<string, unknown>; } catch { return {}; }
}

async function writeState(root: string, value: Record<string, unknown>): Promise<void> {
  await assertSafeStateDirectory(root);
  await mkdir(join(root, 'crucible', 'results'), { recursive: true });
  await writeFile(statePath(root), `${JSON.stringify(value, null, 2)}\n`);
}

const CompileJourneyRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  contract: z.string().min(1).max(200),
  call: z.string().min(1).max(200),
  assertion: z.string().min(1).max(200),
  constructorArgs: z.array(z.unknown()).max(100).optional(),
  callArgs: z.array(z.unknown()).max(100).optional(),
  assertionArgs: z.array(z.unknown()).max(100).optional(),
  expected: z.union([z.string(), z.number(), z.boolean()]).optional(),
  source: z.object({ file: z.string().min(1).max(1000) }).strict().optional()
}).strict();

const RunRequestSchema = z.object({ scenario: ScenarioSchema, mode: z.enum(['local', 'testnet']).optional(), confirmed: z.boolean().optional() }).strict();
const PassportRequestSchema = z.object({ beforeRun: RunResultSchema, afterRun: RunResultSchema, scenario: ScenarioSchema, commit: z.string().max(200).optional(), runtimeVersion: z.string().max(200).optional(), issuer: z.string().max(200).optional() }).strict();
const PublishRequestSchema = z.object({ passport: z.unknown(), registry: z.string(), keyEnv: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional(), rpc: z.string().url().optional(), uri: z.string().max(1000).optional() }).strict();
const RemediateRequestSchema = z.object({ finding: RuntimeFindingSchema, scenario: ScenarioSchema }).strict();

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

function requestPath(request: IncomingMessage, host: string): string {
  const path = new URL(request.url ?? '/', `http://${host}`).pathname;
  return path.startsWith('/api/') ? path.slice('/api'.length) : path;
}

function sameOrigin(request: IncomingMessage, origin: string): boolean {
  return origin === `http://${request.headers.host ?? ''}`;
}

export async function createRunnerApiHandler(options: RunnerApiHandlerOptions): Promise<RunnerApiHandler> {
  const host = options.host ?? '127.0.0.1';
  const root = resolve(options.root);
  await assertSafeRepositoryPath(root, root, 'Repository root');
  const snapshot = inspectProject(root, options.name);
  const configuredOrigins = options.allowedOrigins ?? (process.env.CRUCIBLE_ALLOWED_ORIGINS ? process.env.CRUCIBLE_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean) : localOrigins);
  const allowedOrigins = new Set(configuredOrigins);
  let persisted = await readState(root);

  return {
    snapshot,
    handle: async (request, response) => {
      const origin = request.headers.origin;
      const originAllowed = !origin || allowedOrigins.has(origin) || (options.allowSameOrigin === true && sameOrigin(request, origin));
      if (!originAllowed) return json(response, 403, { error: 'Origin is not allowed.' });
      if (request.method === 'OPTIONS') return json(response, 204, {}, origin);
      const path = requestPath(request, host);
      if (path === '/health') return json(response, 200, { ok: true, service: 'crucible-local-runner', version: '0.1.0' }, origin);
      try {
        if (request.method === 'GET' && path === '/project') return json(response, 200, snapshot, origin);
        if (request.method === 'GET' && path === '/contracts') return json(response, 200, { project: snapshot.project, contracts: snapshot.contracts }, origin);
        if (request.method === 'GET' && path === '/state') return json(response, 200, persisted, origin);
        const knownPath = ['/health', '/project', '/contracts', '/state', '/journeys/compile', '/runs', '/passport', '/passport/publish', '/diagnose', '/remediate', '/replay'].includes(path);
        if (!knownPath) return json(response, 404, { error: 'Not found' }, origin);
        if (request.method !== 'POST') return json(response, 405, { error: 'Use GET for inspection or POST for compile/run.' }, origin);
        const input = await body(request);
        if (path === '/journeys/compile') {
          const value = CompileJourneyRequestSchema.parse(input);
          const compiled = compileJourney({
            root,
            ...(await foundryOptions(root, snapshot)),
            name: String(value.name ?? 'manual-journey'),
            contract: String(value.contract ?? ''),
            call: String(value.call ?? ''),
            assertion: String(value.assertion ?? ''),
            constructorArgs: Array.isArray(value.constructorArgs) ? value.constructorArgs : [],
            callArgs: Array.isArray(value.callArgs) ? value.callArgs : [],
            assertionArgs: Array.isArray(value.assertionArgs) ? value.assertionArgs : [],
            expected: typeof value.expected === 'string' || typeof value.expected === 'number' || typeof value.expected === 'boolean' ? value.expected : undefined,
            source: value.source
          });
          return json(response, 200, { scenario: compiled.scenario, contract: compiled.contract }, origin);
        }
        if (path === '/runs') {
          const value = RunRequestSchema.parse(input);
          const scenario = value.scenario;
          const mode = value.mode === 'testnet' ? 'testnet' : 'local';
          if (mode === 'testnet') {
            const confirmed = value.confirmed === true;
            const testnet = await runMonadTestnetTest({ scenario, ...(await foundryOptions(root, snapshot)), confirmed, dryRun: !confirmed });
            return json(response, testnet.runResult ? 200 : 409, { mode, ...testnet, ...(testnet.runResult ? { result: withExecutionVerification(testnet.runResult) } : {}) }, origin);
          }
          const result = withExecutionVerification(await runLocalTest({ scenario, ...(await foundryOptions(root, snapshot)) }));
          persisted = { ...persisted, scenario, ...(result.status === 'failed' && !persisted.beforeRun ? { beforeRun: result } : {}), ...(result.status === 'passed' ? { afterRun: result } : {}), updatedAt: new Date().toISOString() };
          await writeState(root, persisted);
          return json(response, 200, { mode, result }, origin);
        }
        if (path === '/passport') {
          const value = PassportRequestSchema.parse(input);
          const beforeRun = value.beforeRun;
          const afterRun = value.afterRun;
          const scenario = value.scenario;
          const replay = createVerifiedReplay({ beforeRun, afterRun, scenarioHash: hash(scenario), ruleSetHash: hash(afterRun.runtimeVerification?.findings.map((finding) => finding.ruleId).sort()) });
          const privateKeyPem = process.env.PASSPORT_PRIVATE_KEY_PEM;
          if (!privateKeyPem) throw new Error('Passport generation requires PASSPORT_PRIVATE_KEY_PEM in the local runner environment.');
          const passport = createRuntimePassport({
            runResult: afterRun,
            replay,
            repository: snapshot.project.root,
            commit: value.commit ?? process.env.CRUCIBLE_COMMIT ?? 'local-uncommitted',
            runtimeVersion: value.runtimeVersion ?? 'local-anvil',
            journeyHashes: Object.fromEntries(afterRun.runtimeVerification?.findings.map((finding) => [finding.journeyId, hash(finding)]) ?? []),
            issuer: value.issuer ?? 'crucible-local-runner',
            privateKeyPem
          });
          persisted = { ...persisted, scenario, beforeRun, afterRun, replay, passport, updatedAt: new Date().toISOString() };
          await writeState(root, persisted);
          return json(response, 200, { passport, replay }, origin);
        }
        if (path === '/passport/publish') {
          const value = PublishRequestSchema.parse(input);
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
          return json(response, 200, { passport: published }, origin);
        }
        if (path === '/diagnose') {
          const value = z.object({ runResult: RunResultSchema, scenario: ScenarioSchema, source: z.string().optional() }).strict().parse(input);
          const result = value.runResult;
          const scenario = value.scenario;
          const apiKey = process.env.AI_API_KEY;
          const client = apiKey ? createOpenAICompatibleClient({ apiKey, endpoint: process.env.AI_API_URL ?? 'https://api.openai.com/v1/chat/completions', model: process.env.AI_MODEL ?? 'gpt-4o-mini' }) : undefined;
          const diagnosis = await diagnoseWithModel({ runResult: result, scenario, source: typeof value.source === 'string' ? value.source : undefined }, { client, fallback: fallbackDiagnosis(result) });
          return json(response, 200, diagnosis, origin);
        }
        if (path === '/remediate') {
          const value = RemediateRequestSchema.parse(input);
          const finding = value.finding;
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
          return json(response, 200, result, origin);
        }
        if (path === '/replay') {
          const value = z.object({ beforeRun: RunResultSchema, afterRun: RunResultSchema, scenario: z.unknown() }).strict().parse(input);
          const beforeRun = value.beforeRun;
          const afterRun = value.afterRun;
          const replay = createVerifiedReplay({ beforeRun, afterRun, scenarioHash: hash(value.scenario), ruleSetHash: hash(afterRun.runtimeVerification?.findings.map((finding) => finding.ruleId).sort()) });
          return json(response, 200, replay, origin);
        }
        return json(response, 404, { error: 'Not found' }, origin);
      } catch (error) {
        return json(response, 400, { error: error instanceof Error ? error.message : String(error) }, origin);
      }
    }
  };
}
