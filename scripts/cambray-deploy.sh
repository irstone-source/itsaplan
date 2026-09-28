#!/usr/bin/env bash
# Deploys this branch to the Cambray It's a Plan instance on Railway (project
# "itsaplan": plan.cambray.co / plan-api.cambray.co).
#
#   scripts/cambray-deploy.sh                 print the plan, change nothing
#   scripts/cambray-deploy.sh --apply         back up, build, deploy
#   scripts/cambray-deploy.sh --backup        only dump the production database
#   scripts/cambray-deploy.sh --rollback FILE point every service back at the
#                                             images recorded in FILE
#
# Steps with --apply:
#   1. preflight: clean tree, branch pushed, railway + gh signed in
#   2. record the running images in a rollback file
#   3. dump the production database over `railway ssh` (pg_dump 18 inside the
#      postgres container) to ~/backups/itsaplan and check the dump is complete
#   4. push the release tag to the public images mirror and run publish-images.yml
#   5. set SKIP_PRE_MIGRATION_BACKUP=1 on api (step 3 is the backup; the one the
#      api takes inside its container is lost when the container restarts)
#   6. switch api (it runs the migrations), then worker, bot, web, waiting for each
#      deployment to succeed and checking the public endpoints
#
# Env overrides: TAG (default v1.2.1-cambray.1), BACKUP_DIR (default ~/backups/itsaplan).
set -euo pipefail

TAG="${TAG:-v1.2.1-cambray.1}"
VERSION="${TAG#v}"
IMAGES_REPO="irstone-source/itsaplan-images"
IMAGE_PREFIX="ghcr.io/${IMAGES_REPO}"
SERVICES=(api worker bot web)
API_URL="https://plan-api.cambray.co"
WEB_URL="https://plan.cambray.co"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/itsaplan}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEPLOY_TIMEOUT=600

MODE=plan
ROLLBACK_FILE=""
case "${1:-}" in
  --apply) MODE=apply ;;
  --backup) MODE=backup ;;
  --rollback) MODE=rollback; ROLLBACK_FILE="${2:?--rollback needs the rollback file}" ;;
  "") ;;
  *) echo "usage: $0 [--apply | --backup | --rollback FILE]" >&2; exit 2 ;;
esac

cd "$(git rev-parse --show-toplevel)"

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

current_images() {
  railway status --json | python3 -c '
import json, sys
d = json.load(sys.stdin)
for e in d["environments"]["edges"]:
    for si in e["node"]["serviceInstances"]["edges"]:
        n = si["node"]
        print(n["serviceName"], (n.get("source") or {}).get("image") or "")
'
}

deployment_of() {
  railway service status -s "$1" --json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["deploymentId"], d["status"])'
}

# Switches one service to an image and waits for the new deployment to succeed.
switch_image() {
  local service="$1" image="$2" before after status waited=0
  before="$(deployment_of "$service" | cut -d' ' -f1)"
  echo "$service -> $image"
  railway service source connect --image "$image" --service "$service" >/dev/null
  sleep 20
  if [[ "$(deployment_of "$service" | cut -d' ' -f1)" == "$before" ]]; then
    railway service redeploy --service "$service" --from-source --yes >/dev/null
  fi
  while :; do
    read -r after status < <(deployment_of "$service")
    if [[ "$after" != "$before" ]]; then
      case "$status" in
        SUCCESS) echo "$service: deployment $after SUCCESS"; return 0 ;;
        FAILED | CRASHED | REMOVED)
          die "$service: deployment $after $status. Logs: railway service logs $service" ;;
      esac
    fi
    ((waited += 10)) || true
    ((waited < DEPLOY_TIMEOUT)) || die "$service: no successful deployment after ${DEPLOY_TIMEOUT}s"
    sleep 10
  done
}

expect_http() {
  local url="$1" want="$2" got
  got="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$url" || true)"
  [[ "$got" == "$want" ]] || die "$url returned $got, expected $want"
  echo "ok  $url -> $got"
}

