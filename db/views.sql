-- Derived metric views. The dashboard API only ever SELECTs from these.
-- Re-runnable (CREATE OR REPLACE).

-- A status transition is a "completion" the first time an issue enters a done-category status.
CREATE OR REPLACE VIEW v_completions AS
SELECT DISTINCT ON (t.issue_id)
       t.issue_id, t.at AS completed_at
FROM issue_transitions t
WHERE t.field = 'status' AND t.to_category = 'done'
ORDER BY t.issue_id, t.at ASC;

-- "Delivered" = entering the configured delivered status (default 'Ready for Production'), first time.
-- delivered_status may hold a comma-separated list (workflow renamed its ship step over time:
-- legacy "Ready For Deployment" -> current "Released"/"Deployed").
CREATE OR REPLACE VIEW v_deliveries AS
SELECT DISTINCT ON (t.issue_id)
       t.issue_id, t.at AS delivered_at
FROM issue_transitions t
WHERE t.field = 'status'
  AND trim(t.to_string) = ANY (
    SELECT trim(s) FROM regexp_split_to_table(
      (SELECT value FROM report_config WHERE key = 'delivered_status'), ',') AS s
  )
ORDER BY t.issue_id, t.at ASC;

-- Cycle time per issue: first time it entered "in progress" -> first time it reached "done".
-- Used for the median cycle-time metric. Excludes issues never started or never done.
CREATE OR REPLACE VIEW v_cycle AS
WITH starts AS (
  SELECT issue_id, min(at) AS started_at
  FROM issue_transitions
  WHERE field = 'status' AND to_category = 'indeterminate'
  GROUP BY issue_id
),
dones AS (
  SELECT issue_id, min(at) AS done_at
  FROM issue_transitions
  WHERE field = 'status' AND to_category = 'done'
  GROUP BY issue_id
)
SELECT d.issue_id,
       extract(epoch FROM (d.done_at - s.started_at)) / 86400.0 AS cycle_days
FROM dones d
JOIN starts s ON s.issue_id = d.issue_id
WHERE d.done_at > s.started_at;

-- A "reopen" is a transition out of done back into a non-done status (one row per reopen event).
CREATE OR REPLACE VIEW v_reopens AS
SELECT t.issue_id, t.at AS reopened_at
FROM issue_transitions t
WHERE t.field = 'status'
  AND t.from_category = 'done'
  AND t.to_category <> 'done';

-- Per-member rollup. Aggregate per issue FIRST (so multi-row joins like reopens/worklogs
-- don't fan out and double-count), then group by the issue's current assignee.
CREATE OR REPLACE VIEW v_member_stats AS
WITH per_issue AS (
  SELECT
    i.id,
    i.assignee_id,
    i.assignee_name,
    (i.status_category <> 'done')        AS is_open,
    i.original_estimate_s,
    (c.issue_id IS NOT NULL)::int        AS is_completed,
    (d.issue_id IS NOT NULL)::int        AS is_delivered,
    COALESCE(rc.cnt, 0)                  AS reopen_count,
    COALESCE(wl.logged_s, 0)             AS logged_s
  FROM issues i
  LEFT JOIN v_completions c ON c.issue_id = i.id
  LEFT JOIN v_deliveries  d ON d.issue_id = i.id
  LEFT JOIN (SELECT issue_id, count(*) AS cnt      FROM v_reopens GROUP BY issue_id) rc ON rc.issue_id = i.id
  LEFT JOIN (SELECT issue_id, sum(time_spent_s) AS logged_s FROM worklogs GROUP BY issue_id) wl ON wl.issue_id = i.id
  WHERE i.assignee_id IS NOT NULL
)
SELECT
  assignee_id,
  max(assignee_name)                                              AS member,
  count(*) FILTER (WHERE is_open)                                 AS assigned_open,
  count(*)                                                        AS assigned_total,
  sum(is_completed)                                               AS completed,
  sum(is_delivered)                                               AS delivered,
  sum(reopen_count)                                               AS reopened,
  sum(logged_s)                                                   AS logged_s,
  sum(original_estimate_s) FILTER (WHERE original_estimate_s IS NOT NULL) AS estimated_s
FROM per_issue
GROUP BY assignee_id;
