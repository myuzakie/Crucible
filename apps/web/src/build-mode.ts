export const WEB_BUILD_MODES = ['public', 'local'] as const;

export type WebBuildMode = (typeof WEB_BUILD_MODES)[number];

export function parseWebBuildMode(value: unknown): WebBuildMode {
  if (value === 'public' || value === 'local') return value;

  const received = value === undefined ? 'missing' : value === '' ? 'empty' : JSON.stringify(value);
  throw new Error(
    `Invalid VITE_CRUCIBLE_MODE (${received}). Set VITE_CRUCIBLE_MODE to exactly "public" or "local".`
  );
}
