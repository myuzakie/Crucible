import { useMemo } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { findingsForJourney, type RunResult } from './viewer.js';

type TraceStatus = 'passed' | 'failed' | 'skipped';
type TraceNodeData = { label: string; subtitle: string; kind: string; status: TraceStatus; nodeId: string; findingId?: string; onSelect: (nodeId: string, findingId?: string) => void };
type TraceNode = Node<TraceNodeData, 'trace'>;

const journeySteps: Record<string, Array<{ id: string; label: string; aliases: string[] }>> = {
  'new-user-purchase': [
    { id: 'create-account', label: 'Create Account', aliases: ['deploy'] },
    { id: 'fund-wallet', label: 'Fund Wallet', aliases: ['fund'] },
    { id: 'purchase', label: 'Purchase', aliases: ['purchase'] },
    { id: 'settlement', label: 'Settlement', aliases: ['settlement'] }
  ],
  settlement: [
    { id: 'transaction', label: 'Transaction', aliases: ['purchase', 'release-product'] },
    { id: 'wait-finality', label: 'Wait for Finality', aliases: ['release-product'] },
    { id: 'release', label: 'Release Product', aliases: ['release-product', 'settlement'] }
  ],
  auction: [
    { id: 'place-bid', label: 'Place Bid', aliases: ['bid'] },
    { id: 'next-block', label: 'Next Block', aliases: ['highest-bid'] },
    { id: 'resolve-winner', label: 'Resolve Winner', aliases: ['highest-bid', 'settlement'] }
  ]
};

function statusIcon(status: TraceStatus) { return status === 'passed' ? '✓' : status === 'failed' ? '×' : '—'; }

function TraceNodeCard({ data }: NodeProps<TraceNode>) {
  return <>
    <Handle className="trace-handle" type="target" position={Position.Top} />
    <button className={`trace-node-card ${data.status} ${data.kind}`} onClick={() => data.onSelect(data.nodeId, data.findingId)} aria-label={`Inspect ${data.label}`}>
      <span className="trace-node-index">{statusIcon(data.status)}</span>
      <span className="trace-node-copy"><strong>{data.label}</strong><small>{data.subtitle}</small></span>
      <span className="trace-node-status">{data.status}</span>
    </button>
    <Handle className="trace-handle" type="source" position={Position.Bottom} />
  </>;
}

const nodeTypes = { trace: TraceNodeCard };

function buildBusinessNodes(result: RunResult, journeyId: string, onSelect: TraceNodeData['onSelect']): { nodes: TraceNode[]; edges: Edge[] } {
  const findings = findingsForJourney(result, journeyId);
  const steps = journeySteps[journeyId] ?? result.nodes.map((node) => ({ id: node.id, label: node.id, aliases: [node.id] }));
  let blocked = false;
  const nodes = steps.map((step, index) => {
    const node = result.nodes.find((item) => step.aliases.includes(item.id));
    const finding = findings.find((item) => step.aliases.includes(item.nodeId));
    let status = (finding?.status ?? node?.status ?? 'passed') as TraceStatus;
    if (blocked) status = 'skipped';
    if (status === 'failed') blocked = true;
    return { id: step.id, type: 'trace' as const, position: { x: 130, y: index * 126 }, data: { label: step.label, subtitle: status === 'skipped' ? 'blocked by previous failure' : status, kind: 'business', status, nodeId: node?.id ?? step.id, findingId: finding?.findingId, onSelect } } satisfies TraceNode;
  });
  const edges = nodes.slice(1).map((node, index) => ({ id: `business-${index}`, source: nodes[index].id, target: node.id, label: node.data.status === 'skipped' ? 'blocked' : 'next step', className: node.data.status === 'skipped' ? 'trace-edge blocked' : node.data.status === 'failed' ? 'trace-edge failed' : 'trace-edge' }));
  return { nodes, edges };
}

function buildTechnicalNodes(result: RunResult, onSelect: TraceNodeData['onSelect']): { nodes: TraceNode[]; edges: Edge[] } {
  const nodes = result.nodes.map((node, index) => ({ id: node.id, type: 'trace' as const, position: { x: 130, y: index * 110 }, data: { label: node.id, subtitle: `${node.status} · ${node.durationMs}ms`, kind: 'technical', status: node.status as TraceStatus, nodeId: node.id, onSelect } } satisfies TraceNode));
  return { nodes, edges: nodes.slice(1).map((node, index) => ({ id: `technical-${index}`, source: nodes[index].id, target: node.id, className: node.data.status === 'failed' ? 'trace-edge failed' : 'trace-edge' })) };
}

function buildEvidenceNodes(result: RunResult, journeyId: string, onSelect: TraceNodeData['onSelect']): { nodes: TraceNode[]; edges: Edge[] } {
  const findings = findingsForJourney(result, journeyId);
  const nodes = findings.map((finding, index) => ({ id: finding.findingId, type: 'trace' as const, position: { x: 130, y: index * 126 }, data: { label: finding.ruleId, subtitle: `${finding.status} · ${finding.evidence[0]?.type ?? 'evidence'}`, kind: 'evidence', status: finding.status as TraceStatus, nodeId: finding.nodeId, findingId: finding.findingId, onSelect } } satisfies TraceNode));
  return { nodes, edges: nodes.slice(1).map((node, index) => ({ id: `evidence-${index}`, source: nodes[index].id, target: node.id, label: 'runtime evidence', className: node.data.status === 'failed' ? 'trace-edge failed' : 'trace-edge' })) };
}

export function RuntimeFlow({ result, journeyId, view, selectedNodeId, selectedFindingId, onSelect }: { result: RunResult; journeyId: string; view: 'business' | 'technical' | 'runtime'; selectedNodeId: string; selectedFindingId: string; onSelect: (nodeId: string, findingId?: string) => void }) {
  const graph = useMemo(() => view === 'business' ? buildBusinessNodes(result, journeyId, onSelect) : view === 'technical' ? buildTechnicalNodes(result, onSelect) : buildEvidenceNodes(result, journeyId, onSelect), [journeyId, onSelect, result, view]);
  const nodes = graph.nodes.map((node) => ({ ...node, selected: node.data.nodeId === selectedNodeId || node.data.findingId === selectedFindingId }));
  return <div className="runtime-flow-canvas" aria-label={`${view} runtime trace`}><ReactFlow nodes={nodes} edges={graph.edges} nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={false} elementsSelectable panOnDrag panOnScroll zoomOnScroll fitView fitViewOptions={{ padding: 0.2 }} proOptions={{ hideAttribution: true }}><Background color="#2c2e34" gap={20} size={1} /><Controls showInteractive={false} /></ReactFlow></div>;
}
