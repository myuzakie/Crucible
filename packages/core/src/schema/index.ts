import { z } from 'zod';
import {
  RuntimeFindingSchema,
  RuntimeReplaySummarySchema,
  RuntimeVerificationSchema,
  type RuntimeEvidence,
  type RuntimeFinding,
  type RuntimeReplaySummary,
  type RuntimeRule,
  type RuntimeVerification,
  type VerificationProfile
} from '../runtime/index.js';

export { RuntimeFindingSchema } from '../runtime/index.js';

const NodeId = z.string().min(1);
const Args = z.array(z.unknown()).default([]);
const After = z.array(NodeId).default([]);
const SourceLocationSchema = z.object({
  file: z.string().min(1),
  symbol: z.string().min(1).optional(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional()
}).strict();

const DeployNodeSchema = z.object({
  id: NodeId,
  type: z.literal('deploy'),
  contract: z.string().min(1),
  args: Args,
  after: After,
  source: SourceLocationSchema.optional()
});

const CallNodeSchema = z.object({
  id: NodeId,
  type: z.literal('call'),
  from: z.string().min(1),
  to: z.string().min(1),
  fn: z.string().min(1),
  args: Args,
  after: After,
  source: SourceLocationSchema.optional()
});

const AssertCheckSchema = z.object({
  fn: z.string().min(1),
  args: Args,
  eq: z.union([z.string(), z.number(), z.boolean()]).optional()
});

const AssertNodeSchema = z.object({
  id: NodeId,
  type: z.literal('assert'),
  check: AssertCheckSchema,
  after: After,
  source: SourceLocationSchema.optional()
});

export const ScenarioNodeSchema = z.discriminatedUnion('type', [
  DeployNodeSchema,
  CallNodeSchema,
  AssertNodeSchema
]);

export const ScenarioMetadataSchema = z
  .object({
    businessFlow: z.string().min(1).optional(),
    label: z.string().min(1).optional()
  })
  .strict();

export const ScenarioSchema = z
  .object({
    schemaVersion: z.string().default('0.1'),
    name: z.string().min(1),
    network: z.string().min(1),
    actors: z.record(z.string(), z.string().min(1)),
    metadata: ScenarioMetadataSchema.optional(),
    nodes: z.array(ScenarioNodeSchema).min(1)
  })
  .superRefine((scenario, ctx) => {
    const ids = new Set<string>();

    for (const [index, node] of scenario.nodes.entries()) {
      if (ids.has(node.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', index, 'id'],
          message: `Duplicate node id: ${node.id}`
        });
      }
      ids.add(node.id);
    }

    for (const [index, node] of scenario.nodes.entries()) {
      for (const dependency of node.after) {
        if (!ids.has(dependency)) {
          ctx.addIssue({
            code: 'custom',
            path: ['nodes', index, 'after'],
            message: `Unknown dependency: ${dependency}`
          });
        }
      }
    }
  });

export const ExecutionErrorSchema = z.object({
  kind: z.enum(['assertion', 'revert', 'rpc', 'validation', 'unknown']),
  message: z.string().optional(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional()
});

export const NodeResultSchema = z.object({
  id: NodeId,
  status: z.enum(['passed', 'failed', 'skipped']),
  durationMs: z.number().nonnegative(),
  txHash: z.string().optional(),
  input: z.unknown().optional(),
  receipt: z.unknown().optional(),
  source: SourceLocationSchema.optional(),
  error: ExecutionErrorSchema.optional()
});

export const RunResultSchema = z.object({
  schemaVersion: z.string().default('0.1'),
  runId: z.string().min(1),
  scenario: z.string().min(1),
  status: z.enum(['passed', 'failed']),
  score: z.number().min(0).max(100),
  network: z.object({
    name: z.string().min(1),
    chainId: z.number().int().positive(),
    rpcUrl: z.string().optional(),
    explorerUrl: z.string().optional()
  }),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  nodes: z.array(NodeResultSchema),
  summary: z.object({
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative()
  }),
  runtimeVerification: RuntimeVerificationSchema.optional(),
  verifiedReplay: RuntimeReplaySummarySchema.optional()
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioNode = z.infer<typeof ScenarioNodeSchema>;
export type ScenarioMetadata = z.infer<typeof ScenarioMetadataSchema>;
export type SourceLocation = z.infer<typeof SourceLocationSchema>;
export type ExecutionError = z.infer<typeof ExecutionErrorSchema>;
export type NodeResult = z.infer<typeof NodeResultSchema>;
export type RunResult = z.infer<typeof RunResultSchema>;
export type {
  RuntimeEvidence,
  RuntimeFinding,
  RuntimeReplaySummary,
  RuntimeRule,
  RuntimeVerification,
  VerificationProfile
};
