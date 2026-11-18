#!/usr/bin/env bash
# Owned disposable DB only. Cached image; no pull/network/ports/production DSN.
set -euo pipefail
image=mysql:8.4
docker image inspect "$image" >/dev/null
qa_billing_root=$(mktemp -d /tmp/crewcheck-billing-intent-qa.XXXXXXXX)
container="$(basename "$qa_billing_root")"
legacy_socket_root=/tmp/crewcheck-notification-qa-socket
output_dir=${BILLING_INTENT_EVIDENCE_DIR:-artifacts/billing-contracting-intent}
mkdir -p "$output_dir"
printf '%s\n' billing-intent-qa-owned > "$qa_billing_root/.owned-qa"
legacy_owned=false
run_legacy=${BILLING_INTENT_RUN_LEGACY_SQL:-1}
test "$run_legacy" = 0 || test "$run_legacy" = 1
cleanup() {
  for owned_container in "$container" "${container}-init"; do
    if test "$(docker inspect --format '{{index .Config.Labels "crewcheck.qa-root"}}' "$owned_container" 2>/dev/null || true)" = "$qa_billing_root"; then
      docker rm -f "$owned_container" >/dev/null 2>&1 || { printf '%s\n' 'Owned QA container cleanup failed' >&2; return 1; }
    fi
  done
  if test -f "$qa_billing_root/mysql.log"; then cp "$qa_billing_root/mysql.log" "$output_dir/server.log"; fi
  if test "$legacy_owned" = true && test "$(cat "$legacy_socket_root/.owned-billing-qa" 2>/dev/null || true)" = "$qa_billing_root"; then rm -rf -- "$legacy_socket_root"; fi
  if test "$(cat "$qa_billing_root/.owned-qa" 2>/dev/null || true)" = billing-intent-qa-owned; then rm -rf -- "$qa_billing_root"; fi
}
trap cleanup EXIT
# Do not reuse or overwrite another owner's QA socket.
if test "$run_legacy" = 1; then
mkdir "$legacy_socket_root"
legacy_owned=true
printf '%s\n' "$qa_billing_root" > "$legacy_socket_root/.owned-billing-qa"
ln -s "$qa_billing_root/mysql.sock" "$legacy_socket_root/mysqld.sock"
fi
docker run --rm --name "${container}-init" --label "crewcheck.qa-root=$qa_billing_root" --network none --memory 512m --cpus 1 --user "$(id -u):$(id -g)" --mount "type=bind,src=$qa_billing_root,dst=$qa_billing_root" --entrypoint mysqld "$image" --no-defaults --initialize-insecure --datadir="$qa_billing_root/data" --mysqlx=OFF > "$output_dir/initialize.log" 2>&1
start() {
 docker run --detach --name "$container" --label "crewcheck.qa-root=$qa_billing_root" --network none --memory 512m --cpus 1 --user "$(id -u):$(id -g)" --mount "type=bind,src=$qa_billing_root,dst=$qa_billing_root" --entrypoint mysqld "$image" --no-defaults --datadir="$qa_billing_root/data" --socket="$qa_billing_root/mysql.sock" --pid-file="$qa_billing_root/mysql.pid" --log-error="$qa_billing_root/mysql.log" --skip-networking --mysqlx=OFF --skip-log-bin --innodb-buffer-pool-size=64M --performance-schema=OFF > /dev/null
 for attempt in $(seq 1 60); do
  if docker exec "$container" mysqladmin --no-defaults --socket="$qa_billing_root/mysql.sock" --user=root ping >/dev/null 2>&1; then return; fi
  sleep 1
 done
 cat "$qa_billing_root/mysql.log"
 return 1
}
start
docker exec "$container" mysql --no-defaults --socket="$qa_billing_root/mysql.sock" --user=root --execute='CREATE DATABASE crewcheck_billing_intent_qa;'
docker exec "$container" mysql --no-defaults --socket="$qa_billing_root/mysql.sock" --user=root --execute='CREATE DATABASE crewcheck_google_billing_qa;'
docker exec "$container" mysql --no-defaults --socket="$qa_billing_root/mysql.sock" --user=root --execute='CREATE DATABASE crewcheck_cancellation_qa;'
docker exec "$container" mysql --no-defaults --socket="$qa_billing_root/mysql.sock" --user=root --execute='CREATE DATABASE crewcheck_cancel_intent_qa;'
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-billing-cancellation-intent-mysql.mjs > "$output_dir/cancellation-intent.log" 2>&1
docker exec "$container" mysql --no-defaults --socket="$qa_billing_root/mysql.sock" --user=root --execute='CREATE DATABASE crewcheck_cancel_auth_qa;'
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-billing-cancellation-admission-mysql.mjs > "$output_dir/cancellation-auth.log" 2>&1
docker exec "$container" mysql --no-defaults --socket="$qa_billing_root/mysql.sock" --user=root --execute='CREATE DATABASE crewcheck_cancel_route_qa;'
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-billing-cancellation-route-mysql.mjs > "$output_dir/cancellation-route.log" 2>&1
docker exec "$container" mysql --no-defaults --socket="$qa_billing_root/mysql.sock" --user=root --execute='CREATE DATABASE crewcheck_google_event_qa;'
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-google-event-transaction-mysql.mjs > "$output_dir/google-event-transaction.log" 2>&1
docker exec "$container" mysql --no-defaults --socket="$qa_billing_root/mysql.sock" --user=root --execute='CREATE DATABASE crewcheck_google_observation_qa;'
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-google-event-observation-mysql.mjs > "$output_dir/google-event-observation.log" 2>&1
docker exec "$container" mysql --no-defaults --socket="$qa_billing_root/mysql.sock" --user=root --execute='CREATE DATABASE crewcheck_reference_qa;'
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-reference-payment-binding-mysql.mjs > "$output_dir/reference-binding.log" 2>&1
for qa_cancel_timezone in UTC America/Sao_Paulo Pacific/Auckland; do
 CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" TZ="$qa_cancel_timezone" node scripts/regression-billing-cancellation-mysql.mjs >> "$output_dir/cancellation.log" 2>&1
