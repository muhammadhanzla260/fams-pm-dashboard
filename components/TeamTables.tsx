"use client";

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import type { TeamTables, DevRow, QaRow } from "@/lib/metrics";
import TicketBadges from "./TicketBadges";

type QaField = keyof QaRow["tickets"];
const QA_FIELD_LABEL: Record<QaField, string> = {
  total: "Tested", dev: "Dev", preview: "Preview", staging: "Staging", prod: "Prod", delivered: "Delivered",
};

const AVATAR_COLORS = ["#6366f1", "#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#ef4444"];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

function Person({ name }: { name: string }) {
  return (
    <span className="person">
      <span className="avatar" style={{ background: avatarColor(name) }}>{initials(name)}</span>
      <span className="nm">{name}</span>
    </span>
  );
}

export default function TeamTables({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<TeamTables | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const reqId = useRef(0);
  const [openCell, setOpenCell] = useState<{ member: string; field: QaField } | null>(null);
  const toggleCell = (member: string, field: QaField) =>
    setOpenCell((cur) => (cur?.member === member && cur?.field === field ? null : { member, field }));

  const run = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/team-tables?from=${from}&to=${to}`);
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

  const sum = <T,>(rows: T[], k: keyof T) => rows.reduce((s, r) => s + Number(r[k] as any), 0);

  return (
    <>
      <div className="section-title">
        Dev Team <span className="muted">· {data ? data.dev.length : ""}{loading ? " · loading…" : ""}</span>
      </div>
      <div className="tablecard" style={{ marginBottom: 18 }}>
        {!data ? (
          <div className="empty">{loading ? "Loading…" : "—"}</div>
        ) : (
          <table>
            <thead>
              <tr><th>Member</th><th>Assigned</th><th>Completed</th><th>Delivered</th><th>Logged / Est</th></tr>
            </thead>
            <tbody>
              {data.dev.map((m: DevRow) => (
                <tr key={m.member}>
                  <td><Person name={m.member} /></td>
                  <td>{m.assigned_open} <span className="muted">/ {m.assigned_total}</span></td>
                  <td>{m.completed}</td>
                  <td>{m.delivered}</td>
                  <td className="muted">{m.logged_hrs}h / {m.est_hrs}h</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="subtotal">
                <td>Dev Team total</td>
                <td>{sum(data.dev, "assigned_open")} <span className="muted">/ {sum(data.dev, "assigned_total")}</span></td>
                <td>{sum(data.dev, "completed")}</td>
                <td>{sum(data.dev, "delivered")}</td>
                <td className="muted">{Math.round(sum(data.dev, "logged_hrs"))}h / {Math.round(sum(data.dev, "est_hrs"))}h</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div className="section-title">
        QA Team <span className="muted">· {data ? data.qa.length : ""}</span> <span className="muted" style={{ fontWeight: 400 }}>· measured by tickets tested</span>
      </div>
      <div className="tablecard" style={{ marginBottom: 18 }}>
        {err && <div className="empty" style={{ color: "var(--color-text-danger, #ef4444)" }}>{err}</div>}
        {!data ? (
          <div className="empty">{loading ? "Loading…" : "—"}</div>
        ) : (
          <table>
            <thead>
              <tr><th>Member</th><th>Tested</th><th>Dev</th><th>Preview</th><th>Staging</th><th>Prod</th><th>Delivered</th></tr>
            </thead>
            <tbody>
              {data.qa.map((m: QaRow) => {
                const cell = (field: QaField, value: number) => (
                  <td
                    onClick={() => value > 0 && toggleCell(m.member, field)}
                    style={value > 0 ? { cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textDecorationColor: "var(--border-strong)" } : undefined}
                    title={value > 0 ? "Click to see the tickets" : undefined}
                  >
                    {value}
                  </td>
                );
                const open = openCell?.member === m.member ? openCell.field : null;
                return (
                  <Fragment key={m.member}>
                    <tr>
                      <td><Person name={m.member} /></td>
                      {cell("total", m.tested_total)}
                      {cell("dev", m.tested_dev)}
                      {cell("preview", m.tested_preview)}
                      {cell("staging", m.tested_staging)}
                      {cell("prod", m.tested_prod)}
                      {cell("delivered", m.delivered)}
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={7} style={{ background: "var(--surface)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "4px 0" }}>
                            <span className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{QA_FIELD_LABEL[open]}:</span>
                            <TicketBadges tickets={m.tickets[open]} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="subtotal">
                <td>QA Team total</td>
                <td>{sum(data.qa, "tested_total")}</td>
                <td>{sum(data.qa, "tested_dev")}</td>
                <td>{sum(data.qa, "tested_preview")}</td>
                <td>{sum(data.qa, "tested_staging")}</td>
                <td>{sum(data.qa, "tested_prod")}</td>
                <td>{sum(data.qa, "delivered")}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}
