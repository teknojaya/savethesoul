"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table2, LineChart as LineIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Validated categorical palette (dataviz validator: all checks pass on light surface). */
export const SERIES = { mood: "#00897b", sleep: "#5a5fd8", stress: "#b8691b" } as const;
const AXIS = { fontSize: 12, fill: "#5f6f74" };
const GRID = "#ebe7de";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" });

function ViewToggle({ table, setTable }: { table: boolean; setTable: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => setTable(!table)}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted hover:bg-sand hover:text-ink"
      aria-pressed={table}
    >
      {table ? <LineIcon className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
      {table ? "Show chart" : "Show table"}
    </button>
  );
}

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lift">
      <p className="mb-1 font-medium text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-ink-soft">
          {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />}
          <span>{r.label}</span>
          <span className="ms-auto ps-3 font-semibold tabular-nums text-ink">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function Who5TrendChart({ data, height = 220 }: { data: { date: string; percentScore: number }[]; height?: number }) {
  const [table, setTable] = useState(false);
  const rows = data.map((d) => ({ ...d, label: fmtDate(d.date) }));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-muted">WHO-5 percentage score (0–100) · dashed line marks 50</p>
        <ViewToggle table={table} setTable={setTable} />
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-start text-xs text-muted">
              <th className="py-2 text-start font-medium">Date</th>
              <th className="py-2 text-end font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} className="border-b border-line/60">
                <td className="py-2">{r.label}</td>
                <td className="py-2 text-end font-medium tabular-nums">{r.percentScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ height }} role="img" aria-label={`WHO-5 scores: ${rows.map((r) => `${r.label} ${r.percentScore}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="who5fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={SERIES.mood} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={SERIES.mood} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={AXIS} tickLine={false} axisLine={false} />
              <ReferenceLine y={50} stroke="#9aa6a9" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ stroke: "#9aa6a9", strokeWidth: 1 }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipBox title={String(payload[0].payload.label)} rows={[{ label: "WHO-5", value: String(payload[0].value), color: SERIES.mood }]} />
                  ) : null
                }
              />
              <Area
                type="monotone"
                dataKey="percentScore"
                stroke={SERIES.mood}
                strokeWidth={2}
                fill="url(#who5fill)"
                dot={{ r: 4, fill: SERIES.mood, stroke: "#fff", strokeWidth: 2 }}
                activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

type CheckInRow = { createdAt: string; mood: number | null; sleepQuality: number | null; stress: number | null };

export function CheckInChart({ data, height = 220 }: { data: CheckInRow[]; height?: number }) {
  const [table, setTable] = useState(false);
  const rows = data.map((d) => ({ ...d, label: fmtDate(d.createdAt) }));
  const series = [
    { key: "mood", label: "Mood", color: SERIES.mood },
    { key: "sleepQuality", label: "Sleep quality", color: SERIES.sleep },
    { key: "stress", label: "Stress", color: SERIES.stress },
  ] as const;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-3 text-xs text-ink-soft" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className={cn("h-0.5 w-4 rounded-full")} style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
          <li className="text-muted">· scale 1–5</li>
        </ul>
        <ViewToggle table={table} setTable={setTable} />
      </div>
      {table ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="py-2 text-start font-medium">Date</th>
                {series.map((s) => (
                  <th key={s.key} className="py-2 text-end font-medium">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.createdAt} className="border-b border-line/60">
                  <td className="py-2">{r.label}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-2 text-end tabular-nums">{r[s.key] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -24 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ stroke: "#9aa6a9", strokeWidth: 1 }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipBox
                      title={String(payload[0].payload.label)}
                      rows={series.map((s) => ({ label: s.label, value: String(payload[0].payload[s.key] ?? "—"), color: s.color }))}
                    />
                  ) : null
                }
              />
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Tiny inline sparkline for dashboard tiles (single series, no axes). */
export function Sparkline({ values, color = SERIES.mood }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const w = 120;
  const h = 36;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 8) + 4},${h - 4 - ((v - min) / (max - min || 1)) * (h - 8)}`);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts.at(-1)!.split(",")[0]} cy={pts.at(-1)!.split(",")[1]} r={3.5} fill={color} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}
