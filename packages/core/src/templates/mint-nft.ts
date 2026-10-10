import { z } from 'zod';

import { ScenarioSchema, type Scenario } from '../schema/index.js';

export const MintNftTemplateSchema = z
  .object({
    schemaVersion: z.string().default('0.1'),
    businessFlow: z.literal('mint NFT'),
    name: z.string().min(1).default('mint-nft'),
    network: z.string().min(1).default('local'),
    contract: z.string().min(1),
    actors: z.record(z.string(), z.string().min(1)),
    minter: z.string().min(1),
    recipient: z.string().min(1),
    tokenId: z.union([z.string(), z.number()]).default('0')
  })
  .superRefine((template, ctx) => {
    if (!template.actors[template.minter]) {
      ctx.addIssue({
        code: 'custom',
        path: ['minter'],
        message: `Unknown minter actor: ${template.minter}`
      });
    }
    if (!template.actors[template.recipient]) {
      ctx.addIssue({
        code: 'custom',
        path: ['recipient'],
        message: `Unknown recipient actor: ${template.recipient}`
      });
    }
  });

export type MintNftTemplate = z.infer<typeof MintNftTemplateSchema>;

/** Expand the mint NFT business-flow template into deploy → mint → ownerOf assertion. */
export function expandMintNftTemplate(input: unknown): Scenario {
  const parsed = MintNftTemplateSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'template'}: ${issue.message}`).join('; ');
    throw new Error(`Invalid mint NFT template: ${detail}`);
  }
  const template = parsed.data;
  const tokenId = String(template.tokenId);

  return ScenarioSchema.parse({
    schemaVersion: template.schemaVersion,
    name: template.name,
    network: template.network,
    actors: template.actors,
    metadata: {
      businessFlow: 'mint NFT',
      label: 'Mint NFT'
    },
    nodes: [
      { id: 'deploy', type: 'deploy', contract: template.contract, args: [], after: [] },
      {
        id: 'mint',
        type: 'call',
        from: template.minter,
        to: 'deploy',
        fn: 'mint',
        args: [template.recipient],
        after: ['deploy']
      },
      {
        id: 'owner',
        type: 'assert',
        check: { fn: 'ownerOf', args: [tokenId], eq: template.recipient },
        after: ['mint']
      }
    ]
  });
}

export function isMintNftTemplate(input: unknown): boolean {
  return Boolean(
    input &&
      typeof input === 'object' &&
      (input as { businessFlow?: unknown }).businessFlow === 'mint NFT' &&
      !Array.isArray((input as { nodes?: unknown }).nodes)
  );
}
