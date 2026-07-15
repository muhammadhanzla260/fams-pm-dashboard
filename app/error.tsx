"use client";

import { useEffect } from "react";

// Graceful recovery for transient render/data failures (e.g. a dropped Neon connection).
// Auto-retries once after a short delay, and offers a manual retry.
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("dashboard render error:", error);
    const t = setTimeout(() => reset(), 2500);
    return () => clearTimeout(t);
  }, [error, reset]);

  return (
    <main className="wrap">
      <div className="panel" style={{ maxWidth: 460, margin: "12vh auto", textAlign: "center" }}>
        <h3 style={{ marginBottom: 8 }}>Couldn’t load the latest data</h3>
        <p className="hint" style={{ marginBottom: 16 }}>
          The database connection blipped — retrying automatically…
        </p>
        <button
          onClick={() => reset()}
          style={{
            background: "var(--accent)", color: "#fff", border: "none",
            borderRadius: "var(--radius-sm)", padding: "9px 18px", fontSize: 13,
            fontWeight: 500, cursor: "pointer",
          }}
        >
          Retry now
        </button>
      </div>
    </main>
  );
}
