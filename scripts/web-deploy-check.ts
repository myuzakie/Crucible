import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const dist = resolve('apps/web/dist');
const forbidden = /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/;

async function filesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path));
    else files.push(path);
  }
  return files;
}

async function main() {
  const files = await filesIn(dist);
  if (!files.some((file) => file.endsWith('/index.html'))) throw new Error('Web build tidak memiliki index.html.');
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (forbidden.test(content)) throw new Error(`Web build memuat secret marker: ${file}`);
  }
  console.log(`WEB BUILD: PASSED (${files.length} files, no RPC/private-key markers)`);
}

main().catch((error: unknown) => {
  console.error(`WEB BUILD: FAILED\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
