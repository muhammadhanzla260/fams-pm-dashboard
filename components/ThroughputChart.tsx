"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { TrendPoint } from "@/lib/metrics";

export default function ThroughputChart({ data }: { data: TrendPoint[] }) {
  return (
    <div style={{ width: "100%", height: 260, marginTop: 6 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="gComp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: 10,
              fontSize: 12,
              boxShadow: "var(--shadow)",
            }}
            labelStyle={{ color: "var(--text-2)", fontWeight: 600 }}
          />
          <Area type="monotone" dataKey="completed" name="Completed" stroke="#6366f1" strokeWidth={2.4} fill="url(#gComp)" />
          <Bar dataKey="delivered" name="Delivered" fill="#10b981" radius={[3, 3, 0, 0]} barSize={14} />
          <Line type="monotone" dataKey="reopened" name="Reopened" stroke="#f59e0b" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="legend">
        <span><i style={{ background: "#6366f1" }} />Completed</span>
        <span><i style={{ background: "#10b981" }} />Delivered</span>
        <span><i style={{ background: "#f59e0b" }} />Reopened</span>
      </div>
    </div>
  );
}
