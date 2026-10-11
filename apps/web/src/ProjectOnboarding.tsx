import { useEffect, useMemo, useState } from 'react';

import type { ProjectSnapshot } from '@crucible/core';
import type { RunResult, Scenario } from '@crucible/core';
import type { Diagnosis, RuntimeRemediation } from '@crucible/ai';
import type { RuntimeReplaySummary } from '@crucible/core';
import { RuntimeFlow } from './RuntimeFlow.js';

type SavedProject = { id: string; name: string; runnerUrl: string; connectedAt?: string };
const STORAGE_KEY = 'crucible.projects.v1';

function loadProjects(): SavedProject[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as SavedProject[]; } catch { return []; }
}

export function ProjectOnboarding() {
  const [projects, setProjects] = useState<SavedProject[]>(loadProjects);
  const [name, setName] = useState('');
  const [runnerUrl, setRunnerUrl] = useState('http://127.0.0.1:8787');
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [selectedContract, setSelectedContract] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [contract, setContract] = useState('');
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

  async function connect(url = runnerUrl, projectName = name) {
    setBusy(true); setStatus('Connecting to the local runner…');
    try {
      const base = url.replace(/\/$/, '');
      const health = await fetch(`${base}/health`);
      if (!health.ok) throw new Error(`Runner returned ${health.status}.`);
      const response = await fetch(`${base}/project`);
      if (!response.ok) throw new Error(`Repository detection returned ${response.status}.`);
      const next = await response.json() as ProjectSnapshot;
      setSnapshot(next); setStatus(`Connected. Detected ${next.project.name}.`);
      const project = { id: `${base}:${next.project.root}`, name: projectName.trim() || next.project.name, runnerUrl: base, connectedAt: new Date().toISOString() };
      save([project, ...projects.filter((item) => item.id !== project.id)]);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to connect. Start `crucible connect` first.'); }
    finally { setBusy(false); }
  }

  async function compile() {
    setBusy(true); setStatus('Compiling the journey against the detected ABI…');
    try {
      const response = await fetch(`${runnerUrl.replace(/\/$/, '')}/journeys/compile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name.trim() || 'manual-journey', contract, call, assertion, callArgs: callArgs ? callArgs.split(',').map((item) => item.trim()) : [], assertionArgs: assertionArgs ? assertionArgs.split(',').map((item) => item.trim()) : [], expected: expected || undefined, source: sourceFile ? { file: sourceFile } : undefined }) });
      const payload = await response.json() as { scenario?: Scenario; error?: string };
      if (!response.ok || !payload.scenario) throw new Error(payload.error ?? `Journey compiler returned ${response.status}.`);
      setCompiled(payload.scenario); setRunResult(null); setStatus('Journey compiled and validated.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to compile journey.'); }
    finally { setBusy(false); }
  }

  async function run() {
    if (!compiled) return;
    setBusy(true); setStatus(runMode === 'local' ? 'Running local verification on a fresh Anvil chain…' : 'Running guarded Monad Testnet preflight…');
    try {
      const response = await fetch(`${runnerUrl.replace(/\/$/, '')}/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: runMode, confirmed: confirmTestnet, scenario: compiled }) });
      const payload = await response.json() as { result?: RunResult; error?: string; message?: string };
      if (!response.ok || !payload.result) throw new Error(payload.message ?? payload.error ?? `Runner returned ${response.status}.`);
      const next = payload.result;
      if (next.status === 'failed' && !beforeRun) setBeforeRun(next);
      setRunResult(next); setSelectedNode(next.nodes[0]?.id ?? ''); setStatus(next.status === 'passed' ? 'Verification passed.' : 'Verification finished with findings.');
      if (next.status === 'failed') {
        const diagnosisResponse = await fetch(`${runnerUrl.replace(/\/$/, '')}/diagnose`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runResult: next, scenario: compiled }) });
        const diagnosisPayload = await diagnosisResponse.json() as { diagnosis?: Diagnosis; source?: string };
        if (diagnosisPayload.diagnosis) {
          setDiagnosis(diagnosisPayload.diagnosis);
          const finding = next.runtimeVerification?.findings.find((item) => item.status === 'failed');
          if (finding) {
            const remediationResponse = await fetch(`${runnerUrl.replace(/\/$/, '')}/remediate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ finding, scenario: compiled }) });
            const remediationPayload = await remediationResponse.json() as { remediation?: RuntimeRemediation };
            if (remediationPayload.remediation) setRemediation(remediationPayload.remediation);
          }
        }
      } else if (beforeRun?.status === 'failed') {
        const replayResponse = await fetch(`${runnerUrl.replace(/\/$/, '')}/replay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ beforeRun, afterRun: next, scenario: compiled }) });
        if (replayResponse.ok) setReplay(await replayResponse.json() as RuntimeReplaySummary);
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Unable to run verification.'); }
    finally { setBusy(false); }
  }

  return <main className="project-workspace">
    <div className="project-hero"><div><p className="eyebrow">CRUCIBLE / PROJECTS</p><h1>Bring a repository into Crucible</h1><p className="lede">Connect the local runner that can inspect your Foundry repository. Crucible never guesses a contract or runs arbitrary commands from this page.</p></div><a className="secondary-button" href="/">Open demo viewer</a></div>
    <section className="onboarding-grid">
      <div className="panel onboarding-card"><p className="eyebrow">STEP 1 / CREATE PROJECT</p><h2>Connect a local repository</h2><p className="panel-subtitle">Run <code>crucible connect --root /path/to/repo</code> in the repository you want to verify.</p><label>Project name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="My Monad app" /></label><label>Local runner URL<input value={runnerUrl} onChange={(event) => setRunnerUrl(event.target.value)} /></label><button className="primary-button" type="button" onClick={() => void connect()} disabled={busy}>{busy ? 'Connecting…' : 'Connect & detect repository'}</button>{status ? <p className="runner-status" role="status">{status}</p> : null}</div>
      <div className="panel onboarding-card"><p className="eyebrow">SAVED PROJECTS</p><h2>Your projects</h2>{projects.length ? <div className="saved-projects">{projects.map((project) => <button className="saved-project" key={project.id} type="button" onClick={() => { setName(project.name); setRunnerUrl(project.runnerUrl); void connect(project.runnerUrl, project.name); }}><span className="project-dot" /><span><strong>{project.name}</strong><small>{project.runnerUrl}</small></span><span>→</span></button>)}</div> : <p className="empty-copy">No repositories connected yet.</p>}</div>
    </section>
    {snapshot ? <section className="panel detection-panel"><div className="panel-heading"><div><p className="eyebrow">STEP 2 / REPOSITORY DETECTION</p><h2>{snapshot.project.name}</h2><p className="panel-subtitle"><code>{snapshot.project.root}</code></p></div><span className={`status-badge ${snapshot.detection.status === 'SUPPORTED' ? 'passed' : snapshot.detection.status === 'UNSUPPORTED_TOOLCHAIN' ? 'failed' : 'skipped'}`}>{snapshot.detection.status.replaceAll('_', ' ')}</span></div><div className="detection-grid"><div><span>Toolchain</span><strong>{snapshot.detection.toolchain.foundry.detected ? 'Foundry detected' : 'Foundry not detected'}</strong></div><div><span>Artifacts</span><strong>{snapshot.detection.artifacts.candidates.length} candidates</strong></div><div><span>Scenarios</span><strong>{snapshot.detection.scenarios.candidates.length} found</strong></div><div><span>Next step</span><strong>{snapshot.detection.nextSteps[0]}</strong></div></div><p className="panel-subtitle">{snapshot.detection.summary}</p></section> : null}
    {snapshot ? <section className="panel contract-panel"><div className="panel-heading"><div><p className="eyebrow">STEP 3 / CONTRACT EXPLORER</p><h2>Compiled application contracts</h2><p className="panel-subtitle">Only functions read from compiled artifacts are shown.</p></div></div>{snapshot.contracts.length ? <div className="contract-explorer"><div className="contract-list">{snapshot.contracts.map((contract) => <button className={`contract-item ${activeContract?.name === contract.name ? 'selected' : ''}`} key={contract.name} type="button" onClick={() => setSelectedContract(contract.name)}><strong>{contract.name}</strong><small>{contract.functions.length} functions · {contract.selectionReason}</small></button>)}</div><div className="abi-list">{activeContract ? <>{<h3>{activeContract.name}</h3>}{activeContract.functions.map((fn) => <div className="abi-row" key={`${fn.name}-${fn.stateMutability}`}><strong>{fn.name}</strong><span>{fn.stateMutability}</span><small>({fn.inputs.map((input) => `${input.name}: ${input.type}`).join(', ') || 'no inputs'})</small></div>)}</> : null}</div></div> : <div className="empty-state"><strong>Contract explorer is waiting for compiled artifacts.</strong><p>{snapshot.contractExplorer.reason ?? 'Run forge build, then reconnect the project.'}</p></div>}</section> : null}
    {snapshot?.contracts.length ? <section className="panel journey-builder"><div className="panel-heading"><div><p className="eyebrow">STEP 4 / MANUAL JOURNEY BUILDER</p><h2>Describe the user journey</h2><p className="panel-subtitle">Choose one write action and one read assertion. Crucible compiles this into a validated scenario before it runs.</p></div><span className="status-badge skipped">{runMode === 'local' ? 'LOCAL MODE' : 'TESTNET GUARD'}</span></div><div className="builder-grid"><label>Contract<select value={contract} onChange={(event) => setContract(event.target.value)}>{snapshot.contracts.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><label>Write function<select value={call} onChange={(event) => setCall(event.target.value)}>{activeContract?.functions.filter((fn) => fn.stateMutability !== 'view' && fn.stateMutability !== 'pure').map((fn) => <option key={fn.name} value={fn.name}>{fn.name}</option>)}</select></label><label>Read assertion<select value={assertion} onChange={(event) => setAssertion(event.target.value)}>{activeContract?.functions.filter((fn) => fn.stateMutability === 'view' || fn.stateMutability === 'pure').map((fn) => <option key={fn.name} value={fn.name}>{fn.name}</option>)}</select></label><label>Write args<input value={callArgs} onChange={(event) => setCallArgs(event.target.value)} placeholder="alice, 1" /></label><label>Assertion args<input value={assertionArgs} onChange={(event) => setAssertionArgs(event.target.value)} placeholder="0" /></label><label>Expected value<input value={expected} onChange={(event) => setExpected(event.target.value)} placeholder="optional" /></label><label>Execution mode<select value={runMode} onChange={(event) => setRunMode(event.target.value as 'local' | 'testnet')}><option value="local">Local / fresh Anvil</option><option value="testnet">Monad Testnet / guarded</option></select></label><label className="source-field">Source file (optional)<input value={sourceFile} onChange={(event) => setSourceFile(event.target.value)} placeholder="src/MyContract.sol" /></label></div>{runMode === 'testnet' ? <label className="confirm-testnet"><input type="checkbox" checked={confirmTestnet} onChange={(event) => setConfirmTestnet(event.target.checked)} /> I understand confirmed mode can deploy and spend testnet gas.</label> : null}<div className="builder-actions"><button className="primary-button" type="button" onClick={() => void compile()} disabled={busy || !call || !assertion}>Compile journey</button>{compiled ? <button className="secondary-button" type="button" onClick={() => void run()} disabled={busy || (runMode === 'testnet' && !confirmTestnet)}>{busy ? 'Running…' : runMode === 'local' ? 'Run verification' : 'Run guarded testnet'}</button> : null}<span className="builder-note">{compiled ? `Validated scenario: ${compiled.name}` : 'No scenario compiled yet.'}</span></div></section> : null}
    {runResult ? <section className="panel live-run-panel"><div className="panel-heading"><div><p className="eyebrow">STEP 5 / LIVE VERIFICATION</p><h2>{runResult.status === 'passed' ? 'Journey passed' : 'Journey needs attention'}</h2><p className="panel-subtitle">{runResult.network.name} · {runResult.summary.passed} passed · {runResult.summary.failed} failed · {runResult.summary.skipped} skipped</p></div><span className={`status-badge ${runResult.status}`}>{runResult.status}</span></div><div className="live-run-grid"><div className="runtime-flow-canvas"><RuntimeFlow result={runResult} journeyId="" view="technical" selectedNodeId={selectedNode} selectedFindingId="" onSelect={(nodeId) => setSelectedNode(nodeId)} /></div><div className="panel live-inspector"><p className="eyebrow">INSPECTOR</p>{runResult.nodes.filter((node) => node.id === selectedNode)[0] ? <><h3>{selectedNode}</h3><span className={`status-badge ${runResult.nodes.find((node) => node.id === selectedNode)?.status}`}>{runResult.nodes.find((node) => node.id === selectedNode)?.status}</span><dl><dt>Duration</dt><dd>{runResult.nodes.find((node) => node.id === selectedNode)?.durationMs}ms</dd><dt>Source</dt><dd>{runResult.nodes.find((node) => node.id === selectedNode)?.source?.file ?? 'Source mapping unavailable'}</dd></dl>{runResult.nodes.find((node) => node.id === selectedNode)?.error ? <div className="failure"><strong>Execution error</strong><p>{runResult.nodes.find((node) => node.id === selectedNode)?.error?.message}</p></div> : null}</> : <p className="empty-copy">Select a node in the live trace.</p>}</div></div></section> : null}
    {diagnosis ? <section className="panel intelligence-panel"><div className="panel-heading"><div><p className="eyebrow">STEP 6 / RUNTIME INTELLIGENCE</p><h2>Evidence-bound diagnosis</h2><p className="panel-subtitle">The suggestion is constrained to values present in this run; it is not an automatic code change.</p></div><span className="status-badge skipped">AI SUGGESTED</span></div><div className="diagnosis-grid"><div><span className="diagnosis-label">Root cause</span><p>{diagnosis.rootCause}</p></div><div><span className="diagnosis-label">Evidence</span><ul className="evidence-list">{diagnosis.evidence.map((item) => <li key={`${item.nodeId}-${item.field}`}><code>{item.nodeId}.{item.field}</code> = {item.value}</li>)}</ul></div><div><span className="diagnosis-label">Suggested fix</span><p>{diagnosis.suggestedFix}</p></div><div><span className="diagnosis-label">Follow-up tests</span><ul className="evidence-list">{diagnosis.followUpTests.map((item) => <li key={item}>{item}</li>)}</ul></div></div>{remediation ? <div className="remediation-note"><strong>Suggested remediation · {Math.round(remediation.confidence * 100)}%</strong><p>{remediation.remediation}</p><code>{remediation.suggestedDiff}</code></div> : null}</section> : null}
    {replay ? <section className="replay-proof live-replay"><div><p className="eyebrow">STEP 7 / VERIFIED REPLAY</p><h2>Before/after proof confirmed</h2><p>The same compiled scenario changed from failed to passed under the same deterministic verification contract.</p></div><div className="replay-proof-grid"><span>Before<strong>{replay.beforeRunId}</strong></span><span>After<strong>{replay.afterRunId}</strong></span><span>Recovered<strong>{replay.diffSummary.recoveredJourneys.length} journey</strong></span><span className="success-text">✓ Runtime Verified</span></div></section> : null}
  </main>;
}
