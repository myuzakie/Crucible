import { spawnSync } from 'node:child_process';

const commands = [
  ['pnpm', ['lint']],
  ['pnpm', ['typecheck']],
  ['pnpm', ['test']],
  ['pnpm', ['judge:check']],
  ['pnpm', ['--filter', '@crucible/web', 'build:public']],
  ['pnpm', ['web:check']],
  ['pnpm', ['test:external', '--json']]
] as const;

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, PATH: `${process.env.HOME ?? ''}/.foundry/bin:${process.env.PATH ?? ''}` } });
  if (result.status !== 0) {
    console.error(`M21-D production acceptance failed at: ${command} ${args.join(' ')}`);
    process.exitCode = result.status ?? 1;
    break;
  }
}

if (!process.exitCode) console.log('M21-D PRODUCTION ACCEPTANCE: PASSED');