# ── rollback ────────────────────────────────────────────────────────────────
if [[ "$MODE" == rollback ]]; then
  [[ -f "$ROLLBACK_FILE" ]] || die "no such file: $ROLLBACK_FILE"
  log "Rolling back images from $ROLLBACK_FILE"
  while read -r service image; do
    [[ " ${SERVICES[*]} " == *" $service "* && -n "$image" ]] || continue
    switch_image "$service" "$image"
  done < "$ROLLBACK_FILE"
  railway variable delete SKIP_PRE_MIGRATION_BACKUP --service api 2>/dev/null || true
  cat <<EOF

Images rolled back. The database keeps the v1.2.1 migrations; older images may
refuse to start against it. To restore the pre-deploy data:
  gunzip -c <backup.sql.gz> | railway ssh -s postgres -- sh -c 'psql -v ON_ERROR_STOP=1 -U "\$PGUSER" -d "\$PGDATABASE"'
(the dump is plain SQL with --clean --if-exists, so it drops and recreates objects)
EOF
  exit 0
fi

# ── preflight ───────────────────────────────────────────────────────────────
log "Preflight"
command -v railway >/dev/null || die "railway CLI not installed"
railway whoami >/dev/null || die "railway login"
railway status --json | grep -q '"name": *"itsaplan"' || die "run: railway link -p itsaplan -e production"
if [[ "$MODE" != backup ]]; then
  command -v gh >/dev/null || die "gh CLI not installed"
  [[ -z "$(git status --porcelain)" ]] || die "working tree not clean"
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  SHA="$(git rev-parse HEAD)"
  git fetch -q origin "$BRANCH" || die "branch $BRANCH is not on origin"
  [[ "$(git rev-parse "origin/$BRANCH")" == "$SHA" ]] || die "push $BRANCH to origin first"
  gh auth status >/dev/null 2>&1 || die "gh auth login"
  echo "branch $BRANCH @ ${SHA:0:8}, tag $TAG, images ${IMAGE_PREFIX}-<service>:$VERSION"
fi

log "Running images"
current_images

if [[ "$MODE" == plan ]]; then
  cat <<EOF

Plan (nothing changed). With --apply this will:
  1. write the running images to $BACKUP_DIR/rollback-$STAMP.txt
  2. dump the production database to $BACKUP_DIR/prod-$STAMP.sql.gz and verify it
  3. push tag $TAG to $IMAGES_REPO and wait for publish-images.yml
  4. set SKIP_PRE_MIGRATION_BACKUP=1 on api
  5. switch ${SERVICES[*]} to ${IMAGE_PREFIX}-<service>:$VERSION, in that order
  6. check $API_URL/settings/branding, $WEB_URL/login and $WEB_URL/icon.svg
EOF
  exit 0
fi

mkdir -p "$BACKUP_DIR"
if [[ "$MODE" == apply ]]; then
  ROLLBACK="$BACKUP_DIR/rollback-$STAMP.txt"
  current_images > "$ROLLBACK"
  echo "rollback file: $ROLLBACK"
fi

# ── backup ──────────────────────────────────────────────────────────────────
log "Backing up the production database"
DUMP="$BACKUP_DIR/prod-$STAMP.sql.gz"
RAW="$BACKUP_DIR/prod-$STAMP.raw"
# base64 keeps the gzip stream intact through the ssh terminal. The terminal also
# carries prompts and a pseudo-terminal's \r, so only the lines between the markers
# are decoded, and the end marker is printed only when pg_dump succeeded.
# The script holds no single quotes, so it can be wrapped in them for either form.
REMOTE='set -o pipefail; echo __DUMP_BEGIN__; pg_dump --clean --if-exists --no-owner -U "$PGUSER" -d "$PGDATABASE" | gzip | base64 -w 76 && echo __DUMP_END__'
# ssh may join the command words and have the remote shell parse them again, or
# pass them through as they are. The probe prints "__probe__ ok" only in the first case.
if railway ssh -s postgres -- "sh -c 'echo __probe__ ok'" 2>/dev/null | tr -d '\r' | grep -q '^__probe__ ok$'; then
  railway ssh -s postgres -- "bash -c '$REMOTE'" | tr -d '\r' > "$RAW" || true
