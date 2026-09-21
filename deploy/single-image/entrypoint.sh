#!/bin/sh
set -eu
cd /app/runtime
case "${1:-serve}" in
  serve)
    # Fail before opening the HTTP port if configuration or migration is invalid.
    ./node_modules/.bin/tsx scripts/migrate.ts
    ./node_modules/.bin/tsx scripts/seed.ts
    exec /usr/bin/supervisord -c /etc/supervisor/rail.conf
    ;;
  migrate) exec ./node_modules/.bin/tsx scripts/migrate.ts ;;
  seed) exec ./node_modules/.bin/tsx scripts/seed.ts ;;
  *) exec "$@" ;;
esac
