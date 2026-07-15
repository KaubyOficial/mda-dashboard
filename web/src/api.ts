import type { MetricsResponse, SyncResult } from './types';

export interface Health {
  status: string;
  source: string;
  lastSync: string | null;
  stale: boolean;
  syncing: boolean;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function fetchMetrics(from: string, to: string, preset?: string): Promise<MetricsResponse> {
  const q = new URLSearchParams({ from, to });
  if (preset) q.set('preset', preset);
  return fetch(`/api/metrics?${q.toString()}`).then((r) => json<MetricsResponse>(r));
}

export function fetchHealth(): Promise<Health> {
  return fetch('/api/health').then((r) => json<Health>(r));
}

export function triggerSync(): Promise<SyncResult> {
  return fetch('/api/sync', { method: 'POST' }).then((r) => json<SyncResult>(r));
}
