"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import type { StatusSlice } from "@/lib/metrics";

const LABELS: Record<string, string> = {
  new: "To do",
  indeterminate: "In progress",
  done: "Done",
  unknown: "Other",
};
const COLORS: Record<string, string> = {
  new: "#94a3b8",
  indeterminate: "#3b82f6",
  done: "#10b981",
  unknown: "#cbd5e1",
};

export default function StatusDonut({ data }: { data: StatusSlice[] }) {
  const total = data.reduce((s, d) => s + Number(d.n), 0);
  return (
    <div>
      <div style={{ width: "100%", height: 190, position: "relative" }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="n" nameKey="category" innerRadius={58} outerRadius={82} paddingAngle={2} stroke="none">
              {data.map((d) => (
                <Cell key={d.category} fill={COLORS[d.category] ?? "#cbd5e1"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 10, fontSize: 12 }}
              formatter={(v: any, n: any) => [v, LABELS[n] ?? n]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 680, letterSpacing: "-0.5px" }}>{total}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>issues</div>
          </div>
        </div>
      </div>
      <div className="legend" style={{ justifyContent: "center" }}>
        {data.map((d) => (
          <span key={d.category}>
            <i style={{ background: COLORS[d.category] ?? "#cbd5e1" }} />
            {LABELS[d.category] ?? d.category} · {d.n}
          </span>
        ))}
      </div>
    </div>
  );
}
