#!/bin/sh
set -eu
for program in nginx api worker; do
  supervisorctl -c /etc/supervisor/rail.conf status "$program" | grep -q 'RUNNING'
done
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8080/api/v1/health/ready > /dev/null
