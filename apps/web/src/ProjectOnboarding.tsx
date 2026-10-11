import { useEffect, useMemo, useState } from 'react';

import type { ProjectSnapshot } from '@crucible/core';

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

  const activeContract = useMemo(() => snapshot?.contracts.find((contract) => contract.name === selectedContract) ?? snapshot?.contracts[0], [selectedContract, snapshot]);

  useEffect(() => { if (!selectedContract && snapshot?.contracts[0]) setSelectedContract(snapshot.contracts[0].name); }, [selectedContract, snapshot]);
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

  return <main className="project-workspace">
    <div className="project-hero"><div><p className="eyebrow">CRUCIBLE / PROJECTS</p><h1>Bring a repository into Crucible</h1><p className="lede">Connect the local runner that can inspect your Foundry repository. Crucible never guesses a contract or runs arbitrary commands from this page.</p></div><a className="secondary-button" href="/">Open demo viewer</a></div>
    <section className="onboarding-grid">
      <div className="panel onboarding-card"><p className="eyebrow">STEP 1 / CREATE PROJECT</p><h2>Connect a local repository</h2><p className="panel-subtitle">Run <code>crucible connect --root /path/to/repo</code> in the repository you want to verify.</p><label>Project name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="My Monad app" /></label><label>Local runner URL<input value={runnerUrl} onChange={(event) => setRunnerUrl(event.target.value)} /></label><button className="primary-button" type="button" onClick={() => void connect()} disabled={busy}>{busy ? 'Connecting…' : 'Connect & detect repository'}</button>{status ? <p className="runner-status" role="status">{status}</p> : null}</div>
      <div className="panel onboarding-card"><p className="eyebrow">SAVED PROJECTS</p><h2>Your projects</h2>{projects.length ? <div className="saved-projects">{projects.map((project) => <button className="saved-project" key={project.id} type="button" onClick={() => { setName(project.name); setRunnerUrl(project.runnerUrl); void connect(project.runnerUrl, project.name); }}><span className="project-dot" /><span><strong>{project.name}</strong><small>{project.runnerUrl}</small></span><span>→</span></button>)}</div> : <p className="empty-copy">No repositories connected yet.</p>}</div>
    </section>
    {snapshot ? <section className="panel detection-panel"><div className="panel-heading"><div><p className="eyebrow">STEP 2 / REPOSITORY DETECTION</p><h2>{snapshot.project.name}</h2><p className="panel-subtitle"><code>{snapshot.project.root}</code></p></div><span className={`status-badge ${snapshot.detection.status === 'SUPPORTED' ? 'passed' : snapshot.detection.status === 'UNSUPPORTED_TOOLCHAIN' ? 'failed' : 'skipped'}`}>{snapshot.detection.status.replaceAll('_', ' ')}</span></div><div className="detection-grid"><div><span>Toolchain</span><strong>{snapshot.detection.toolchain.foundry.detected ? 'Foundry detected' : 'Foundry not detected'}</strong></div><div><span>Artifacts</span><strong>{snapshot.detection.artifacts.candidates.length} candidates</strong></div><div><span>Scenarios</span><strong>{snapshot.detection.scenarios.candidates.length} found</strong></div><div><span>Next step</span><strong>{snapshot.detection.nextSteps[0]}</strong></div></div><p className="panel-subtitle">{snapshot.detection.summary}</p></section> : null}
    {snapshot ? <section className="panel contract-panel"><div className="panel-heading"><div><p className="eyebrow">STEP 3 / CONTRACT EXPLORER</p><h2>Compiled application contracts</h2><p className="panel-subtitle">Only functions read from compiled artifacts are shown.</p></div></div>{snapshot.contracts.length ? <div className="contract-explorer"><div className="contract-list">{snapshot.contracts.map((contract) => <button className={`contract-item ${activeContract?.name === contract.name ? 'selected' : ''}`} key={contract.name} type="button" onClick={() => setSelectedContract(contract.name)}><strong>{contract.name}</strong><small>{contract.functions.length} functions · {contract.selectionReason}</small></button>)}</div><div className="abi-list">{activeContract ? <>{<h3>{activeContract.name}</h3>}{activeContract.functions.map((fn) => <div className="abi-row" key={`${fn.name}-${fn.stateMutability}`}><strong>{fn.name}</strong><span>{fn.stateMutability}</span><small>({fn.inputs.map((input) => `${input.name}: ${input.type}`).join(', ') || 'no inputs'})</small></div>)}</> : null}</div></div> : <div className="empty-state"><strong>Contract explorer is waiting for compiled artifacts.</strong><p>{snapshot.contractExplorer.reason ?? 'Run forge build, then reconnect the project.'}</p></div>}</section> : null}
  </main>;
}
