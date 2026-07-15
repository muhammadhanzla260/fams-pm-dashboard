// A row of ticket badges, each linking straight to Jira. Shared by every ticket-level
// drill-down across the dashboard (per-member report, team tables).
export default function TicketBadges({ tickets }: { tickets: { key: string; url: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {tickets.map((t) => (
        <a
          key={t.key}
          href={t.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${t.key} in Jira`}
          style={{
            fontSize: 11.5, fontWeight: 500, color: "var(--text-secondary)",
            border: "0.5px solid var(--border-strong)", borderRadius: 4, padding: "2px 7px",
            whiteSpace: "nowrap", textDecoration: "none",
          }}
        >
          {t.key}
        </a>
      ))}
    </div>
  );
}
