import assert from 'node:assert/strict';
import test from 'node:test';

import { isPublicDemoRoute } from './public-route.js';

test('canonical /demo route selects the deterministic public fixture', () => {
  assert.equal(isPublicDemoRoute('/demo'), true);
  assert.equal(isPublicDemoRoute('/demo/'), true);
});

test('legacy demo/debug queries remain compatible', () => {
  assert.equal(isPublicDemoRoute('/', '?demo=1'), true);
  assert.equal(isPublicDemoRoute('/', '?debug=1'), true);
  assert.equal(isPublicDemoRoute('/', ''), false);
});

test('public fixture requests stay relative and cannot target localhost', () => {
  const requestPaths = [
    '/results/monad-runtime-vulnerable.json',
    '/scenarios/buggy-mint.json',
    '/api/diagnose',
    '/diagnosis/buggy-mint.json',
    '/certificate/buggy-mint.json'
  ];
  assert.ok(requestPaths.every((path) => path.startsWith('/') && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(path)));
});
