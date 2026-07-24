import { useCallback, useEffect, useState } from 'react';
import type { Health } from './api';
import { fetchHealth, fetchMetrics, triggerSync } from './api';
import type { MetricsResponse } from './types';
import { PRESETS, presetById, todaySP } from './dates';
import { Shell, Warnings } from './components/Shell';
import { KpiHero } from './components/KpiHero';
import { DailyCharts } from './components/DailyCharts';
import { LeadsDetail } from './components/LeadsDetail';
import { CommercialFunnelView, MarketingFunnelView, PagoOrganicoFunnelView } from './components/Funnels';
import { Segments } from './components/Segments';
import { ReportAnuncio, ReportOrganico, ReportPublico } from './components/Reports';
import { ErrorState, Loading } from './components/states';

interface UrlState {
  from: string;
  to: string;
  preset: string | null;
}

function readUrl(): UrlState {
  const p = new URLSearchParams(location.search);
  const preset = p.get('preset');
  if (preset && presetById(preset)) {
    const r = presetById(preset)!.range(todaySP());
    return { from: r.from, to: r.to, preset };
  }
  const from = p.get('from');
  const to = p.get('to');
  if (from && to) return { from, to, preset: null };
  const def = PRESETS[0]!.range(todaySP());
  return { from: def.from, to: def.to, preset: 'mes-atual' };
}

function writeUrl(s: UrlState): void {
  const p = new URLSearchParams();
  if (s.preset) p.set('preset', s.preset);
  else {
    p.set('from', s.from);
    p.set('to', s.to);
  }
  history.replaceState(null, '', `?${p.toString()}`);
}

export function App() {
  const [url, setUrl] = useState<UrlState>(readUrl);
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async (s: UrlState) => {
    setLoading(true);
    setError(null);
    try {
      const [m, h] = await Promise.all([
        fetchMetrics(s.from, s.to, s.preset ?? undefined),
        fetchHealth().catch(() => null),
      ]);
      setData(m);
      if (h) setHealth(h);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    writeUrl(url);
    void load(url);
  }, [url, load]);

  const onPreset = (id: string) => {
    const r = presetById(id)!.range(todaySP());
    setUrl({ from: r.from, to: r.to, preset: id });
  };
  const onRange = (from: string, to: string) => {
    if (from > to) return;
    setUrl({ from, to, preset: null });
  };
  const onSync = async () => {
    setSyncing(true);
    try {
      await triggerSync();
      await load(url);
      setHealth(await fetchHealth().catch(() => health));
    } finally {
      setSyncing(false);
    }
  };

  const roas = data?.kpis.find((k) => k.key === 'roas')?.value ?? 0;

  return (
    <div className="min-h-full">
      <Shell
        from={url.from}
        to={url.to}
        activePreset={url.preset}
        lastSync={health?.lastSync ?? data?.meta.lastSync ?? null}
        stale={health?.stale ?? data?.meta.stale ?? false}
        syncing={syncing || (health?.syncing ?? false)}
        source={data?.meta.source ?? health?.source ?? '—'}
        onPreset={onPreset}
        onRange={onRange}
        onSync={() => void onSync()}
      />

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-6">
        {loading && !data && <Loading />}
        {error && <ErrorState message={error} onRetry={() => void load(url)} />}
        {data && (
          <>
            <Warnings warnings={data.meta.warnings} />
            <KpiHero kpis={data.kpis} />
            <DailyCharts daily={data.daily} roas={roas} />
            <LeadsDetail data={data.leadsDetail} />
            <div className="grid gap-4 lg:grid-cols-2">
              <MarketingFunnelView funnel={data.marketingFunnel} />
              <CommercialFunnelView funnel={data.commercialFunnel} />
            </div>
            <PagoOrganicoFunnelView data={data.funilPagoOrganico} />
            <Segments segments={data.segments} />
            <ReportPublico rows={data.porPublico} />
            <ReportAnuncio rows={data.porAnuncio} />
            <ReportOrganico rows={data.origensOrganico} />
            {loading && <div className="text-center text-xs text-muted">atualizando…</div>}
          </>
        )}
      </main>
      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        MDA Dashboard · gerado {data ? new Date(data.meta.generatedAt).toLocaleString('pt-BR') : ''}
      </footer>
    </div>
  );
}
