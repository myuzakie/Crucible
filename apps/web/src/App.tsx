import { useEffect, useMemo, useState } from 'react';

import { validateDiagnosisForResult, type Diagnosis } from '@crucible/ai';
import { replaySequence, validateResult, type RunResult } from './viewer.js';

const fixtures = [
  { label: 'Buggy mint', file: '/results/buggy-mint.json' },
  { label: 'Happy path', file: '/results/happy-path.json' },
  { label: 'ERC-721 mint', file: '/results/erc721-happy.json' },
  { label: 'Skipped node', file: '/results/skipped.json' },
  { label: 'Malformed', file: '/results/malformed.json' }
];

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function App() {
  const [fixture, setFixture] = useState(fixtures[0].file);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [replayMessage, setReplayMessage] = useState('');
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [diagnosisError, setDiagnosisError] = useState('');
  const [diagnosisSource, setDiagnosisSource] = useState<'live' | 'fallback' | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError('');
    setSelectedId('');
    setReplayIndex(null);
    setReplayMessage('');
    setDiagnosis(null);
    setDiagnosisError('');
    setDiagnosisSource(null);
    fetch(fixture, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Fixture tidak ditemukan (${response.status}).`);
        return response.json();
      })
      .then((value) => {
        const parsed = validateResult(value);
        setResult(parsed);
        setSelectedId(parsed.nodes[0]?.id ?? '');
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Gagal memuat result.');
      });
    return () => controller.abort();
  }, [fixture]);

  useEffect(() => {
    if (!result || result.status !== 'failed') return;
    if (result.scenario !== 'token-buggy-mint') {
      setDiagnosisError('Tidak ada diagnosis cache untuk scenario ini.');
      return;
    }
    const controller = new AbortController();
    let active = true;
    const loadDiagnosis = async () => {
      try {
        const scenarioResponse = await fetch('/scenarios/buggy-mint.json', { signal: controller.signal });
        if (!scenarioResponse.ok) throw new Error(`Scenario tidak ditemukan (${scenarioResponse.status}).`);
        const scenario = await scenarioResponse.json();
        const liveResponse = await fetch('/api/diagnose', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ runResult: result, scenario }),
          signal: controller.signal
        });
        if (!liveResponse.ok) throw new Error(`Live AI unavailable (${liveResponse.status}).`);
        const payload = await liveResponse.json() as { diagnosis?: unknown };
        if (!payload.diagnosis) throw new Error('Live AI returned no diagnosis.');
        const parsed = validateDiagnosisForResult(payload.diagnosis, result);
        if (active) {
          setDiagnosis(parsed);
          setDiagnosisSource('live');
          setDiagnosisError('');
        }
        return;
      } catch (reason: unknown) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
      }

      try {
        const response = await fetch('/diagnosis/buggy-mint.json', { signal: controller.signal });
        if (!response.ok) throw new Error(`Diagnosis cache tidak ditemukan (${response.status}).`);
        const parsed = validateDiagnosisForResult(await response.json(), result);
        if (active) {
          setDiagnosis(parsed);
          setDiagnosisSource('fallback');
          setDiagnosisError('');
        }
      } catch (reason: unknown) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        if (active) setDiagnosisError(reason instanceof Error ? reason.message : 'AI diagnosis unavailable.');
      }
    };
    void loadDiagnosis();
    return () => {
      active = false;
      controller.abort();
    };
  }, [result]);

  useEffect(() => {
    if (replayIndex === null || !result) return;
    const replayIds = replaySequence(result.nodes);
    const node = result.nodes[replayIndex];
    if (!node) {
      setReplayIndex(null);
      return;
    }
    setSelectedId(node.id);
    if (node.status === 'failed') {
      setReplayIndex(null);
      setReplayMessage(`Replay berhenti pada failure: ${node.id}`);
      return;
    }
    if (replayIndex === replayIds.length - 1) {
      setReplayIndex(null);
      setReplayMessage('Replay selesai.');
      return;
    }
    const timer = window.setTimeout(() => setReplayIndex((current) => current === null ? null : current + 1), 650);
    return () => window.clearTimeout(timer);
  }, [replayIndex, result]);

  const selected = useMemo(
    () => result?.nodes.find((node) => node.id === selectedId) ?? result?.nodes[0],
    [result, selectedId]
  );

  function startReplay() {
    if (!result?.nodes.length) return;
    setReplayMessage('Replay berjalan…');
    setReplayIndex(0);
  }

  async function downloadCertificate() {
    if (result?.scenario !== 'token-buggy-mint') {
      setDiagnosisError('Certificate offline hanya tersedia untuk token-buggy-mint.');
      return;
    }
    const response = await fetch('/certificate/buggy-mint.json');
    if (!response.ok) {
      setDiagnosisError(`Certificate fixture tidak ditemukan (${response.status}).`);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'crucible-certificate-buggy-mint.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CRUCIBLE / EXECUTION REPORT</p>
          <h1>Run viewer</h1>
        </div>
        <label className="fixture-picker">
          Fixture
          <select value={fixture} onChange={(event) => setFixture(event.target.value)}>
            {fixtures.map((item) => <option key={item.file} value={item.file}>{item.label}</option>)}
          </select>
        </label>
      </header>

      {error ? <section className="error-card" role="alert"><strong>Cannot render result</strong><p>{error}</p></section> : null}
      {!error && !result ? <section className="state-card" aria-live="polite">Loading result…</section> : null}
      {result && result.nodes.length === 0 ? <section className="state-card"><strong>No execution nodes</strong><p>RunResult valid, tetapi belum memiliki langkah untuk ditampilkan.</p></section> : null}
      {result && result.nodes.length > 0 ? (
        <>
          <section className="overview">
            <div><span>Status</span><strong className={`status-text ${result.status}`}>{result.status}</strong></div>
            <div><span>Scenario</span><strong>{result.scenario}</strong></div>
            <div><span>Score</span><strong>{result.score}%</strong></div>
            <div><span>Network</span><strong>{result.network.name} · {result.network.chainId}</strong></div>
            <div><span>Finished</span><strong>{formatDate(result.finishedAt)}</strong></div>
          </section>
          <section className="content-grid">
            <div className="panel flow-panel">
              <div className="panel-heading">
                <div><p className="eyebrow">EXECUTION FLOW</p><h2>Nodes</h2></div>
                <div className="flow-actions"><span>{result.nodes.length} steps</span><button onClick={startReplay} disabled={replayIndex !== null}>{replayIndex === null ? 'Replay' : 'Replaying…'}</button></div>
              </div>
              {replayMessage ? <p className="replay-message" aria-live="polite">{replayMessage}</p> : null}
              <div className="flow">
                {result.nodes.map((node, index) => (
                  <div key={node.id} className="flow-item">
                    <button className={`node ${node.status} ${selected?.id === node.id ? 'selected' : ''}`} onClick={() => setSelectedId(node.id)} aria-label={`Select ${node.id} node`}>
                      <span className="node-index">{String(index + 1).padStart(2, '0')}</span>
                      <span><strong>{node.id}</strong><small>{node.status} · {node.durationMs}ms</small></span>
                      <span className="node-dot" />
                    </button>
                    {index < result.nodes.length - 1 ? <div className="connector" /> : null}
                  </div>
                ))}
              </div>
            </div>
            <aside className="panel detail-panel">
              <p className="eyebrow">NODE DETAIL</p>
              {selected ? (
                <>
                  <h2>{selected.id}</h2>
                  <div className={`detail-status ${selected.status}`}>{selected.status}</div>
                  <dl>
                    <dt>Duration</dt><dd>{selected.durationMs}ms</dd>
                    <dt>Transaction</dt><dd>{selected.txHash ? (result.network.explorerUrl ? <a href={`${result.network.explorerUrl}/tx/${selected.txHash}`} target="_blank" rel="noreferrer">{selected.txHash.slice(0, 12)}…</a> : selected.txHash) : '—'}</dd>
                  </dl>
                  {selected.error ? <div className="failure"><strong>{selected.error.kind}</strong><p>{selected.error.message ?? `Expected ${String(selected.error.expected)}; actual ${String(selected.error.actual)}.`}</p></div> : null}
                </>
              ) : <p>Select a node to inspect it.</p>}
            </aside>
          </section>
          {result.status === 'failed' ? (
            <section className="panel diagnosis-panel" aria-live="polite">
              <div className="panel-heading">
                <div><p className="eyebrow">AI-ASSISTED DEBUGGING</p><h2>Diagnosis</h2></div>
                <div className="flow-actions">
                  <span>{diagnosis ? `${Math.round(diagnosis.confidence * 100)}% · ${diagnosisSource === 'live' ? 'live AI' : 'offline fallback'}` : 'offline fallback'}</span>
                  {diagnosis ? <button type="button" onClick={() => void downloadCertificate()}>Download certificate</button> : null}
                </div>
              </div>
              {diagnosis ? (
                <div className="diagnosis-grid">
                  <div><span className="diagnosis-label">Root cause</span><p>{diagnosis.rootCause}</p></div>
                  <div><span className="diagnosis-label">Evidence</span><ul className="evidence-list">{diagnosis.evidence.map((item) => <li key={`${item.nodeId}-${item.field}`}><code>{item.nodeId}.{item.field}</code> = {item.value}</li>)}</ul></div>
                  <div><span className="diagnosis-label">Suggested patch</span><p>{diagnosis.suggestedFix}</p></div>
                  <div><span className="diagnosis-label">Follow-up tests</span><ul className="evidence-list">{diagnosis.followUpTests.map((item) => <li key={item}>{item}</li>)}</ul></div>
                </div>
              ) : <p className="diagnosis-unavailable">{diagnosisError || 'Loading cached diagnosis…'} RunResult tetap tersedia.</p>}
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
