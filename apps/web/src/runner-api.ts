export type RunnerApiRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type RunnerApiClientOptions = {
  /** Explicit URL is a legacy/dev compatibility override. Normal local mode leaves this empty. */
  baseUrl?: string;
  fetchImpl?: RunnerApiRequest;
};

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, '');
}

export function createRunnerApiClient(options: RunnerApiClientOptions = {}) {
  const explicitBaseUrl = options.baseUrl ? normalizeBaseUrl(options.baseUrl) : '';
  const fetchImpl = options.fetchImpl ?? fetch;

  function url(path: string): string {
    if (explicitBaseUrl) return `${explicitBaseUrl}${path}`;
    return `/api${path}`;
  }

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(url(path), init);
    const payload = await response.json() as T & { error?: string; message?: string };
    if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Runner returned ${response.status}.`);
    return payload;
  }

  return { requestJson, url, usesLegacyBaseUrl: Boolean(explicitBaseUrl) };
}
