import { PRESETS } from '../dates';
import { fmtDateTime } from '../format';

interface ShellProps {
  from: string;
  to: string;
  activePreset: string | null;
  lastSync: string | null;
  stale: boolean;
  syncing: boolean;
  source: string;
  onPreset: (id: string) => void;
  onRange: (from: string, to: string) => void;
  onSync: () => void;
}

export function Shell(props: ShellProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ink/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <div className="mr-2 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-gold font-display text-lg font-black text-ink">
            M
          </span>
          <div className="leading-tight">
            <div className="font-display text-sm font-bold">Mentoria MDA</div>
            <div className="text-[11px] text-muted">Dashboard · funil high-ticket</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => props.onPreset(p.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                props.activePreset === p.id
                  ? 'bg-gold text-ink'
                  : 'border border-line text-muted hover:text-text'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 text-xs">
          <input
            type="date"
            value={props.from}
            max={props.to}
            onChange={(e) => props.onRange(e.target.value, props.to)}
            className="rounded-md border border-line bg-panel px-2 py-1 text-text"
          />
          <span className="text-muted">→</span>
          <input
            type="date"
            value={props.to}
            min={props.from}
            onChange={(e) => props.onRange(props.from, e.target.value)}
            className="rounded-md border border-line bg-panel px-2 py-1 text-text"
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          {props.stale && (
            <span className="rounded-full bg-bad/20 px-2 py-1 text-[11px] font-medium text-bad">
              dados desatualizados
            </span>
          )}
          <div className="hidden text-right text-[11px] text-muted sm:block">
            <div>último sync: {fmtDateTime(props.lastSync)}</div>
            <div>fonte: {props.source}</div>
          </div>
          <button
            onClick={props.onSync}
            disabled={props.syncing}
            className="rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-ink hover:brightness-95 disabled:opacity-60"
          >
            {props.syncing ? 'Sincronizando…' : 'Atualizar agora'}
          </button>
        </div>
      </div>
    </header>
  );
}

export function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <details className="card border-gold/30 bg-gold/5">
      <summary className="cursor-pointer text-sm font-medium text-gold">
        {warnings.length} aviso(s) de dados — clique para ver
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </details>
  );
}
