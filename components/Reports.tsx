"use client";

import { useState } from "react";
import MemberReport from "./MemberReport";
import TeamSummaryCards from "./TeamSummary";
import TeamTables from "./TeamTables";

const inputStyle: React.CSSProperties = {
  background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-sm)", padding: "8px 10px", fontSize: 13, height: 36, cursor: "pointer",
};

// One date range for the whole dashboard. Draft values live in the pickers; "Apply"
// pushes them to all sections at once (so we don't refetch on every keystroke).
export default function Reports({ members, children }: { members: string[]; children?: React.ReactNode }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [draftFrom, setDraftFrom] = useState(monthAgo);
  const [draftTo, setDraftTo] = useState(today);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const openPicker = (e: React.MouseEvent<HTMLInputElement>) => {
    try {
      (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      /* unsupported — field still works */
    }
  };

  const apply = () => {
    setFrom(draftFrom);
    setTo(draftTo);
  };

  const dirty = draftFrom !== from || draftTo !== to;

  return (
    <>
      <div className="panel" style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>Date range</span>
        <span className="hint" style={{ margin: 0 }}>applies to the whole dashboard</span>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>From</label>
        <input type="date" value={draftFrom} max={draftTo} onChange={(e) => setDraftFrom(e.target.value)} onClick={openPicker} style={inputStyle} />
        <label style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>To</label>
        <input type="date" value={draftTo} min={draftFrom} max={today} onChange={(e) => setDraftTo(e.target.value)} onClick={openPicker} style={inputStyle} />
        <button
          onClick={apply}
          disabled={!dirty}
          style={{
            background: dirty ? "var(--accent)" : "var(--surface)", color: dirty ? "#fff" : "var(--text-3)",
            border: dirty ? "none" : "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
            padding: "9px 18px", fontSize: 13, fontWeight: 500, cursor: dirty ? "pointer" : "default", height: 36,
          }}
        >
          Apply
        </button>
      </div>

      <MemberReport members={members} from={from} to={to} />
      <TeamSummaryCards from={from} to={to} />
      {children}
      <TeamTables from={from} to={to} />
    </>
  );
}
