#!/usr/bin/env bash
# GitHub runner only: disposable database, no network, no published ports.
set -euo pipefail
checkout=$(pwd -P)
head_sha=$(git rev-parse HEAD)
test -z "$(git status --porcelain)"
qa_root=$(mktemp -d /tmp/crewcheck-infobip-sql.XXXXXXXX)
printf '%s\n' "$head_sha" > "$qa_root/.owned-qa"
container="$(basename "$qa_root")"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  if test -f "$qa_root/.owned-qa" && test "$(cat "$qa_root/.owned-qa")" = "$head_sha"; then
    rm -rf -- "$qa_root"
  fi
}
trap cleanup EXIT
image=mysql:8.4
docker pull "$image"
docker run --rm --network none --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$qa_root,dst=$qa_root" --entrypoint mysqld "$image" \
  --no-defaults --initialize-insecure --datadir="$qa_root/data" --mysqlx=OFF
start() {
  docker run --detach --name "$container" --network none --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=$qa_root,dst=$qa_root" --entrypoint mysqld "$image" \
    --no-defaults --datadir="$qa_root/data" --socket="$qa_root/mysql.sock" \
    --pid-file="$qa_root/mysql.pid" --log-error="$qa_root/mysql.log" \
    --skip-networking --mysqlx=OFF --skip-log-bin --innodb-buffer-pool-size=64M --performance-schema=OFF
  for attempt in $(seq 1 60); do
    if docker exec "$container" mysqladmin --no-defaults --socket="$qa_root/mysql.sock" --user=root ping >/dev/null 2>&1; then return; fi
    sleep 1
  done
  cat "$qa_root/mysql.log"
  return 1
}
node scripts/regression-infobip-whatsapp-mysql.mjs preflight "$checkout" unused unused "$head_sha"
start
node scripts/regression-infobip-whatsapp-mysql.mjs suite "$checkout" "$qa_root/mysql.sock" "$qa_root" "$head_sha"
docker stop --time 20 "$container"
docker rm "$container"
start
node scripts/regression-infobip-whatsapp-mysql.mjs restart "$checkout" "$qa_root/mysql.sock" "$qa_root" "$head_sha"
