-- FAMS Jira reporting — core schema
-- All metrics are derived from issue state + an append-only change history,
-- because resolutiondate is unreliable and statuses are non-standard on this instance.

-- Status dimension: lets us classify any status id by its category (to-do / in-progress / done).
-- Built/refreshed from GET /rest/api/3/status. The changelog only carries status id + name,
-- so this table is what makes "completed" and "reopened" computable.
CREATE TABLE IF NOT EXISTS status_dim (
  id            text PRIMARY KEY,          -- Jira status id, e.g. '10028'
  name          text NOT NULL,             -- e.g. 'Archived', 'Ready for Production'
  category_key  text NOT NULL              -- 'new' | 'indeterminate' | 'done'
);

-- Small key/value config so reporting rules can change without a redeploy.
CREATE TABLE IF NOT EXISTS report_config (
  key    text PRIMARY KEY,
  value  text NOT NULL
);
-- "Delivered" = entering any ship status. FM's workflow renamed this over time
-- (legacy 'Ready For Deployment' -> current 'Released'/'Deployed'). Comma-separated list.
INSERT INTO report_config (key, value) VALUES ('delivered_status', 'Released,Deployed,Ready For Deployment')
  ON CONFLICT (key) DO NOTHING;

-- IWMP & V5 team roster. Every dashboard metric is scoped to these accounts.
-- One person may have multiple account_ids (same display_name) → their rows merge.
-- Seeded from db/team.sql (account ids are instance-specific).
CREATE TABLE IF NOT EXISTS team_members (
  account_id   text PRIMARY KEY,
  display_name text NOT NULL,
  team         text NOT NULL DEFAULT 'Dev'   -- 'Dev' | 'QA'
);

-- Current state of each issue (upserted on every event / sweep).
CREATE TABLE IF NOT EXISTS issues (
  id                   text PRIMARY KEY,   -- Jira numeric issue id
  key                  text UNIQUE NOT NULL,
  project_key          text NOT NULL,
  issue_type           text,
  reporter_id          text,
  reporter_name        text,
  assignee_id          text,
  assignee_name        text,
  status_id            text,
  status_name          text,
  status_category      text,               -- denormalized from status_dim for fast filtering
  original_estimate_s  bigint,             -- NULL = not tracked
  time_spent_s         bigint,             -- NULL = not tracked
  created              timestamptz,
  resolutiondate       timestamptz,        -- often NULL here; kept for completeness, not relied on
  updated              timestamptz,
  summary              text,
  labels               text[],
  is_hotfix            boolean NOT NULL DEFAULT false, -- 'hotfix' label OR summary starts 'HOTFIX ||'
  raw                  jsonb               -- last raw fields payload, for debugging / re-derivation
);
CREATE INDEX IF NOT EXISTS issues_assignee_idx ON issues (assignee_id);
CREATE INDEX IF NOT EXISTS issues_project_idx  ON issues (project_key);
CREATE INDEX IF NOT EXISTS issues_category_idx ON issues (status_category);

-- Sprint dimension + membership (from the Sprint field, customfield_10020).
-- Powers commitment-vs-delivery. Membership reflects the issue's CURRENT sprint(s).
CREATE TABLE IF NOT EXISTS sprints (
  id         text PRIMARY KEY,
  name       text,
  state      text,                  -- 'active' | 'closed' | 'future'
  start_date timestamptz,
  end_date   timestamptz,
  board_id   int
);
CREATE TABLE IF NOT EXISTS issue_sprints (
  issue_id  text NOT NULL,
  sprint_id text NOT NULL,
  PRIMARY KEY (issue_id, sprint_id)
);
CREATE INDEX IF NOT EXISTS issue_sprints_sprint_idx ON issue_sprints (sprint_id);

-- Append-only history of field changes we care about (status + assignee).
-- Idempotent on (issue_id, changelog_item_id) so replays/sweeps don't double-count.
CREATE TABLE IF NOT EXISTS issue_transitions (
  issue_id          text NOT NULL,
  changelog_item_id text NOT NULL,         -- history.id + ':' + item index
  field             text NOT NULL,         -- 'status' | 'assignee'
  from_value        text,                  -- status/assignee id
  from_string       text,
  to_value          text,
  to_string         text,
  from_category     text,                  -- resolved via status_dim (status rows only)
  to_category       text,
  author_id         text,
  author_name       text,
  at                timestamptz NOT NULL,
  PRIMARY KEY (issue_id, changelog_item_id)
);
CREATE INDEX IF NOT EXISTS transitions_issue_idx ON issue_transitions (issue_id);
CREATE INDEX IF NOT EXISTS transitions_at_idx    ON issue_transitions (at);
CREATE INDEX IF NOT EXISTS transitions_field_idx ON issue_transitions (field);

-- Worklogs (who logged how much, when). Append/upsert by worklog id.
CREATE TABLE IF NOT EXISTS worklogs (
  id            text PRIMARY KEY,
  issue_id      text NOT NULL,
  author_id     text,
  author_name   text,
  time_spent_s  bigint NOT NULL,
  started       timestamptz,
  created       timestamptz
);
CREATE INDEX IF NOT EXISTS worklogs_issue_idx  ON worklogs (issue_id);
CREATE INDEX IF NOT EXISTS worklogs_author_idx ON worklogs (author_id);

-- Tracks the last successful sweep so reconcile only re-pulls a recent window.
CREATE TABLE IF NOT EXISTS sync_state (
  key        text PRIMARY KEY,
  last_run   timestamptz
);
