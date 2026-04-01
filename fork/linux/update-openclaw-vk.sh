#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd -P)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"

DRY_RUN=0
ALLOW_DIRTY=0
RESTART_GATEWAY=0
REMOTE="origin"
BRANCH=""

usage() {
  cat <<'EOF'
Update the VK-enabled OpenClaw fork checkout installed from fork/linux/install-openclaw-vk.sh.

Usage:
  bash update-openclaw-vk.sh [options]

Options:
  --remote <name>       Git remote to update from. Default: origin
  --branch <name>       Branch to update. Default: current checked-out branch
  --allow-dirty         Update even if the worktree has local changes
  --restart-gateway     Run `openclaw gateway restart` after a successful update
  --dry-run             Print actions without executing them
  -h, --help            Show help
EOF
}

log() {
  printf '[openclaw-vk-update] %s\n' "$*"
}

die() {
  printf '[openclaw-vk-update] ERROR: %s\n' "$*" >&2
  exit 1
}

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] '
    printf '%q ' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

require_clean_worktree() {
  if [ "$ALLOW_DIRTY" -eq 1 ]; then
    return 0
  fi
  if ! git -C "$REPO_DIR" diff --quiet || ! git -C "$REPO_DIR" diff --cached --quiet; then
    die "Worktree is dirty. Commit or stash changes, or rerun with --allow-dirty."
  fi
}

resolve_branch() {
  if [ -n "$BRANCH" ]; then
    return 0
  fi
  BRANCH="$(git -C "$REPO_DIR" branch --show-current)"
  [ -n "$BRANCH" ] || die "Could not determine the current branch"
}

ensure_pnpm() {
  command -v pnpm >/dev/null 2>&1 || die "pnpm is required for updates"
}

maybe_restart_gateway() {
  if [ "$RESTART_GATEWAY" -eq 0 ]; then
    return 0
  fi
  if command -v openclaw >/dev/null 2>&1; then
    run openclaw gateway restart || true
    return 0
  fi
  log "Gateway restart requested, but the openclaw command is not on PATH"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --remote)
      REMOTE="${2:-}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      shift
      ;;
    --restart-gateway)
      RESTART_GATEWAY=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[ -d "${REPO_DIR}/.git" ] || die "Repository root not found next to updater script: ${REPO_DIR}"
[ -n "$REMOTE" ] || die "Remote must not be empty"

resolve_branch
require_clean_worktree
ensure_pnpm

log "Fetching ${REMOTE}"
run git -C "$REPO_DIR" fetch "$REMOTE" --tags

log "Updating ${BRANCH}"
run git -C "$REPO_DIR" checkout "$BRANCH"
run git -C "$REPO_DIR" pull --ff-only "$REMOTE" "$BRANCH"

log "Installing dependencies"
run pnpm --dir "$REPO_DIR" install --force

log "Building OpenClaw"
run pnpm --dir "$REPO_DIR" build

maybe_restart_gateway

cat <<EOF

Update complete.

Repo:   ${REPO_DIR}
Remote: ${REMOTE}
Branch: ${BRANCH}

EOF
