import { useEffect, useMemo, useState } from 'react';

import { validateDiagnosisForResult, type Diagnosis } from '@crucible/ai';
import { findingsForJourney, replaySequence, runtimeFindings, runtimeJourneys, validateResult, type RunResult } from './viewer.js';
import { RuntimeFlow } from './RuntimeFlow.js';
import { ProjectOnboarding } from './ProjectOnboarding.js';
import { PublicApp } from './PublicApp.js';
import { selectAppSurface } from './app-surface.js';
import { isPublicDemoRoute } from './public-route.js';
import { AlertCircle, Bug, FolderGit2, History, LayoutDashboard, ShieldCheck } from 'lucide-react';

const fixtures = [
  { label: 'Monad runtime vulnerable', file: '/results/monad-runtime-vulnerable.json' },
  { label: 'Monad runtime fixed', file: '/results/monad-runtime-fixed.json' },
  { label: 'Buggy mint', file: '/results/buggy-mint.json' },
  { label: 'Happy path', file: '/results/happy-path.json' },
  { label: 'ERC-721 mint', file: '/results/erc721-happy.json' },
  { label: 'Skipped node', file: '/results/skipped.json' },
  { label: 'Malformed', file: '/results/malformed.json' }
];

const journeyMeta: Record<string, { title: string; flow: string; description: string }> = {
  'new-user-purchase': { title: 'New User Purchase', flow: 'Fund → Purchase → Settlement', description: 'Test how a first-time user moves from funding to their first purchase.' },
  settlement: { title: 'Settlement', flow: 'Transaction → Finality → Release', description: 'Verify that irreversible release waits for the right transaction assurance.' },
  auction: { title: 'Auction', flow: 'Bid → Next Block → Resolve', description: 'Check that time-sensitive bidding remains deterministic across blocks.' }
};

const debugMode = new URLSearchParams(window.location.search).get('debug') === '1';
const demoMode = new URLSearchParams(window.location.search).get('demo') === '1';
const publicDemoRoute = isPublicDemoRoute(window.location.pathname, window.location.search);
const appSurface = selectAppSurface(__CRUCIBLE_BUILD_MODE__, publicDemoRoute || debugMode || demoMode);

function journeyLabel(id: string) { return journeyMeta[id]?.title ?? id.replaceAll('-', ' '); }
function formatDate(value: string) { return new Date(value).toLocaleString(); }
function findingTitle(ruleId: string) {
  if (ruleId === 'MND-FUND-001') return 'Your first purchase can fail';
  if (ruleId === 'MND-FINALITY-001') return 'A release can happen too early';
  if (ruleId === 'MND-TIME-001') return 'Auction timing can become ambiguous';
  return 'Runtime condition needs attention';
}
function whyMonad(ruleId: string) {
  if (ruleId === 'MND-FUND-001') return 'Monad separates transaction ordering from execution. A newly funded account must wait for the required safe block distance before its first dependent action.';
  if (ruleId === 'MND-FINALITY-001') return 'Consensus assurance and execution are pipelined. An irreversible release should wait until the required assurance level is reached.';
  if (ruleId === 'MND-TIME-001') return 'Blocks are ordered linearly, but applications should not assume every adjacent block has a distinct timestamp for time-sensitive decisions.';
  return 'The observed runtime evidence did not meet the rule contract.';
}

function statusIcon(status: string) { return status === 'passed' ? '✓' : status === 'failed' ? '×' : '—'; }

