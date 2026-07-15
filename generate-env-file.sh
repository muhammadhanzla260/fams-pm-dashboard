# generate .env file based on repository variables
echo "" > .env
echo DATABASE_URL="${DATABASE_URL}" >> .env
echo JIRA_EMAIL="${JIRA_EMAIL}" >> .env
echo JIRA_API_TOKEN="${JIRA_API_TOKEN}" >> .env
echo JIRA_BASE_URL="${JIRA_BASE_URL}" >> .env
echo JIRA_PROJECTS="${JIRA_PROJECTS}" >> .env
echo JIRA_SCOPE_JQL="${JIRA_SCOPE_JQL}" >> .env
echo WEBHOOK_SECRET="${WEBHOOK_SECRET}" >> .env
echo CRON_SECRET="${CRON_SECRET}" >> .env