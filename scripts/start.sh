#!/bin/sh
# Starts the app. When LITESTREAM_URL is set, the database is first restored from
# cloud storage, then every change is copied back within a second, so restarts and
# deploys keep everyone's data. Without it, the app runs on its local file only.
set -u
export DATABASE_PATH="${DATABASE_PATH:-$PWD/data/allowance.db}"
APP="node_modules/.bin/next start -p ${PORT:-3000}"
if [ -n "${LITESTREAM_URL:-}" ] && [ -x bin/litestream ]; then
  mkdir -p "$(dirname "$DATABASE_PATH")"
  if bin/litestream restore -config litestream.yml -if-db-not-exists -if-replica-exists "$DATABASE_PATH"; then
    exec bin/litestream replicate -config litestream.yml -exec "$APP"
  fi
  echo "litestream: restore failed; starting without replication" >&2
fi
exec $APP
