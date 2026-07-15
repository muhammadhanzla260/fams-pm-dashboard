"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { TeamSummary } from "@/lib/metrics";

// Dates come from the shared dashboard filter (props).
export default function TeamSummaryCards({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<TeamSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const reqId = useRef(0);

  const run = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/team-summary?from=${from}&to=${to}`);
      const j = await r.json();
      if (id !== reqId.current) return;
      if (!r.ok) throw new Error(j.error || "request failed");
      setData(j);
    } catch (e) {
      if (id === reqId.current) setErr(String(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    run();
  }, [run]);

  const cards = data
    ? [
        { ic: "indigo", icon: "✦", label: "Total tickets", value: data.total_tickets, sub: "all members, worked on in range" },
        { ic: "amber", icon: "◔", label: "In progress", value: data.in_progress, sub: "of those" },
        { ic: "green", icon: "✓", label: "Completed", value: data.completed, sub: "of those, reached Done" },
        { ic: "blue", icon: "◴", label: "Logged hrs", value: `${data.logged_hrs}h`, sub: "on those tickets" },
        { ic: "red", icon: "◷", label: "Est. hrs", value: `${data.est_hrs}h`, sub: "on those tickets" },
      ]
    : [];

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <h3>Team totals — all members{loading ? " · loading…" : ""}</h3>
      <p className="hint">Combined totals across the whole team for tickets the team <strong>logged work on</strong> in the selected range.</p>

      {err && <div style={{ color: "var(--color-text-danger, #ef4444)", fontSize: 13 }}>{err}</div>}

      <div className="kpis">
        {(data ? cards : Array.from({ length: 5 }).map(() => null)).map((c, i) =>
          c ? (
            <div className="kpi" key={c.label}>
              <div className={`ic ${c.ic}`}>{c.icon}</div>
              <div className="label">{c.label}</div>
              <div className="value">{String(c.value)}</div>
              <div className="sub">{c.sub}</div>
            </div>
          ) : (
            <div className="kpi" key={i}>
              <div className="label">Loading…</div>
              <div className="value" style={{ color: "var(--text-3)" }}>·</div>
              <div className="sub">fetching live from Jira</div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
