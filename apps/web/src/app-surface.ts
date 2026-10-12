import type { WebBuildMode } from './build-mode.js';

export type AppSurface = 'public' | 'local' | 'fixture';

export function selectAppSurface(buildMode: WebBuildMode, fixtureRequested = false): AppSurface {
  if (buildMode === 'local') return 'local';
  return fixtureRequested ? 'fixture' : 'public';
}
