#!/bin/bash
# Daily auto-commit for automation-hub source code.
# This ensures every change to backend/frontend is captured in git
# history automatically, so a bad edit can always be diffed/rolled
# back with `git log` / `git diff` / `git checkout` — no more relying
# on manually-named .backup/.before-* files that get lost or misused.
set -euo pipefail

cd /opt/automation-hub

# Only commit tracked source directories; .gitignore already excludes
# backup files, shared/ runtime data, node_modules, etc.
git add backend frontend docker-compose.yml nginx 2>/dev/null || true

if ! git diff --cached --quiet; then
  git commit -m "Auto-snapshot $(date +%Y-%m-%d\ %H:%M)" >> /opt/automation-hub/backups/daily/git-snapshot.log 2>&1
  echo "[$(date -Iseconds)] Auto-committed changes" >> /opt/automation-hub/backups/daily/git-snapshot.log
else
  echo "[$(date -Iseconds)] No changes to commit" >> /opt/automation-hub/backups/daily/git-snapshot.log
fi
