import { z } from 'zod';

export const CapabilityStatusSchema = z.enum([
  'SUPPORTED',
  'SUPPORTED_WITH_CONFIG',
  'UNSUPPORTED_TOOLCHAIN',
  'MISSING_ARTIFACT',
  'MISSING_SCENARIO',
  'MISSING_LOCAL_CHAIN',
  'BUILD_FAILED',
  'SCENARIO_FAILED'
]);

export const CapabilityReportSchema = z.object({
  schemaVersion: z.string().default('0.1'),
  root: z.string().min(1),
  status: CapabilityStatusSchema,
  summary: z.string().min(1),
  toolchain: z.object({
    foundry: z.object({
      detected: z.boolean(),
      configPaths: z.array(z.string())
    }),
    hardhat: z.object({
      detected: z.boolean(),
      supported: z.literal(false),
      configPaths: z.array(z.string())
    }),
    scaffoldEth: z.object({
      detected: z.boolean(),
      hints: z.array(z.string())
    })
  }),
  packageManager: z.object({
    name: z.enum(['pnpm', 'yarn', 'npm', 'unknown']),
    lockfile: z.string().optional(),
    monorepo: z.boolean()
  }),
  artifacts: z.object({
    present: z.boolean(),
    candidates: z.array(z.string())
  }),
  scenarios: z.object({
    present: z.boolean(),
    candidates: z.array(z.string())
  }),
  config: z.object({
    present: z.boolean(),
    candidates: z.array(z.string())
  }),
  buildScripts: z.array(z.string()),
  nextSteps: z.array(z.string().min(1)).min(1)
});

export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;
export type CapabilityReport = z.infer<typeof CapabilityReportSchema>;
