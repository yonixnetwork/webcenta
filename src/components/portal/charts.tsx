/** Server-rendered SVG charts with accessible data tables (no client JS, CSP-safe). */
export function LineChart({ title, points, series }: {
  title: string;
  points: Array<Record<string, number | string>>;
  series: Array<{ key: string; label: string; color: string }>;
}) {
  const W = 640, H = 200, P = 28;
  const max = Math.max(1, ...points.flatMap((p) => series.map((s) => Number(p[s.key]) || 0)));
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, points.length - 1);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-center gap-4 text-sm font-semibold">
        {title}
        {series.map((s) => <span key={s.key} className="inline-flex items-center gap-1 text-xs font-normal text-muted"><span className="inline-block size-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>)}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" role="img" aria-label={`${title} chart`}>
        {[0, 0.5, 1].map((t) => <line key={t} x1={P} x2={W - P} y1={y(max * t)} y2={y(max * t)} stroke="currentColor" className="text-border" strokeDasharray="3 4" />)}
        <text x={4} y={y(max) + 4} className="fill-current text-[10px] text-subtle">{max}</text>
        <text x={4} y={y(0) + 4} className="fill-current text-[10px] text-subtle">0</text>
        {series.map((s) => (
          <polyline key={s.key} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
            points={points.map((p, i) => `${x(i)},${y(Number(p[s.key]) || 0)}`).join(" ")} />
        ))}
        {points.length > 0 && <>
          <text x={P} y={H - 6} className="fill-current text-[10px] text-subtle">{String(points[0]!.date)}</text>
          <text x={W - P} y={H - 6} textAnchor="end" className="fill-current text-[10px] text-subtle">{String(points[points.length - 1]!.date)}</text>
        </>}
      </svg>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">Show data table</summary>
        <div className="max-h-56 overflow-auto">
          <table className="mt-2 w-full text-left">
            <thead><tr><th className="py-1">Date</th>{series.map((s) => <th key={s.key} className="py-1">{s.label}</th>)}</tr></thead>
            <tbody>{points.map((p) => <tr key={String(p.date)} className="border-t border-border"><td className="py-1">{String(p.date)}</td>{series.map((s) => <td key={s.key}>{Number(p[s.key]) || 0}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function BarList({ title, rows, valueLabel = "Views" }: { title: string; rows: Array<{ key: string; value: number; secondary?: number }>; valueLabel?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-muted">No data yet.</p> : (
        <table className="w-full text-sm">
          <thead className="sr-only"><tr><th>Item</th><th>{valueLabel}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="w-2/5 truncate py-1 pr-2">{r.key}</td>
                <td className="py-1"><span className="flex items-center gap-2"><span className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /><span className="text-muted">{r.value}{r.secondary !== undefined ? ` · ${r.secondary} clicks` : ""}</span></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
