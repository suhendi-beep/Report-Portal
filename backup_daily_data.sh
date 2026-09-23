#!/bin/bash
# Daily backup for automation-hub critical data files.
# Keeps 14 days of rolling backups so a bad edit or data corruption
# can always be rolled back without relying on manual .bak files.
set -euo pipefail

SRC_DIR="/opt/automation-hub/shared/logs"
BACKUP_DIR="/opt/automation-hub/backups/daily"
DATE=$(date +%Y%m%d)
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"

for f in daily_tasks.json activity_log.json alert_eskalasi.json delete_requests.json; do
  if [ -f "$SRC_DIR/$f" ]; then
    cp "$SRC_DIR/$f" "$BACKUP_DIR/${f%.json}.$DATE.json"
  fi
done

# Prune backups older than retention window
find "$BACKUP_DIR" -type f -name '*.json' -mtime +$RETENTION_DAYS -delete

echo "[$(date -Iseconds)] Backup completed for $DATE" >> "$BACKUP_DIR/backup.log"
