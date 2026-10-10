import { z } from 'zod';

export const CrucibleConfigSchema = z.object({
  schemaVersion: z.string().default('0.1'),
  toolchain: z.literal('foundry'),
  foundryRoot: z.string().min(1),
  artifactDir: z.string().min(1).default('out'),
  scenario: z.string().min(1),
  network: z.string().min(1).default('local'),
  rpcUrl: z.string().min(1).default('http://127.0.0.1:8545')
});

export type CrucibleConfig = z.infer<typeof CrucibleConfigSchema>;

export const DoctorReportSchema = z.object({
  schemaVersion: z.string().default('0.1'),
  root: z.string().min(1),
  status: z.enum([
    'SUPPORTED',
    'SUPPORTED_WITH_CONFIG',
    'UNSUPPORTED_TOOLCHAIN',
    'MISSING_ARTIFACT',
    'MISSING_SCENARIO',
    'MISSING_LOCAL_CHAIN'
  ]),
  summary: z.string().min(1),
  node: z.object({
    version: z.string().min(1),
    ok: z.boolean()
  }),
  packageManager: z.object({
    name: z.enum(['pnpm', 'yarn', 'npm', 'unknown']),
    lockfile: z.string().optional(),
    monorepo: z.boolean()
  }),
  toolchain: z.object({
    foundry: z.object({ detected: z.boolean(), configPaths: z.array(z.string()) }),
    hardhat: z.object({ detected: z.boolean(), supported: z.literal(false), configPaths: z.array(z.string()) })
  }),
  artifacts: z.object({ present: z.boolean(), candidates: z.array(z.string()) }),
  scenarios: z.object({ present: z.boolean(), candidates: z.array(z.string()) }),
  config: z.object({ present: z.boolean(), path: z.string().optional() }),
  localRpc: z.object({
    url: z.string().min(1),
    reachable: z.boolean(),
    chainId: z.number().int().positive().optional()
  }),
  walletMode: z.enum(['env-keys', 'missing', 'fixture']),
  fixtureFallback: z.object({
    available: z.boolean(),
    candidates: z.array(z.string())
  }),
  nextSteps: z.array(z.string().min(1)).min(1)
});

export type DoctorReport = z.infer<typeof DoctorReportSchema>;
