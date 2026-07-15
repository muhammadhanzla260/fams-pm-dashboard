"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SprintMetrics } from "@/lib/metrics";
import type { SprintInfo } from "@/lib/jira";

const selectStyle: React.CSSProperties = {
  background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-sm)", padding: "8px 10px", fontSize: 13, height: 36, minWidth: 220,
};

export default function SprintMetricsSection() {
  const [sprints, setSprints] = useState<SprintInfo[]>([]);
  const [sprintId, setSprintId] = useState<number | null>(null);
  const [data, setData] = useState<SprintMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const reqId = useRef(0);

  // load sprint list once; default to the active sprint (else newest)
  useEffect(() => {
    fetch("/api/sprints")
      .then((r) => r.json())
      .then((list: SprintInfo[]) => {
        if (!Array.isArray(list) || !list.length) return;
        setSprints(list);
        const active = list.find((s) => s.state === "active") ?? list[0];
        setSprintId(active.id);
      })
      .catch((e) => setErr(String(e)));
  }, []);

  const run = useCallback(async (id: number) => {
    const rid = ++reqId.current;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/sprint-metrics?sprint=${id}`);
      const j = await r.json();
      if (rid !== reqId.current) return;
      if (!r.ok) throw new Error(j.error || "request failed");
      setData(j);
    } catch (e) {
      if (rid === reqId.current) setErr(String(e));
    } finally {
      if (rid === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sprintId != null) run(sprintId);
  }, [sprintId, run]);

  const cards = data
    ? [
        { ic: "indigo", icon: "✦", label: "Tickets in sprint", value: data.tickets, sub: "assigned to the team" },
        { ic: "blue", icon: "▲", label: "Delivered", value: data.delivered, sub: "reached Released / Deployed" },
        { ic: "amber", icon: "◴", label: "Logged hrs", value: `${data.logged_hrs}h`, sub: "total man-hours logged" },
        { ic: "red", icon: "◷", label: "Est. hrs", value: `${data.est_hrs}h`, sub: "total original estimate" },
        { ic: "green", icon: "◴", label: "Time invested", value: `${data.person_days} pd`, sub: "person-days · logged ÷ 6h" },
      ]
    : [];

  return (
    <>
      <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span>Delivery metrics</span>
        <span className="muted" style={{ fontWeight: 400 }}>· by sprint</span>
        {loading && (
          <span className="muted" style={{ fontWeight: 400, display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span className="spinner" /> fetching live from Jira…
          </span>
        )}
        <span style={{ flex: 1 }} />
        <select
          value={sprintId ?? ""}
          onChange={(e) => setSprintId(Number(e.target.value))}
          style={selectStyle}
          disabled={!sprints.length || loading}
        >
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}{s.state === "active" ? " (active)" : s.state === "future" ? " (future)" : ""}
            </option>
          ))}
        </select>
      </div>

      {err && <div className="kpi" style={{ color: "var(--color-text-danger, #ef4444)" }}>Sprint metrics failed: {err}</div>}

      <div className="kpis">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div className="kpi" key={`sk-${i}`} aria-busy="true">
              <span className="skeleton" style={{ width: 30, height: 30, borderRadius: 8, marginBottom: 12 }} />
              <span className="skeleton" style={{ width: "55%", height: 11, marginBottom: 12 }} />
              <span className="skeleton" style={{ width: "42%", height: 22, marginBottom: 10 }} />
              <span className="skeleton" style={{ width: "75%", height: 9 }} />
            </div>
          ))
        ) : data ? (
          cards.map((c) => (
            <div className="kpi" key={c.label}>
              <div className={`ic ${c.ic}`}>{c.icon}</div>
              <div className="label">{c.label}</div>
              <div className="value">{String(c.value)}</div>
              <div className="sub">{c.sub}</div>
            </div>
          ))
        ) : (
          <div className="kpi"><div className="sub">Select a sprint</div></div>
        )}
      </div>
    </>
  );
}
