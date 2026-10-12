import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { openBrowser } from './browser.js';

function fakeChild() {
  const child = new EventEmitter() as unknown as ChildProcess;
  child.unref = () => undefined;
  return child;
}

test('browser opener resolves after a successful platform command', async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const child = fakeChild();
  const opening = openBrowser('http://127.0.0.1:8787/', {
    platform: 'linux',
    spawnProcess: (command, args) => {
      calls.push({ command, args });
      queueMicrotask(() => { child.emit('spawn'); child.emit('exit', 0, null); });
      return child;
    }
  });
  await opening;
  assert.deepEqual(calls, [{ command: 'xdg-open', args: ['http://127.0.0.1:8787/'] }]);
});

test('browser opener rejects failed commands for manual URL fallback', async () => {
  const child = fakeChild();
  const opening = openBrowser('http://127.0.0.1:8787/', {
    platform: 'linux',
    spawnProcess: () => {
      queueMicrotask(() => { child.emit('spawn'); child.emit('exit', 1, null); });
      return child;
    }
  });
  await assert.rejects(opening, /Browser command exited/);
});