done
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-google-subscription-write-mysql.mjs > "$output_dir/google-write.log" 2>&1
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-google-rtdn-owner-first-mysql.mjs > "$output_dir/google-rtdn.log" 2>&1
if test "$run_legacy" = 1; then
docker exec "$container" mysql --no-defaults --socket="$qa_billing_root/mysql.sock" --user=root --execute='CREATE DATABASE crewcheck_notification_qa;'
CREWCHECK_NOTIFICATION_QA=isolated-mysql CREWCHECK_QA_MYSQL_SOCKET="$legacy_socket_root/mysqld.sock" node scripts/regression-platform-entitlement-mysql.mjs > "$output_dir/legacy-entitlement.log" 2>&1
CREWCHECK_NOTIFICATION_QA=isolated-mysql CREWCHECK_QA_MYSQL_SOCKET="$legacy_socket_root/mysqld.sock" node scripts/regression-asaas-webhook-mysql.mjs > "$output_dir/legacy-asaas.log" 2>&1
fi
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" BILLING_INTENT_EVIDENCE_DIR="$output_dir" node scripts/regression-billing-contracting-intent-mysql.mjs
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" BILLING_INTENT_EVIDENCE_DIR="$output_dir" node scripts/regression-billing-contracting-driver-mysql.mjs
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-billing-admission-mysql.mjs > "$output_dir/admission.log" 2>&1
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-google-async-admission-mysql.mjs > "$output_dir/google-async.log" 2>&1
# Restart the same owned datadir; no new server or provider state is substituted.
docker stop --timeout 20 "$container" >/dev/null
docker rm "$container" >/dev/null
start
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-billing-contracting-intent-mysql.mjs restart > "$output_dir/restart.log" 2>&1
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-billing-cancellation-intent-mysql.mjs restart > "$output_dir/cancellation-intent-restart.log" 2>&1
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-billing-cancellation-admission-mysql.mjs restart > "$output_dir/cancellation-auth-restart.log" 2>&1
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-google-event-transaction-mysql.mjs restart > "$output_dir/google-event-restart.log" 2>&1
CREWCHECK_BILLING_INTENT_QA=isolated-mysql CREWCHECK_BILLING_INTENT_QA_ROOT="$qa_billing_root" node scripts/regression-google-event-observation-mysql.mjs restart > "$output_dir/google-observation-restart.log" 2>&1
cp "$qa_billing_root/mysql.log" "$output_dir/server.log"
printf '%s\n' 'PASS owned local MySQL suite and restart; no network/provider/production DB'
