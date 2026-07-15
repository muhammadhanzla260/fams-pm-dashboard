import { getThroughput, getStatusMix, listMembers } from "@/lib/metrics";
import ThroughputChart from "@/components/ThroughputChart";
import StatusDonut from "@/components/StatusDonut";
import SprintMetricsSection from "@/components/SprintMetrics";
import RefreshTimer from "@/components/RefreshTimer";
import Reports from "@/components/Reports";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [trend, statusMix, memberNames] = await Promise.all([
    getThroughput(),
    getStatusMix(),
    listMembers(),
  ]);

  return (
    <main className="wrap">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">F</div>
          <div>
            <h1>FAMS — team delivery</h1>
            <p>IWMP &amp; V5 team · scope: {process.env.JIRA_SCOPE_JQL || "created >= -12w"}</p>
          </div>
        </div>
        <div className="chips">
          <RefreshTimer />
        </div>
      </div>

      {/* One shared date range drives per-member, team totals, and the Dev/QA tables.
          The charts + sprint section are passed as children so layout order is preserved. */}
      <Reports members={memberNames}>
        <div className="grid-2" style={{ marginTop: 26 }}>
          <div className="panel">
            <h3>Throughput</h3>
            <p className="hint">Completed, delivered and reopened per week · last 12 weeks</p>
            <ThroughputChart data={trend} />
          </div>
          <div className="panel">
            <h3>Work mix</h3>
            <p className="hint">Team issues by status category</p>
            <StatusDonut data={statusMix} />
          </div>
        </div>

        <SprintMetricsSection />
      </Reports>
    </main>
  );
}
