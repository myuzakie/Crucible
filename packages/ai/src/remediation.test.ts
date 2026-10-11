import assert from 'node:assert/strict';
import test from 'node:test';

import { RuntimeFindingSchema, ScenarioSchema } from '@crucible/core/schema';
import { buildRuntimeRemediationPrompt, remediateRuntimeFinding, validateRuntimeRemediation } from './remediation.js';

const finding = RuntimeFindingSchema.parse({
  findingId: 'MND-FUND-001:new-user-purchase:purchase', ruleId: 'MND-FUND-001', journeyId: 'new-user-purchase',
  nodeId: 'purchase', status: 'failed', userImpact: 'First-time users may fail.', summary: 'Funding distance is too short.',
  expected: { requiredSafeDistance: 3 }, observed: { firstDistance: 1 },
  evidence: [{ type: 'blockDistance', source: 'fixture', observed: 1, expected: 3, blockNumber: 12052 }]
});

const scenario = ScenarioSchema.parse({
  schemaVersion: '0.1', name: 'new-user-purchase', network: 'local', actors: { alice: 'env:ALICE_PRIVATE_KEY' },
  nodes: [{ id: 'purchase', type: 'call', from: 'alice', to: 'deploy', fn: 'purchase', args: [], after: [] }]
});

const remediation = {
  status: 'ai-suggested', findingId: finding.findingId, ruleId: finding.ruleId,
  explanation: 'Wait for the required block distance before the first purchase.',
  rootCause: 'The purchase path assumes funding is immediately spendable.',
  remediation: 'Gate the purchase until the safe distance is reached.',
  suggestedDiff: 'Add a funding-distance guard before purchase.',
  followUpTests: ['Fund a new account and retry after three blocks.'], confidence: 0.91
};

test('validates evidence-bound remediation and keeps it AI suggested', () => {
  assert.equal(validateRuntimeRemediation(remediation, finding).status, 'ai-suggested');
  assert.throws(() => validateRuntimeRemediation({ ...remediation, findingId: 'other' }, finding), /findingId/);
  const prompt = buildRuntimeRemediationPrompt({ finding, scenario });
  assert.match(prompt, /Do not claim Runtime Verified/);
});

test('falls back when the model proposes fabricated identity', async () => {
  const result = await remediateRuntimeFinding({ finding, scenario }, {
    client: async () => ({ ...remediation, ruleId: 'MND-TIME-001' }),
    fallback: remediation
  });
  assert.equal(result.source, 'fallback');
  assert.equal(result.remediation?.findingId, finding.findingId);
});
