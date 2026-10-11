import { useEffect, useMemo, useState } from 'react';

import type { ProjectSnapshot } from '@crucible/core';
import type { RunResult, Scenario } from '@crucible/core';
import type { Diagnosis, RuntimeRemediation } from '@crucible/ai';
import type { RuntimeReplaySummary } from '@crucible/core';
import { Activity, Box, Bug, CheckCircle2, ChevronRight, CircleHelp, Code2, ExternalLink, LayoutDashboard, Play, ShieldCheck, TriangleAlert } from 'lucide-react';
import { RuntimeFlow } from './RuntimeFlow.js';

type SavedProject = { id: string; name: string; runnerUrl: string; connectedAt?: string };
type RuntimePassport = { passportId: string; passportHash: string; verificationProfile: string; suiteVersion: string; onChain?: { chainId: number; registryAddress: string; transactionHash: string } };
const STORAGE_KEY = 'crucible.projects.v1';

function loadProjects(): SavedProject[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as SavedProject[]; } catch { return []; }
}

export function ProjectOnboarding() {
  const [projects, setProjects] = useState<SavedProject[]>(loadProjects);
  const [name, setName] = useState('');
  const [runnerUrl, setRunnerUrl] = useState('http://127.0.0.1:8787');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [selectedContract, setSelectedContract] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [contract, setContract] = useState('');
  const [constructorArgs, setConstructorArgs] = useState('');
  const [call, setCall] = useState('');
  const [assertion, setAssertion] = useState('');
  const [callArgs, setCallArgs] = useState('');
  const [assertionArgs, setAssertionArgs] = useState('');
  const [expected, setExpected] = useState('');
  const [sourceFile, setSourceFile] = useState('');
  const [compiled, setCompiled] = useState<Scenario | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [selectedNode, setSelectedNode] = useState('');
  const [runMode, setRunMode] = useState<'local' | 'testnet'>('local');
  const [confirmTestnet, setConfirmTestnet] = useState(false);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [remediation, setRemediation] = useState<RuntimeRemediation | null>(null);
  const [beforeRun, setBeforeRun] = useState<RunResult | null>(null);
  const [replay, setReplay] = useState<RuntimeReplaySummary | null>(null);
  const [passport, setPassport] = useState<RuntimePassport | null>(null);
  const [registry, setRegistry] = useState('');

  const activeContract = useMemo(() => snapshot?.contracts.find((contract) => contract.name === selectedContract) ?? snapshot?.contracts[0], [selectedContract, snapshot]);

  useEffect(() => { if (!selectedContract && snapshot?.contracts[0]) setSelectedContract(snapshot.contracts[0].name); }, [selectedContract, snapshot]);
  useEffect(() => {
    const selected = snapshot?.contracts.find((item) => item.name === contract) ?? snapshot?.contracts[0];
    if (selected) {
      setContract(selected.name);
      setCall(selected.functions.find((fn) => fn.stateMutability !== 'view' && fn.stateMutability !== 'pure')?.name ?? selected.functions[0]?.name ?? '');
      setAssertion(selected.functions.find((fn) => fn.stateMutability === 'view' || fn.stateMutability === 'pure')?.name ?? '');
    }
  }, [snapshot, contract]);
  function save(next: SavedProject[]) { setProjects(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }

  async function copyConnectCommand() {
    const command = 'pnpm dlx @ohmuzakie/crucible-cli@latest connect --root .';
    try {
      await navigator.clipboard.writeText(command);
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Copy unavailable — select the command manually.');
    }
    window.setTimeout(() => setCopyStatus(''), 2200);
  }

  async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const payload = await response.json() as T & { error?: string; message?: string };
        if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Runner returned ${response.status}.`);
        return payload;
      } catch (error) {
        lastError = error;
        if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 250));
      } finally { window.clearTimeout(timer); }
    }
    throw lastError instanceof Error ? lastError : new Error('Runner request failed. Reconnect the project and retry.');
  }

  async function connect(url = runnerUrl, projectName = name) {
    setBusy(true); setStatus('Connecting to the local runner…');
    try {
      const base = url.replace(/\/$/, '');
      await requestJson(`${base}/health`);
      const next = await requestJson<ProjectSnapshot>(`${base}/project`);
      setSnapshot(next); setStatus(`Connected. Detected ${next.project.name}.`);
      const project = { id: `${base}:${next.project.root}`, name: projectName.trim() || next.project.name, runnerUrl: base, connectedAt: new Date().toISOString() };
      save([project, ...projects.filter((item) => item.id !== project.id)]);
      const state = await requestJson<{ passport?: RuntimePassport; replay?: RuntimeReplaySummary; beforeRun?: RunResult; afterRun?: RunResult }>(`${base}/state`);
      if (state.passport) setPassport(state.passport);
      if (state.replay) setReplay(state.replay);
      if (state.beforeRun) setBeforeRun(state.beforeRun);
      if (state.afterRun) setRunResult(state.afterRun);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to connect. Start `crucible connect` first.'); }
    finally { setBusy(false); }
  }

  async function compile() {
    setBusy(true); setStatus('Compiling the journey against the detected ABI…');
    try {
      const payload = await requestJson<{ scenario?: Scenario }>(`${runnerUrl.replace(/\/$/, '')}/journeys/compile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name.trim() || 'manual-journey', contract, constructorArgs: constructorArgs ? constructorArgs.split(',').map((item) => item.trim()) : [], call, assertion, callArgs: callArgs ? callArgs.split(',').map((item) => item.trim()) : [], assertionArgs: assertionArgs ? assertionArgs.split(',').map((item) => item.trim()) : [], expected: expected || undefined, source: sourceFile ? { file: sourceFile } : undefined }) });
      if (!payload.scenario) throw new Error('Journey compiler returned no scenario.');
      setCompiled(payload.scenario); setRunResult(null); setStatus('Journey compiled and validated.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to compile journey.'); }
    finally { setBusy(false); }
  }

  async function run() {
    if (!compiled) return;
    setBusy(true); setStatus(runMode === 'local' ? 'Running local verification on a fresh Anvil chain…' : 'Running guarded Monad Testnet preflight…');
    try {
      const payload = await requestJson<{ result?: RunResult }>(`${runnerUrl.replace(/\/$/, '')}/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: runMode, confirmed: confirmTestnet, scenario: compiled }) });
      if (!payload.result) throw new Error('Runner returned no result.');
      const next = payload.result;
      if (next.status === 'failed' && !beforeRun) setBeforeRun(next);
      setRunResult(next); setSelectedNode(next.nodes[0]?.id ?? ''); setStatus(next.status === 'passed' ? 'Verification passed.' : 'Verification finished with findings.');
      if (next.status === 'failed') {
        const diagnosisPayload = await requestJson<{ diagnosis?: Diagnosis }>(`${runnerUrl.replace(/\/$/, '')}/diagnose`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runResult: next, scenario: compiled }) });
        if (diagnosisPayload.diagnosis) {
          setDiagnosis(diagnosisPayload.diagnosis);
          const finding = next.runtimeVerification?.findings.find((item) => item.status === 'failed');
          if (finding) {
            const remediationPayload = await requestJson<{ remediation?: RuntimeRemediation }>(`${runnerUrl.replace(/\/$/, '')}/remediate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ finding, scenario: compiled }) });
            if (remediationPayload.remediation) setRemediation(remediationPayload.remediation);
          }
        }
      } else if (beforeRun?.status === 'failed') {
        const replayPayload = await requestJson<RuntimeReplaySummary>(`${runnerUrl.replace(/\/$/, '')}/replay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ beforeRun, afterRun: next, scenario: compiled }) });
        setReplay(replayPayload);
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to run verification.'); }
    finally { setBusy(false); }
  }

  async function generatePassport() {
    if (!beforeRun || !runResult || !compiled || runResult.status !== 'passed') return;
    setBusy(true); setStatus('Generating the signed Passport in the local runner…');
    try {
      const payload = await requestJson<{ passport: RuntimePassport }>(`${runnerUrl.replace(/\/$/, '')}/passport`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ beforeRun, afterRun: runResult, scenario: compiled }) });
      setPassport(payload.passport); setStatus(`Passport ready: ${payload.passport.passportHash}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Passport generation failed.'); }
    finally { setBusy(false); }
  }

  async function publishPassport() {
    if (!passport || !registry) return;
    setBusy(true); setStatus('Publishing Passport through the local runner…');
    try {
      const payload = await requestJson<{ passport: RuntimePassport }>(`${runnerUrl.replace(/\/$/, '')}/passport/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passport, registry }) });
      setPassport(payload.passport); setStatus(`Passport published: ${payload.passport.onChain?.transactionHash ?? 'transaction confirmed'}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Passport publish failed.'); }
    finally { setBusy(false); }
  }

  function downloadPassport() {
    if (!passport) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(passport, null, 2)], { type: 'application/json' }));
    link.download = `${passport.passportId}.json`; link.click(); URL.revokeObjectURL(link.href);
  }

  const passportEligible = replay?.status === 'runtime-verified'
    && runResult?.runtimeVerification?.profile === 'monad-core'
    && ['MND-TIME-001', 'MND-FINALITY-001', 'MND-FUND-001'].every((ruleId) => runResult.runtimeVerification?.findings.some((finding) => finding.ruleId === ruleId && finding.status === 'passed'));

  return <main className="project-shell"><aside className="project-sidebar" aria-label="Project workspace navigation"><a className="project-brand" href="/" aria-label="Crucible home"><span className="project-brand-mark">C</span><span><strong>CRUCIBLE</strong><small>Runtime verification</small></span></a><div className="project-sidebar-label">WORKSPACE</div><nav className="project-nav"><a className="selected" href="#overview"><LayoutDashboard size={16} aria-hidden="true" />Overview</a><a href="#journey-builder"><Play size={16} aria-hidden="true" />Journeys</a><a href="#contracts"><Box size={16} aria-hidden="true" />Contracts</a><a href="#live-run"><Activity size={16} aria-hidden="true" />Runs</a><a href="#passport"><ShieldCheck size={16} aria-hidden="true" />Passport</a></nav><div className="project-sidebar-footer"><a href="?debug=1"><BugIcon />Demo fixtures</a><a href="https://docs.monad.xyz" target="_blank" rel="noreferrer"><CircleHelp size={14} aria-hidden="true" />Monad docs <ExternalLink size={11} aria-hidden="true" /></a></div></aside><div className="project-main"><div className="project-hero" id="overview"><div><p className="eyebrow">CRUCIBLE / PROJECT WORKSPACE</p><h1>Connect your project to begin</h1><p className="lede">Crucible inspects your repository locally, discovers its contracts, and turns a real user journey into evidence you can review.</p></div><a className="secondary-button" href="?debug=1"><BugIcon />Try demo fixtures</a></div>
    <section className="onboarding-grid">
      <div className="panel onboarding-card"><p className="eyebrow">STEP 1 / CREATE PROJECT</p><h2>Connect a local repository</h2><p className="panel-subtitle">Run this command in the repository you want to verify:</p><div className="runner-command"><code>pnpm dlx @ohmuzakie/crucible-cli@latest connect --root .</code><button className="copy-button" type="button" onClick={() => void copyConnectCommand()} aria-label="Copy connect command">Copy</button></div>{copyStatus ? <p className="copy-status" role="status">{copyStatus}</p> : null}<label>Project name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="My Monad app" /></label><button className="primary-button" type="button" onClick={() => void connect()} disabled={busy}>{busy ? 'Connecting…' : 'Connect & detect repository'}</button><button className="advanced-toggle" type="button" onClick={() => setShowAdvanced((current) => !current)} aria-expanded={showAdvanced}>{showAdvanced ? 'Hide advanced settings' : 'Advanced settings'}</button>{showAdvanced ? <div className="advanced-settings"><label>Local runner URL<input value={runnerUrl} onChange={(event) => setRunnerUrl(event.target.value)} /></label><p>Use this only when the runner is not using the default local address.</p></div> : null}{status ? <p className="runner-status" role="status">{status}</p> : null}</div>
      <div className="panel onboarding-card"><p className="eyebrow">SAVED PROJECTS</p><h2>Your projects</h2>{projects.length ? <div className="saved-projects">{projects.map((project) => <button className="saved-project" key={project.id} type="button" onClick={() => { setName(project.name); setRunnerUrl(project.runnerUrl); void connect(project.runnerUrl, project.name); }}><span className="project-dot" /><span><strong>{project.name}</strong><small>{project.runnerUrl}</small></span><span>→</span></button>)}</div> : <p className="empty-copy">No repositories connected yet.</p>}</div>
    </section>
    {snapshot ? <section className="panel detection-panel"><div className="panel-heading"><div><p className="eyebrow">STEP 2 / REPOSITORY DETECTION</p><h2>{snapshot.project.name}</h2><p className="panel-subtitle"><code>{snapshot.project.root}</code></p></div><span className={`status-badge ${snapshot.detection.status === 'SUPPORTED' ? 'passed' : snapshot.detection.status === 'UNSUPPORTED_TOOLCHAIN' ? 'failed' : 'skipped'}`}>{snapshot.detection.status.replaceAll('_', ' ')}</span></div><div className="detection-grid"><div><span>Toolchain</span><strong>{snapshot.detection.toolchain.foundry.detected ? 'Foundry detected' : 'Foundry not detected'}</strong></div><div><span>Artifacts</span><strong>{snapshot.detection.artifacts.candidates.length} candidates</strong></div><div><span>Scenarios</span><strong>{snapshot.detection.scenarios.candidates.length} found</strong></div><div><span>Next step</span><strong>{snapshot.detection.nextSteps[0]}</strong></div></div><p className="panel-subtitle">{snapshot.detection.summary}</p></section> : null}
    {snapshot ? <section id="contracts" className="panel contract-panel"><div className="panel-heading"><div><p className="eyebrow">STEP 3 / CONTRACT EXPLORER</p><h2>Compiled application contracts</h2><p className="panel-subtitle">Only functions read from compiled artifacts are shown.</p></div></div>{snapshot.contracts.length ? <div className="contract-explorer"><div className="contract-list">{snapshot.contracts.map((contract) => <button className={`contract-item ${activeContract?.name === contract.name ? 'selected' : ''}`} key={contract.name} type="button" onClick={() => setSelectedContract(contract.name)}><strong>{contract.name}</strong><small>{contract.functions.length} functions · {contract.selectionReason}</small><ChevronRight size={14} aria-hidden="true" /></button>)}</div><div className="abi-list">{activeContract ? <>{<h3>{activeContract.name}</h3>}{activeContract.functions.map((fn) => <div className="abi-row" key={`${fn.name}-${fn.stateMutability}`}><strong>{fn.name}</strong><span>{fn.stateMutability}</span><small>({fn.inputs.map((input) => `${input.name}: ${input.type}`).join(', ') || 'no inputs'})</small></div>)}</> : null}</div></div> : <div className="empty-state"><TriangleAlert size={18} aria-hidden="true" /><strong>Contract explorer is waiting for compiled artifacts.</strong><p>{snapshot.contractExplorer.reason ?? 'Run forge build, then reconnect the project.'}</p></div>}</section> : null}
    {snapshot?.contracts.length ? <section id="journey-builder" className="panel journey-builder"><div className="panel-heading"><div><p className="eyebrow">STEP 4 / BUILD A JOURNEY</p><h2>Choose what to verify</h2><p className="panel-subtitle">Select one write action and one read assertion. Crucible validates the scenario before running it.</p></div><span className="status-badge skipped">{runMode === 'local' ? 'LOCAL MODE' : 'TESTNET GUARD'}</span></div><div className="builder-grid"><label>Contract<select value={contract} onChange={(event) => setContract(event.target.value)}>{snapshot.contracts.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><label>Constructor args<input value={constructorArgs} onChange={(event) => setConstructorArgs(event.target.value)} placeholder="initial greeting (optional)" /><small>Comma-separated values used during deployment.</small></label><label>Write function<select value={call} onChange={(event) => setCall(event.target.value)}>{activeContract?.functions.filter((fn) => fn.stateMutability !== 'view' && fn.stateMutability !== 'pure').map((fn) => <option key={fn.name} value={fn.name}>{fn.name}</option>)}</select></label><label>Read assertion<select value={assertion} onChange={(event) => setAssertion(event.target.value)}>{activeContract?.functions.filter((fn) => fn.stateMutability === 'view' || fn.stateMutability === 'pure').map((fn) => <option key={fn.name} value={fn.name}>{fn.name}</option>)}</select></label><label>Write args<input value={callArgs} onChange={(event) => setCallArgs(event.target.value)} placeholder="alice, 1" /></label><label>Assertion args<input value={assertionArgs} onChange={(event) => setAssertionArgs(event.target.value)} placeholder="0" /></label><label>Expected value<input value={expected} onChange={(event) => setExpected(event.target.value)} placeholder="optional" /></label><label>Execution mode<select value={runMode} onChange={(event) => setRunMode(event.target.value as 'local' | 'testnet')}><option value="local">Local / fresh Anvil</option><option value="testnet">Monad Testnet / guarded</option></select></label><label className="source-field">Source file (optional)<input value={sourceFile} onChange={(event) => setSourceFile(event.target.value)} placeholder="src/MyContract.sol" /></label></div>{runMode === 'testnet' ? <label className="confirm-testnet"><input type="checkbox" checked={confirmTestnet} onChange={(event) => setConfirmTestnet(event.target.checked)} /> I understand confirmed mode can deploy and spend testnet gas.</label> : null}<div className="builder-actions"><button className="primary-button" type="button" onClick={() => void compile()} disabled={busy || !call || !assertion}><Code2 size={15} aria-hidden="true" />Compile journey</button>{compiled ? <button className="secondary-button" type="button" onClick={() => void run()} disabled={busy || (runMode === 'testnet' && !confirmTestnet)}><Play size={15} aria-hidden="true" />{busy ? 'Running…' : runMode === 'local' ? 'Run verification' : 'Run guarded testnet'}</button> : null}<span className="builder-note">{compiled ? <><CheckCircle2 size={13} aria-hidden="true" />Validated scenario: {compiled.name}</> : 'No scenario compiled yet.'}</span></div></section> : null}
    {runResult ? <section id="live-run" className="panel live-run-panel"><div className="panel-heading"><div><p className="eyebrow">STEP 5 / LIVE VERIFICATION</p><h2>{runResult.status === 'passed' ? 'Journey passed' : 'Journey needs attention'}</h2><p className="panel-subtitle">{runResult.network.name} · {runResult.summary.passed} passed · {runResult.summary.failed} failed · {runResult.summary.skipped} skipped</p></div><span className={`status-badge ${runResult.status}`}>{runResult.status}</span></div><div className="live-run-grid"><div className="runtime-flow-canvas"><RuntimeFlow result={runResult} journeyId="" view="technical" selectedNodeId={selectedNode} selectedFindingId="" onSelect={(nodeId) => setSelectedNode(nodeId)} /></div><div className="panel live-inspector"><p className="eyebrow">INSPECTOR</p>{runResult.nodes.filter((node) => node.id === selectedNode)[0] ? <><h3>{selectedNode}</h3><span className={`status-badge ${runResult.nodes.find((node) => node.id === selectedNode)?.status}`}>{runResult.nodes.find((node) => node.id === selectedNode)?.status}</span><dl><dt>Duration</dt><dd>{runResult.nodes.find((node) => node.id === selectedNode)?.durationMs}ms</dd><dt>Source</dt><dd>{runResult.nodes.find((node) => node.id === selectedNode)?.source?.file ?? 'Source mapping unavailable'}</dd></dl>{runResult.nodes.find((node) => node.id === selectedNode)?.error ? <div className="failure"><strong>Execution error</strong><p>{runResult.nodes.find((node) => node.id === selectedNode)?.error?.message}</p></div> : null}</> : <p className="empty-copy">Select a node in the live trace.</p>}</div></div></section> : null}
    {diagnosis ? <section className="panel intelligence-panel"><div className="panel-heading"><div><p className="eyebrow">STEP 6 / RUNTIME INTELLIGENCE</p><h2>Evidence-bound diagnosis</h2><p className="panel-subtitle">The suggestion is constrained to values present in this run; it is not an automatic code change.</p></div><span className="status-badge skipped">AI SUGGESTED</span></div><div className="diagnosis-grid"><div><span className="diagnosis-label">Root cause</span><p>{diagnosis.rootCause}</p></div><div><span className="diagnosis-label">Evidence</span><ul className="evidence-list">{diagnosis.evidence.map((item) => <li key={`${item.nodeId}-${item.field}`}><code>{item.nodeId}.{item.field}</code> = {item.value}</li>)}</ul></div><div><span className="diagnosis-label">Suggested fix</span><p>{diagnosis.suggestedFix}</p></div><div><span className="diagnosis-label">Follow-up tests</span><ul className="evidence-list">{diagnosis.followUpTests.map((item) => <li key={item}>{item}</li>)}</ul></div></div>{remediation ? <div className="remediation-note"><strong>Suggested remediation · {Math.round(remediation.confidence * 100)}%</strong><p>{remediation.remediation}</p><code>{remediation.suggestedDiff}</code></div> : null}</section> : null}
    {replay ? <section className="replay-proof live-replay"><div><p className="eyebrow">STEP 7 / VERIFIED REPLAY</p><h2>Before/after proof confirmed</h2><p>The same compiled scenario changed from failed to passed under the same deterministic verification contract.</p></div><div className="replay-proof-grid"><span>Before<strong>{replay.beforeRunId}</strong></span><span>After<strong>{replay.afterRunId}</strong></span><span>Recovered<strong>{replay.diffSummary.recoveredJourneys.length} journey</strong></span><span className="success-text">✓ Runtime Verified</span></div></section> : null}
    {replay?.status === 'runtime-verified' ? <section className="panel passport-panel"><div className="panel-heading"><div><p className="eyebrow">STEP 8 / TRUST PASSPORT</p><h2>{passport ? 'Runtime Passport ready' : passportEligible ? 'Create a Runtime Passport' : 'Passport not available'}</h2><p className="panel-subtitle">{passportEligible ? 'Signing stays in the local runner. The browser receives only the verifiable public Passport.' : 'This run uses the Generic EVM profile. A Monad Runtime Passport requires the mandatory monad-core rule suite.'}</p></div><span className={`status-badge ${passportEligible ? 'passed' : 'skipped'}`}>{passportEligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}</span></div>{passport ? <><p><code>{passport.passportHash}</code></p><div className="builder-actions"><button className="secondary-button" type="button" onClick={downloadPassport}>Download Passport</button><input value={registry} onChange={(event) => setRegistry(event.target.value)} placeholder="Local registry address (0x…)" /><button className="primary-button" type="button" onClick={() => void publishPassport()} disabled={busy || !registry}>Publish locally</button></div>{passport.onChain ? <p className="runner-status">Published on chain {passport.onChain.chainId}: <code>{passport.onChain.transactionHash}</code></p> : null}</> : passportEligible ? <button className="primary-button" type="button" onClick={() => void generatePassport()} disabled={busy}>Generate Passport</button> : <p className="empty-copy">Run the Monad runtime profile before generating a Passport.</p>}</section> : null}
    </div></main>;
}

function BugIcon() { return <Bug size={14} aria-hidden="true" />; }
