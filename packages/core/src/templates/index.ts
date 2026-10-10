import { ScenarioSchema, type Scenario } from '../schema/index.js';
import { expandMintNftTemplate, isMintNftTemplate, MintNftTemplateSchema } from './mint-nft.js';

export { expandMintNftTemplate, isMintNftTemplate, MintNftTemplateSchema, type MintNftTemplate } from './mint-nft.js';

/** Resolve a scenario document or a supported business-flow template. */
export function resolveScenarioDocument(input: unknown): Scenario {
  if (isMintNftTemplate(input)) return expandMintNftTemplate(input);
  const parsed = ScenarioSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'scenario'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid scenario: ${detail}`);
  }
  return parsed.data;
}
