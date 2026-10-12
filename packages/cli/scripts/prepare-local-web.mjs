import { cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const webRoot = resolve(packageRoot, '../../apps/web');
const webDist = resolve(webRoot, 'dist');
const bundledWeb = resolve(packageRoot, 'web');

execFileSync('pnpm', ['--dir', webRoot, 'build:local'], { cwd: packageRoot, stdio: 'inherit' });
await rm(bundledWeb, { recursive: true, force: true });
await cp(webDist, bundledWeb, { recursive: true });
