import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const modes: Array<{ label: string; value?: string; expected: 'pass' | 'fail' }> = [
  { label: 'public', value: 'public', expected: 'pass' },
  { label: 'local', value: 'local', expected: 'pass' },
  { label: 'missing', expected: 'fail' },
  { label: 'invalid', value: 'preview', expected: 'fail' }
];

async function build(value?: string): Promise<{ ok: boolean; output: string }> {
  const environment = { ...process.env };
  if (value === undefined) delete environment.VITE_CRUCIBLE_MODE;
  else environment.VITE_CRUCIBLE_MODE = value;

  try {
    const result = await execFileAsync('pnpm', ['--filter', '@crucible/web', 'build'], {
      cwd: root,
      env: environment,
      maxBuffer: 10 * 1024 * 1024
    });
    return { ok: true, output: `${result.stdout}${result.stderr}` };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}${failure.message ?? ''}` };
  }
}

async function main() {
  for (const mode of modes) {
    const result = await build(mode.value);
    const passed = mode.expected === (result.ok ? 'pass' : 'fail');
    if (!passed) {
      throw new Error(`Web mode ${mode.label} expected ${mode.expected} but build ${result.ok ? 'passed' : 'failed'}.
${result.output}`);
    }
    if (mode.expected === 'fail' && !result.output.includes('VITE_CRUCIBLE_MODE')) {
      throw new Error(`Web mode ${mode.label} failed without naming VITE_CRUCIBLE_MODE.`);
    }
    console.log(`WEB MODE ${mode.label.toUpperCase()}: ${mode.expected === 'pass' ? 'ACCEPTED' : 'REJECTED'}`);
  }
  console.log('WEB MODE CHECK: PASSED');
}

main().catch((error: unknown) => {
  console.error(`WEB MODE CHECK: FAILED\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
