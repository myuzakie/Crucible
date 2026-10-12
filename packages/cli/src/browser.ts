import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

export type BrowserOpenOptions = {
  platform?: NodeJS.Platform;
  spawnProcess?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
};

function commandFor(platform: NodeJS.Platform, url: string): { command: string; args: string[] } {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] };
  return { command: 'xdg-open', args: [url] };
}

export function openBrowser(url: string, options: BrowserOpenOptions = {}): Promise<void> {
  const { command, args } = commandFor(options.platform ?? process.platform, url);
  const spawnProcess = options.spawnProcess ?? ((name, values, spawnOptions) => spawn(name, values, spawnOptions));
  return new Promise<void>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnProcess(command, args, { detached: true, stdio: 'ignore' });
    } catch (error) {
      reject(error);
      return;
    }
    child.once('error', reject);
    child.once('spawn', () => child.unref());
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Browser command exited with ${signal ?? `code ${code ?? 'unknown'}`}.`));
    });
  });
}
