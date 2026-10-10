import { spawnSync } from 'node:child_process';

export type CrucibleTool = 'forge' | 'anvil';

export type ToolProbe = {
  available: boolean;
  executable: string;
  version?: string;
  reason?: string;
};

const ENV_NAMES: Record<CrucibleTool, string> = {
  forge: 'FORGE_BIN',
  anvil: 'ANVIL_BIN'
};

export function toolExecutable(tool: CrucibleTool, env: NodeJS.ProcessEnv = process.env): string {
  return env[ENV_NAMES[tool]] || tool;
}

export function probeTool(tool: CrucibleTool, env: NodeJS.ProcessEnv = process.env): ToolProbe {
  const executable = toolExecutable(tool, env);
  const result = spawnSync(executable, ['--version'], {
    encoding: 'utf8',
    timeout: 2000
  });

  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    return {
      available: false,
      executable,
      reason: code === 'ENOENT' ? 'executable not found' : 'unable to start executable'
    };
  }

  if (result.status !== 0) {
    return { available: false, executable, reason: 'version check failed' };
  }

  const version = `${result.stdout ?? ''}`.trim().split('\n')[0]?.trim();
  return { available: true, executable, ...(version ? { version } : {}) };
}

export function missingToolMessage(tool: CrucibleTool, probe: ToolProbe): string {
  const label = tool === 'forge' ? 'Foundry forge' : 'Foundry Anvil';
  return `${label} was not found (${probe.executable}). Install Foundry or run ` +
    '`export PATH="$HOME/.foundry/bin:$PATH"`. You can also set ' +
    `\`${ENV_NAMES[tool]}\` to an explicit executable path.`;
}
