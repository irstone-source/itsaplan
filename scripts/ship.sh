#!/usr/bin/env bash
# Deploys this branch to plan.cambray.co under the next free release tag.
#
#   scripts/ship.sh           back up, build and deploy (cambray-deploy.sh --apply)
#   scripts/ship.sh --plan    print what would happen, change nothing
#   scripts/ship.sh --backup  only dump the production database
#
# Tags are v<upstream version>-cambray.N on the images mirror (v1.4.0-cambray.1, …). When the newest tag already points
# at HEAD it is reused; otherwise N goes up by one. Output is kept in
# ~/backups/itsaplan/deploy-<time>.log.
set -euo pipefail

cd "$(dirname "$0")/.."
PREFIX="v$(node -p "require('./package.json').version")-cambray."
MIRROR="https://github.com/irstone-source/itsaplan-images.git"

MODE="--apply"
case "${1:-}" in
  --plan) MODE="" ;;
  --backup) MODE="--backup" ;;
  "") ;;
  *) echo "usage: $0 [--plan | --backup]" >&2; exit 2 ;;
esac

HEAD_SHA="$(git rev-parse HEAD)"
latest="$(git ls-remote --tags "$MIRROR" "refs/tags/${PREFIX}*" \
  | { grep -v '\^{}$' || true; } | sed "s#.*refs/tags/${PREFIX}##" | sort -n | tail -1)"
latest="${latest:-0}"
latest_sha="$(git ls-remote "$MIRROR" "refs/tags/${PREFIX}${latest}" | cut -f1)"
if [[ -n "$latest_sha" && "$latest_sha" == "$HEAD_SHA" ]]; then
  n="$latest"
else
  n=$((latest + 1))
fi
export TAG="${PREFIX}${n}"

mkdir -p "$HOME/backups/itsaplan"
LOG="$HOME/backups/itsaplan/deploy-$(date +%Y%m%d-%H%M%S).log"
echo "tag $TAG (HEAD ${HEAD_SHA:0:8}), log $LOG"
scripts/cambray-deploy.sh $MODE 2>&1 | tee "$LOG"
