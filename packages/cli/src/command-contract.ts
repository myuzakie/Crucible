export function isLocalTestCommand(args: string[]): boolean {
  const networkIndex = args.indexOf('--network');
  if (networkIndex === -1) return true;
  return args[networkIndex + 1] === 'local';
}

export function localTestUsage(): string {
  return 'Use: pnpm crucible test [--local] [--root path] [--scenario path]';
}
