import assert from 'node:assert/strict';
import test from 'node:test';

import { buildEnvioTimestampObservation, fetchEnvioBlockEvidence } from './envio.js';

test('normalizes Envio blocks into runtime evidence used by the timing rule', async () => {
  const evidence = await fetchEnvioBlockEvidence(async () => [
    { number: 502, timestamp: 1000, hash: '0x502' },
    { number: 501, timestamp: 1000, hash: '0x501' }
  ], 501, 502);
  assert.equal(evidence[0]?.source, 'rpc');
  assert.equal(evidence[0]?.metadata?.provider, 'envio');
  assert.deepEqual(buildEnvioTimestampObservation([
    { number: 501, timestamp: 1000 },
    { number: 502, timestamp: 1000 }
  ]), { previousBlock: 501, previousTimestamp: 1000, currentBlock: 502, currentTimestamp: 1000 });
});

test('requires adjacent block evidence', () => {
  assert.throws(() => buildEnvioTimestampObservation([{ number: 501, timestamp: 1000 }]), /at least two blocks/);
});