export function App() {
  if (appSurface === 'public') return <PublicApp />;
  if (appSurface === 'local') return <><ProjectOnboarding /></>;
  const [fixture, setFixture] = useState(debugMode ? fixtures[2].file : fixtures[0].file);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [replayMessage, setReplayMessage] = useState('');
  const [graphView, setGraphView] = useState<'business' | 'technical' | 'runtime'>('business');
  const [selectedJourney, setSelectedJourney] = useState('');
  const [selectedFindingId, setSelectedFindingId] = useState('');
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [diagnosisError, setDiagnosisError] = useState('');
  const [diagnosisSource, setDiagnosisSource] = useState<'live' | 'fallback' | null>(null);
  const [verificationStarted, setVerificationStarted] = useState(false);
  const [suggestedFixVisible, setSuggestedFixVisible] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError(''); setSelectedId(''); setReplayIndex(null); setReplayMessage(''); setGraphView('business'); setSelectedJourney(''); setSelectedFindingId(''); setDiagnosis(null); setDiagnosisError(''); setDiagnosisSource(null); setSuggestedFixVisible(false);
    fetch(fixture, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(`Fixture not found (${response.status}).`); return response.json(); })
      .then((value) => { const parsed = validateResult(value); setResult(parsed); setSelectedId(parsed.nodes[0]?.id ?? ''); const journeys = runtimeJourneys(parsed); setSelectedJourney(journeys[0] ?? ''); setSelectedFindingId(runtimeFindings(parsed)[0]?.findingId ?? ''); setVerificationStarted(!parsed.runtimeVerification); })
      .catch((reason: unknown) => { if (reason instanceof DOMException && reason.name === 'AbortError') return; setError(reason instanceof Error ? reason.message : 'Unable to load verification.'); });
    return () => controller.abort();
  }, [fixture]);

  useEffect(() => {
    if (!result || result.status !== 'failed' || result.scenario !== 'token-buggy-mint') return;
    const controller = new AbortController();
    let active = true;
    const loadDiagnosis = async () => {
      try {
        const scenarioResponse = await fetch('/scenarios/buggy-mint.json', { signal: controller.signal });
        if (!scenarioResponse.ok) throw new Error('Scenario not found.');
        const liveResponse = await fetch('/api/diagnose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runResult: result, scenario: await scenarioResponse.json() }), signal: controller.signal });
        if (!liveResponse.ok) throw new Error(`Live AI unavailable (${liveResponse.status}).`);
        const payload = await liveResponse.json() as { diagnosis?: unknown };
        if (!payload.diagnosis) throw new Error('Live AI returned no diagnosis.');
        const parsed = validateDiagnosisForResult(payload.diagnosis, result);
        if (active) { setDiagnosis(parsed); setDiagnosisSource('live'); setDiagnosisError(''); }
        return;
      } catch (reason: unknown) { if (reason instanceof DOMException && reason.name === 'AbortError') return; }
      try {
        const response = await fetch('/diagnosis/buggy-mint.json', { signal: controller.signal });
        if (!response.ok) throw new Error(`Diagnosis cache not found (${response.status}).`);
        const parsed = validateDiagnosisForResult(await response.json(), result);
        if (active) { setDiagnosis(parsed); setDiagnosisSource('fallback'); setDiagnosisError(''); }
      } catch (reason: unknown) { if (reason instanceof DOMException && reason.name === 'AbortError') return; if (active) setDiagnosisError(reason instanceof Error ? reason.message : 'AI diagnosis unavailable.'); }
    };
    void loadDiagnosis();
    return () => { active = false; controller.abort(); };
  }, [result]);

  useEffect(() => {
    if (replayIndex === null || !result) return;
    const replayIds = replaySequence(result.nodes); const node = result.nodes.find((item) => item.id === replayIds[replayIndex]);
    if (!node) { setReplayIndex(null); return; }
    setSelectedId(node.id);
    if (node.status === 'failed') { setReplayIndex(null); setReplayMessage(`Replay stopped at failure: ${node.id}`); return; }
    if (replayIndex === replayIds.length - 1) { setReplayIndex(null); setReplayMessage('Replay complete.'); return; }
    const timer = window.setTimeout(() => setReplayIndex((current) => current === null ? null : current + 1), 650);
    return () => window.clearTimeout(timer);
  }, [replayIndex, result]);

  const findings = result ? runtimeFindings(result) : [];
  const journeys = result ? runtimeJourneys(result) : [];
  const selectedFinding = findings.find((finding) => finding.findingId === selectedFindingId) ?? findings[0];
  const selectedNode = result?.nodes.find((node) => node.id === selectedId) ?? result?.nodes[0];
  const activeMeta = journeyMeta[selectedJourney] ?? journeyMeta['new-user-purchase'];
  const failedCount = findings.filter((finding) => finding.status === 'failed').length;
  const passedCount = findings.filter((finding) => finding.status === 'passed').length;
  const passedJourneyCount = journeys.filter((journey) => {
    const journeyFindings = result ? findingsForJourney(result, journey) : [];
    return journeyFindings.length > 0 && journeyFindings.every((finding) => finding.status === 'passed');
  }).length;
  const isRuntime = result?.runtimeVerification?.profile === 'monad-core';
  const environmentLabel = result?.network.name === 'monad-fixture' ? 'Deterministic Fixture' : result?.network.name ?? 'Local';

  function startJourney(journeyId: string) { setSelectedJourney(journeyId); const first = findingsForJourney(result as RunResult, journeyId)[0]; setSelectedFindingId(first?.findingId ?? ''); setVerificationStarted(true); }
  function startReplay() { if (!result?.nodes.length) return; setReplayMessage('Replay running…'); setReplayIndex(0); }
  function showFixedFixture() { setFixture('/results/monad-runtime-fixed.json'); setVerificationStarted(true); }
  async function downloadCertificate() {
    if (result?.scenario !== 'token-buggy-mint') { setDiagnosisError('Offline certificate is only available for Buggy mint.'); return; }
    const response = await fetch('/certificate/buggy-mint.json'); if (!response.ok) { setDiagnosisError(`Certificate fixture not found (${response.status}).`); return; }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'crucible-certificate-buggy-mint.json'; anchor.click(); URL.revokeObjectURL(url);
  }

  function renderInspector() {
    if (selectedFinding) {
      const evidence = selectedFinding.evidence;
      return <>
        <p className="eyebrow">ISSUE / {selectedFinding.ruleId}</p>
        <h2>{findingTitle(selectedFinding.ruleId)}</h2>
        <span className={`status-badge ${selectedFinding.status}`}>{statusIcon(selectedFinding.status)} {selectedFinding.status}</span>
        <section className="inspector-section"><span className="inspector-label">User impact</span><p>{selectedFinding.userImpact ?? selectedFinding.summary}</p></section>
        <section className="inspector-section"><span className="inspector-label">What happened</span><p>{selectedFinding.summary}</p></section>
        <section className="inspector-section"><span className="inspector-label">Why this happens on Monad</span><p>{whyMonad(selectedFinding.ruleId)}</p></section>
        <section className="inspector-section"><span className="inspector-label">Runtime evidence</span><div className="evidence-grid">{evidence.map((item, index) => <div className="evidence-item" key={`${selectedFinding.findingId}-${index}`}><span>{item.type}</span><strong>{typeof item.observed === 'object' ? JSON.stringify(item.observed) : String(item.observed)}</strong><small>{item.blockNumber ? `Block ${item.blockNumber}` : item.assuranceLevel ? `Assurance: ${item.assuranceLevel}` : item.source}</small></div>)}</div><p className="rule-caption">Rule <code>{selectedFinding.ruleId}</code> · expected <code>{typeof selectedFinding.expected === 'object' ? JSON.stringify(selectedFinding.expected) : String(selectedFinding.expected)}</code></p></section>
        <section className="inspector-section suggested-fix"><span className="inspector-label">Suggested fix</span><p>{selectedFinding.status === 'failed' ? 'Wait for the required runtime condition, then execute the same journey again.' : 'No change required for this check.'}</p>{selectedFinding.status === 'failed' ? <div className="inspector-actions"><button className="primary-button" type="button" onClick={() => setSuggestedFixVisible(true)}>Suggest fix</button><button className="secondary-button" type="button" onClick={showFixedFixture}>Test this fix</button></div> : null}{suggestedFixVisible ? <div className="fix-note">Suggested change: add the runtime guard before the dependent action. Crucible will verify the result through replay; it does not apply code changes automatically.</div> : null}</section>
        <details className="technical-details"><summary>Technical details</summary><dl><dt>Journey</dt><dd>{journeyLabel(selectedFinding.journeyId)}</dd><dt>Node</dt><dd>{selectedFinding.nodeId}</dd><dt>Observed</dt><dd>{JSON.stringify(selectedFinding.observed)}</dd><dt>Source</dt><dd>{selectedNode?.source ? `${selectedNode.source.file}${selectedNode.source.lineStart ? `:${selectedNode.source.lineStart}` : ''}` : 'Source mapping unavailable'}</dd></dl></details>
      </>;
    }
    if (selectedNode) return <><p className="eyebrow">STEP DETAIL</p><h2>{selectedNode.id}</h2><span className={`status-badge ${selectedNode.status}`}>{statusIcon(selectedNode.status)} {selectedNode.status}</span><dl><dt>Duration</dt><dd>{selectedNode.durationMs}ms</dd><dt>Transaction</dt><dd>{selectedNode.txHash ? (result?.network.explorerUrl ? <a href={`${result.network.explorerUrl}/tx/${selectedNode.txHash}`} target="_blank" rel="noreferrer">{selectedNode.txHash.slice(0, 12)}…</a> : selectedNode.txHash) : '—'}</dd><dt>Source</dt><dd>{selectedNode.source ? `${selectedNode.source.file}${selectedNode.source.lineStart ? `:${selectedNode.source.lineStart}` : ''}` : 'Source mapping unavailable'}</dd></dl>{selectedNode.error ? <div className="failure"><strong>{selectedNode.error.kind}</strong><p>{selectedNode.error.message}</p></div> : null}</>;
    return <><p className="eyebrow">YOUR JOURNEY</p><h2>Select a step</h2><p className="empty-copy">Choose a journey step to see its runtime evidence.</p></>;
  }

  return <>
    {publicDemoRoute ? <section className="public-demo-banner" aria-labelledby="public-demo-title">
      <div>
        <p className="eyebrow">INTERACTIVE DEMO</p>
        <h1 id="public-demo-title">See a deterministic runtime verification story.</h1>
        <p>Deterministic fixture · No repository connected</p>
      </div>
      <a className="secondary-button" href="/">Back to Crucible</a>
    </section> : null}
    <main className="shell">
    <aside className="sidebar" aria-label="Crucible navigation"><div className="brand-lockup"><div className="brand-mark">C</div><div><strong>CRUCIBLE</strong><span>Runtime verification</span></div></div><nav className="side-nav"><a className="active" href="#journeys"><LayoutDashboard size={16} aria-hidden="true" />Journeys</a><a href="/"><FolderGit2 size={16} aria-hidden="true" />Projects</a><a href="#issues"><AlertCircle size={16} aria-hidden="true" />Issues{failedCount ? <b>{failedCount}</b> : null}</a><a href="#replay"><History size={16} aria-hidden="true" />Replay</a><a href="#passport"><ShieldCheck size={16} aria-hidden="true" />Passport</a></nav><div className="sidebar-bottom"><div className="sidebar-label">CURRENT RUN</div><div className="project-card"><span className="project-dot" />{environmentLabel}<strong>{result?.scenario ?? 'No run selected'}</strong></div><a className="sidebar-demo-link" href="?debug=1"><Bug size={13} aria-hidden="true" />Developer fixtures</a></div></aside>
    <div className="workspace"><header className="topbar"><div><p className="eyebrow">CRUCIBLE / MONAD RUNTIME VERIFICATION</p><h1>Verify your Monad app</h1><p className="lede">Test real user journeys and see where they break before your users do.</p></div><div className="topbar-actions"><span className={`environment-badge ${result?.network.name === 'monad-fixture' ? 'fixture' : 'live'}`}><span />{environmentLabel}</span>{debugMode ? <label className="fixture-picker">Developer fixture<select value={fixture} onChange={(event) => setFixture(event.target.value)}>{fixtures.map((item) => <option key={item.file} value={item.file}>{item.label}</option>)}</select></label> : <a className="debug-link" href={`${window.location.pathname}?debug=1`}>Developer fixtures</a>}</div></header>
      {error ? <section className="error-card" role="alert"><strong>We couldn't load this verification result.</strong><p>The result does not match the Crucible RunResult schema.</p><details><summary>View technical details</summary><code>{error}</code></details><a className="secondary-button" href={window.location.pathname}>Try another run</a></section> : null}
      {!error && !result ? <section className="state-card" aria-live="polite">Loading verification…</section> : null}
      {result && isRuntime && !verificationStarted ? <section className="journey-landing" id="journeys"><div className="section-intro"><p className="eyebrow">STEP 1 / CHOOSE A JOURNEY</p><h2>What do you want to verify?</h2><p>Start with a real user flow. Crucible will show exactly where it breaks under Monad runtime checks.</p></div><div className="journey-cards">{journeys.map((journey) => { const journeyFindings = findingsForJourney(result, journey); const failed = journeyFindings.some((finding) => finding.status === 'failed'); return <article className={`journey-card ${selectedJourney === journey ? 'selected' : ''}`} key={journey}><div className="journey-card-top"><span className={`status-dot-large ${failed ? 'failed' : 'passed'}`} /> <span className={`small-status ${failed ? 'failed' : 'passed'}`}>{failed ? 'Needs attention' : 'Ready'}</span></div><h3>{journeyLabel(journey)}</h3><p>{journeyMeta[journey]?.description}</p><strong className="journey-flow">{journeyMeta[journey]?.flow}</strong><div className="journey-card-foot"><span>{journeyFindings.length} Monad checks</span><button className="primary-button" type="button" onClick={() => startJourney(journey)}>Run journey</button></div></article>; })}</div></section> : null}
      {result && (!isRuntime || verificationStarted) ? <>
        {isRuntime ? <section className="journey-header" id="journeys"><div><p className="eyebrow">STEP 2 / VERIFY JOURNEY</p><h2>{activeMeta.title}</h2><p>{activeMeta.description}</p></div><div className="journey-header-actions"><span className={`environment-badge ${result.network.name === 'monad-fixture' ? 'fixture' : 'live'}`}><span />{environmentLabel} · Chain {result.network.chainId}</span><button className="primary-button" type="button" onClick={() => setVerificationStarted(true)}>Run verification</button></div></section> : <section className="journey-header" id="journeys"><div><p className="eyebrow">DEVELOPER FIXTURE</p><h2>{fixtures.find((item) => item.file === fixture)?.label ?? result.scenario}</h2><p>Inspect this generic execution result. Use Monad runtime fixtures for the guided verification workflow.</p></div></section>}
        {isRuntime ? <section className="verification-summary"><div><span>Monad checks</span><strong>{passedCount} / {findings.length} passed</strong></div><div><span>Blocking issues</span><strong>{failedCount || '0'}</strong></div><div><span>Journey status</span><strong className={result.status}>{result.status === 'passed' ? 'Verified' : 'Needs fix'}</strong></div></section> : null}
        {result.status === 'passed' && result.verifiedReplay ? <section className="replay-proof" id="replay"><div><p className="eyebrow">STEP 6 / VERIFIED REPLAY</p><h2>Fix verified</h2><p>The same user journey now passes under the same Monad runtime checks.</p></div><div className="replay-proof-grid"><span>Before<strong>{result.verifiedReplay.beforeRunId}</strong></span><span>After<strong>{result.verifiedReplay.afterRunId}</strong></span><span>Recovered<strong>{result.verifiedReplay.diffSummary.recoveredJourneys.length} journeys</strong></span><span className="success-text">✓ Runtime Verified</span></div></section> : null}
        {result.runtimeVerification?.profile === 'monad-core' && result.runtimeVerification.findings.length > 0 && result.runtimeVerification.findings.every((finding) => finding.status === 'passed') ? <section className="passport-card" id="passport"><div><p className="eyebrow">STEP 7 / RUNTIME PASSPORT</p><h2>Your app passed the Monad runtime suite</h2><p>This exact application version passed this exact Crucible verification suite.</p></div><div className="passport-meta"><span>Journeys<strong>{passedJourneyCount} / {journeys.length} passed</strong></span><span>Rules<strong>{passedCount} / {findings.length} passed</strong></span><span className="success-text">Eligible</span><button className="primary-button" type="button" onClick={() => setReplayMessage('Passport is ready to publish with the CLI attestation command.')}>Publish Runtime Passport</button></div>{replayMessage.includes('Passport') ? <p className="passport-notice">Use <code>crucible publish-passport passport.json --rpc &lt;rpc&gt; --registry &lt;address&gt;</code> to publish the attestation.</p> : null}</section> : null}
        <section className="content-grid"><div className="panel flow-panel"><div className="panel-heading"><div><p className="eyebrow">{isRuntime ? 'STEP 3 / USER JOURNEY' : 'EXECUTION FLOW'}</p><h2>{isRuntime ? 'Where does the journey break?' : 'Execution steps'}</h2><p className="panel-subtitle">{isRuntime ? 'Pan, zoom, and select a trace node. The layout is locked so the execution order stays readable.' : 'Select a node to inspect the result.'}</p></div><div className="flow-actions"><span>{result.nodes.length} steps</span><button className="secondary-button" onClick={startReplay} disabled={replayIndex !== null}>{replayIndex === null ? 'Replay' : 'Replaying…'}</button></div></div>{replayMessage && !replayMessage.includes('Passport') ? <p className="replay-message" aria-live="polite">{replayMessage}</p> : null}<div className="view-tabs" role="tablist" aria-label="Verification view"><button className={graphView === 'business' ? 'active' : ''} onClick={() => setGraphView('business')}>Business View</button><button className={graphView === 'technical' ? 'active' : ''} onClick={() => setGraphView('technical')}>Technical View</button><button className={graphView === 'runtime' ? 'active' : ''} onClick={() => setGraphView('runtime')} disabled={!isRuntime}>Runtime Evidence</button></div>{isRuntime && graphView === 'business' ? <div className="journey-switcher">{journeys.map((journey) => <button key={journey} className={selectedJourney === journey ? 'selected' : ''} onClick={() => { setSelectedJourney(journey); setSelectedFindingId(findingsForJourney(result, journey)[0]?.findingId ?? ''); }}>{journeyLabel(journey)}<span>{findingsForJourney(result, journey).some((finding) => finding.status === 'failed') ? 'FAIL' : 'PASS'}</span></button>)}</div> : null}{isRuntime && graphView === 'runtime' ? <div className="runtime-findings" id="issues">{findings.map((finding) => <button key={finding.findingId} className={`finding-row ${finding.status} ${selectedFinding?.findingId === finding.findingId ? 'selected' : ''}`} onClick={() => { setSelectedJourney(finding.journeyId); setSelectedFindingId(finding.findingId); setSelectedId(finding.nodeId); }}><span className="finding-severity">{statusIcon(finding.status)}</span><span><strong>{findingTitle(finding.ruleId)}</strong><small>{finding.ruleId} · {journeyLabel(finding.journeyId)}</small></span></button>)}</div> : null}<RuntimeFlow result={result} journeyId={selectedJourney} view={isRuntime ? graphView : 'technical'} selectedNodeId={selectedId} selectedFindingId={selectedFindingId} onSelect={(nodeId, findingId) => { setSelectedId(nodeId); if (findingId) setSelectedFindingId(findingId); }} /></div><aside className="panel detail-panel" aria-label="Finding inspector">{renderInspector()}</aside></section>
        {result.scenario === 'token-buggy-mint' && result.status === 'failed' ? <section className="panel diagnosis-panel" aria-live="polite"><div className="panel-heading"><div><p className="eyebrow">SUGGESTED FIX / AI ASSISTED</p><h2>Understand the generic execution failure</h2></div><div className="flow-actions"><span>{diagnosis ? `${Math.round(diagnosis.confidence * 100)}% · ${diagnosisSource === 'live' ? 'live AI' : 'offline fallback'}` : 'Loading diagnosis…'}</span>{diagnosis ? <button className="secondary-button" type="button" onClick={() => void downloadCertificate()}>Download certificate</button> : null}</div></div>{diagnosis ? <div className="diagnosis-grid"><div><span className="diagnosis-label">Root cause</span><p>{diagnosis.rootCause}</p></div><div><span className="diagnosis-label">Evidence</span><ul className="evidence-list">{diagnosis.evidence.map((item) => <li key={`${item.nodeId}-${item.field}`}><code>{item.nodeId}.{item.field}</code> = {item.value}</li>)}</ul></div><div><span className="diagnosis-label">Suggested change</span><p>{diagnosis.suggestedFix}</p></div><div><span className="diagnosis-label">Follow-up test</span><ul className="evidence-list">{diagnosis.followUpTests.map((item) => <li key={item}>{item}</li>)}</ul></div></div> : <p className="diagnosis-unavailable">{diagnosisError || 'Loading cached diagnosis…'}</p>}</section> : null}
      </> : null}
    </div>
    </main>
  </>;
}
