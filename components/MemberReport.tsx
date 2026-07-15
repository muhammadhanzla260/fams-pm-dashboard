"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { AssigneeReport, QaReport } from "@/lib/metrics";

type Report = (AssigneeReport & { kind?: "dev" }) | QaReport;

const inputStyle: React.CSSProperties = {
  background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-sm)", padding: "8px 10px", fontSize: 13, height: 36,
};

// Dates come from the shared dashboard filter (props). Member is selected here.
// The data-fetching + rendering logic is unchanged from the verified version.
export default function MemberReport({ members, from, to }: { members: string[]; from: string; to: string }) {
  const [member, setMember] = useState(members[0] ?? "");
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const reqId = useRef(0);

  const run = useCallback(async () => {
    if (!member) return;
    const id = ++reqId.current; // only the latest request is allowed to set state
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/report?member=${encodeURIComponent(member)}&from=${from}&to=${to}`);
      const j = await r.json();
      if (id !== reqId.current) return; // a newer request superseded this one
      if (!r.ok) throw new Error(j.error || "request failed");
      setData(j);
    } catch (e) {
      if (id === reqId.current) setErr(String(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [member, from, to]);

  useEffect(() => {
    run();
  }, [run]);

  const cards = !data
    ? []
    : data.kind === "qa"
    ? [
        { label: "Tickets tested", value: data.tested_total, sub: "any stage, created in range" },
        { label: "Tested on Dev", value: data.tested_dev, sub: "stage: dev" },
        { label: "Tested on Preview", value: data.tested_preview, sub: "stage: preview" },
        { label: "Tested on Prod", value: data.tested_prod, sub: "stage: prod" },
        { label: "Delivered", value: data.delivered, sub: "of tested, reached Released / Deployed" },
      ]
    : [
        { label: "Total assigned", value: data.total_assigned, sub: "tickets worked on in range" },
        { label: "In progress", value: data.in_progress, sub: "of those" },
        { label: "Completed", value: data.completed, sub: "of those, reached Done" },
        { label: "Logged hrs", value: `${data.logged_hrs}h`, sub: "on those tickets" },
        { label: "Est. hrs", value: `${data.est_hrs}h`, sub: "on those tickets" },
      ];

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <h3>Per-member report</h3>
      <p className="hint">Devs are measured by tickets they <strong>logged work on</strong> in the selected range (assigned to them); <strong>QA members by tickets they tested</strong> (Tested on Dev / Preview / Prod, created in range).</p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <select value={member} onChange={(e) => setMember(e.target.value)} style={{ ...inputStyle, minWidth: 200 }}>
          {members.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        {loading && <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Loading…</span>}
      </div>

      {err && <div style={{ color: "var(--color-text-danger, #ef4444)", fontSize: 13 }}>{err}</div>}

      {data && (
        <>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
            <strong style={{ fontWeight: 500 }}>{data.member}</strong> · {data.from} → {data.to}
          </div>
          <div className="kpis">
            {cards.map((c) => (
              <div className="kpi" key={c.label}>
                <div className="label">{c.label}</div>
                <div className="value">{String(c.value)}</div>
                <div className="sub">{c.sub}</div>
              </div>
            ))}
          </div>

          {data.status_breakdown.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Breakdown by status</div>
              <div style={{ display: "grid", gap: 8 }}>
                {data.status_breakdown.map((s) => {
                  const color =
                    s.category === "done" ? "var(--green)" : s.category === "indeterminate" ? "var(--blue)" : "var(--text-3)";
                  return (
                    <div
                      key={s.status}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "9px 12px",
                        border: "0.5px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
                          color, border: `1px solid ${color}`, borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap",
                        }}
                      >
                        {s.status}
                      </span>
                      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        {s.count} work item{s.count === 1 ? "" : "s"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
