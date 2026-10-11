import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { RuntimeVerificationSchema, isRuntimePassportEligible } from './index.js';

const root = process.cwd();

function readFixture(name: string) {
  return JSON.parse(readFileSync(join(root, 'fixtures/runtime', name), 'utf8')) as unknown;
}

test('vulnerable runtime fixture preserves all three failing journeys', () => {
  const verification = RuntimeVerificationSchema.parse(readFixture('monad-runtime-vulnerable.json'));
  assert.deepEqual(verification.findings.map((finding) => finding.ruleId), [
    'MND-TIME-001', 'MND-FINALITY-001', 'MND-FUND-001'
  ]);
  assert.equal(isRuntimePassportEligible(verification), false);
});

test('fixed runtime fixture is eligible for a Runtime Passport', () => {
  assert.equal(isRuntimePassportEligible(readFixture('monad-runtime-fixed.json')), true);
});