else
  railway ssh -s postgres -- bash -c "$REMOTE" | tr -d '\r' > "$RAW" || true
fi
grep -q '^__DUMP_END__$' "$RAW" \
  || die "pg_dump did not finish; remote output kept in $RAW"
sed -n '/^__DUMP_BEGIN__$/,/^__DUMP_END__$/p' "$RAW" | sed '1d;$d' | base64 -d > "$DUMP" \
  || die "could not decode the dump; remote output kept in $RAW"
rm -f "$RAW"
gzip -t "$DUMP" || die "backup is not a valid gzip stream: $DUMP"
gunzip -c "$DUMP" | tail -n 5 | grep -q 'PostgreSQL database dump complete' \
  || die "backup is truncated: $DUMP"
echo "backup: $DUMP ($(du -h "$DUMP" | cut -f1))"
[[ "$MODE" == backup ]] && exit 0

# ── build ───────────────────────────────────────────────────────────────────
log "Building images for $TAG"
REMOTE_SHA="$(git ls-remote "https://github.com/$IMAGES_REPO.git" "refs/tags/$TAG" | cut -f1)"
if [[ -z "$REMOTE_SHA" ]]; then
  git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || git tag "$TAG" "$SHA"
  [[ "$(git rev-parse "$TAG^{commit}")" == "$SHA" ]] || die "local tag $TAG is not HEAD"
  git push -q "https://github.com/$IMAGES_REPO.git" "refs/tags/$TAG"
elif [[ "$REMOTE_SHA" != "$SHA" && "$(git rev-parse "$REMOTE_SHA^{commit}" 2>/dev/null)" != "$SHA" ]]; then
  die "$TAG already exists on $IMAGES_REPO at another commit; pick a new TAG"
fi
STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run publish-images.yml -R "$IMAGES_REPO" -f tag="$TAG"
RUN_ID=""
for _ in $(seq 1 30); do
  RUN_ID="$(gh run list -R "$IMAGES_REPO" --workflow publish-images.yml --event workflow_dispatch \
    --json databaseId,createdAt -q "[.[] | select(.createdAt >= \"$STARTED\")][0].databaseId")"
  [[ -n "$RUN_ID" ]] && break
  sleep 5
done
[[ -n "$RUN_ID" ]] || die "publish-images.yml run did not start"
echo "run: https://github.com/$IMAGES_REPO/actions/runs/$RUN_ID"
gh run watch "$RUN_ID" -R "$IMAGES_REPO" --exit-status --interval 30 >/dev/null \
  || die "image build failed: gh run view $RUN_ID -R $IMAGES_REPO --log-failed"
echo "images published"

# ── deploy ──────────────────────────────────────────────────────────────────
log "Deploying"
railway variable set SKIP_PRE_MIGRATION_BACKUP=1 --service api --skip-deploys >/dev/null
for service in "${SERVICES[@]}"; do
  switch_image "$service" "${IMAGE_PREFIX}-${service}:${VERSION}"
  if [[ "$service" == api ]]; then
    # A route that only this build has: proves the new api is the one serving.
    expect_http "$API_URL/settings/branding" 200
  fi
done

log "Checking the web app"
expect_http "$WEB_URL/login" 200
expect_http "$WEB_URL/icon.svg" 200

cat <<EOF

Deployed $TAG.
  backup:   $DUMP
  rollback: $0 --rollback $ROLLBACK
Next: sign in as the instance owner, God mode -> Branding.
EOF
