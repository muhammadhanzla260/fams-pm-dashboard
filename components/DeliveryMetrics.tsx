"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { DeliveryMetrics } from "@/lib/metrics";

// This team doesn't run sprints — delivery metrics follow the same shared date range
// as the rest of the dashboard (all tickets worked on in [from, to]).
export default function DeliveryMetricsSection({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<DeliveryMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const reqId = useRef(0);

  const run = useCallback(async () => {
    const rid = ++reqId.current;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/delivery-metrics?from=${from}&to=${to}`);
      const j = await r.json();
      if (rid !== reqId.current) return;
      if (!r.ok) throw new Error(j.error || "request failed");
      setData(j);
    } catch (e) {
      if (rid === reqId.current) setErr(String(e));
    } finally {
      if (rid === reqId.current) setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    run();
  }, [run]);

  const cards = data
    ? [
        { ic: "indigo", icon: "✦", label: "Tickets", value: data.tickets, sub: "worked on in range" },
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
        {loading && (
          <span className="muted" style={{ fontWeight: 400, display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span className="spinner" /> fetching live from Jira…
          </span>
        )}
      </div>

      {err && <div className="kpi" style={{ color: "var(--color-text-danger, #ef4444)" }}>Delivery metrics failed: {err}</div>}

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
        ) : (
          cards.map((c) => (
            <div className="kpi" key={c.label}>
              <div className={`ic ${c.ic}`}>{c.icon}</div>
              <div className="label">{c.label}</div>
              <div className="value">{String(c.value)}</div>
              <div className="sub">{c.sub}</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
