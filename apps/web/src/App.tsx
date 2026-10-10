import { useEffect, useMemo, useState } from 'react';

type Status = 'passed' | 'failed' | 'skipped';
type NodeResult = {
  id: string;
  status: Status;
  durationMs: number;
  txHash?: string;
  error?: { kind: string; message?: string; expected?: unknown; actual?: unknown };
};
type RunResult = {
  schemaVersion: string;
  runId: string;
  scenario: string;
  status: 'passed' | 'failed';
  score: number;
  network: { name: string; chainId: number; explorerUrl?: string };
  startedAt: string;
  finishedAt: string;
  nodes: NodeResult[];
  summary: { passed: number; failed: number; skipped: number };
};

const fixtures = [
  { label: 'Buggy mint', file: '/results/buggy-mint.json' },
  { label: 'Happy path', file: '/results/happy-path.json' },
  { label: 'Skipped node', file: '/results/skipped.json' },
  { label: 'Malformed', file: '/results/malformed.json' }
];

function validateResult(value: unknown): RunResult {
  if (!value || typeof value !== 'object') throw new Error('RunResult bukan object.');
  const result = value as Partial<RunResult>;
  if (!result.scenario || !result.status || !Array.isArray(result.nodes)) {
    throw new Error('RunResult tidak memiliki scenario, status, atau nodes.');
  }
  if (!result.network || typeof result.network.chainId !== 'number') {
    throw new Error('RunResult network atau chainId tidak valid.');
  }
  return value as RunResult;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function App() {
  const [fixture, setFixture] = useState(fixtures[0].file);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    setResult(null);
    setError('');
    fetch(fixture)
      .then((response) => {
        if (!response.ok) throw new Error(`Fixture tidak ditemukan (${response.status}).`);
        return response.json();
      })
      .then((value) => {
        const parsed = validateResult(value);
        setResult(parsed);
        setSelectedId(parsed.nodes[0]?.id ?? '');
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Gagal memuat result.'));
  }, [fixture]);

  const selected = useMemo(
    () => result?.nodes.find((node) => node.id === selectedId) ?? result?.nodes[0],
    [result, selectedId]
  );

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
            {fixtures.map((item) => (
              <option key={item.file} value={item.file}>{item.label}</option>
            ))}
          </select>
        </label>
      </header>

      {error ? <section className="error-card"><strong>Cannot render result</strong><p>{error}</p></section> : null}
      {result ? (
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
              <div className="panel-heading"><div><p className="eyebrow">EXECUTION FLOW</p><h2>Nodes</h2></div><span>{result.nodes.length} steps</span></div>
              <div className="flow">
                {result.nodes.map((node, index) => (
                  <div key={node.id} className="flow-item">
                    <button className={`node ${node.status} ${selected?.id === node.id ? 'selected' : ''}`} onClick={() => setSelectedId(node.id)}>
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
        </>
      ) : null}
    </main>
  );
}
