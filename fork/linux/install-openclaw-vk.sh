#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REPO_URL="https://github.com/frznfrgg/openclaw.git"
DEFAULT_BRANCH="vk-fork-installer"
DEFAULT_INSTALL_DIR="${HOME}/openclaw"
DEFAULT_BIN_DIR="${XDG_BIN_HOME:-${HOME}/.local/bin}"
DEFAULT_LINK_NAME="openclaw"
DEFAULT_UPDATE_LINK_NAME="openclaw-vk-update"
DEFAULT_PNPM_VERSION="10.23.0"
DEFAULT_NODE_MAJOR="24"
MIN_NODE_MAJOR="22"
MIN_NODE_MINOR="12"

REPO_URL="${OPENCLAW_VK_REPO_URL:-$DEFAULT_REPO_URL}"
BRANCH="${OPENCLAW_VK_BRANCH:-$DEFAULT_BRANCH}"
INSTALL_DIR="${OPENCLAW_VK_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
BIN_DIR="${OPENCLAW_VK_BIN_DIR:-$DEFAULT_BIN_DIR}"
LINK_NAME="${OPENCLAW_VK_LINK_NAME:-$DEFAULT_LINK_NAME}"
UPDATE_LINK_NAME="${OPENCLAW_VK_UPDATE_LINK_NAME:-$DEFAULT_UPDATE_LINK_NAME}"
PNPM_VERSION="${OPENCLAW_VK_PNPM_VERSION:-$DEFAULT_PNPM_VERSION}"
NODE_MAJOR="${OPENCLAW_VK_NODE_MAJOR:-$DEFAULT_NODE_MAJOR}"
NO_LINK=0
DRY_RUN=0

usage() {
  cat <<'EOF'
Install the VK-enabled OpenClaw fork on Linux.

Usage:
  bash install-openclaw-vk.sh [options]

Options:
  --repo-url <url>          Git remote to clone.
  --branch <name>           Branch or tag to install.
  --install-dir <path>      Checkout directory.
  --bin-dir <path>          Directory for command symlinks.
  --link-name <name>        Main CLI symlink name. Default: openclaw
  --update-link-name <name> Updater symlink name. Default: openclaw-vk-update
  --no-link                 Skip creating CLI symlinks.
  --dry-run                 Print actions without executing them.
  -h, --help                Show help.

Environment overrides:
  OPENCLAW_VK_REPO_URL
  OPENCLAW_VK_BRANCH
  OPENCLAW_VK_INSTALL_DIR
  OPENCLAW_VK_BIN_DIR
  OPENCLAW_VK_LINK_NAME
  OPENCLAW_VK_UPDATE_LINK_NAME
  OPENCLAW_VK_PNPM_VERSION
  OPENCLAW_VK_NODE_MAJOR
EOF
}

log() {
  printf '[openclaw-vk-install] %s\n' "$*"
}

warn() {
  printf '[openclaw-vk-install] WARN: %s\n' "$*" >&2
}

die() {
  printf '[openclaw-vk-install] ERROR: %s\n' "$*" >&2
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

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

node_is_supported() {
  if ! command_exists node; then
    return 1
  fi

  local major minor
  major="$(node -p 'process.versions.node.split(".")[0]')"
  minor="$(node -p 'process.versions.node.split(".")[1]')"

  if [ "$major" -gt "$MIN_NODE_MAJOR" ]; then
    return 0
  fi
  if [ "$major" -eq "$MIN_NODE_MAJOR" ] && [ "$minor" -ge "$MIN_NODE_MINOR" ]; then
    return 0
  fi
  return 1
}

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    run "$@"
    return 0
  fi
  if command_exists sudo; then
    run sudo "$@"
    return 0
  fi
  die "Need root or sudo to install system packages: $*"
}

detect_pkg_manager() {
  if command_exists apt-get; then
    printf 'apt'
    return
  fi
  if command_exists pacman; then
    printf 'pacman'
    return
  fi
  if command_exists dnf; then
    printf 'dnf'
    return
  fi
  if command_exists yum; then
    printf 'yum'
    return
  fi
  if command_exists apk; then
    printf 'apk'
    return
  fi
  printf 'unknown'
}

ensure_core_packages() {
  local missing=()
  command_exists git || missing+=("git")
  command_exists curl || missing+=("curl")

  if [ "${#missing[@]}" -eq 0 ]; then
    return 0
  fi

  local pkg_manager
  pkg_manager="$(detect_pkg_manager)"
  case "$pkg_manager" in
    apt)
      run_as_root apt-get update
      run_as_root apt-get install -y git curl ca-certificates
      ;;
    pacman)
      run_as_root pacman -Sy --noconfirm git curl ca-certificates
      ;;
    dnf)
      run_as_root dnf install -y git curl ca-certificates
      ;;
    yum)
      run_as_root yum install -y git curl ca-certificates
      ;;
    apk)
      run_as_root apk add --no-cache git curl ca-certificates
      ;;
    *)
      die "Missing required tools (${missing[*]}). Install them manually and rerun."
      ;;
  esac
}

ensure_build_tools() {
  local pkg_manager
  pkg_manager="$(detect_pkg_manager)"
  case "$pkg_manager" in
    apt)
      run_as_root apt-get update
      run_as_root apt-get install -y build-essential python3 make g++ cmake
      ;;
    pacman)
      run_as_root pacman -Sy --noconfirm base-devel python make cmake gcc
      ;;
    dnf)
      run_as_root dnf install -y gcc gcc-c++ make cmake python3
      ;;
    yum)
      run_as_root yum install -y gcc gcc-c++ make cmake python3
      ;;
    apk)
      run_as_root apk add --no-cache build-base python3 cmake
      ;;
    *)
      warn "Could not detect package manager for auto-installing build tools"
      return 0
      ;;
  esac
}

install_node_if_needed() {
  if node_is_supported; then
    log "Using existing Node $(node --version)"
    return 0
  fi

  local pkg_manager
  pkg_manager="$(detect_pkg_manager)"
  case "$pkg_manager" in
    apt)
      log "Installing Node.js ${NODE_MAJOR}.x via NodeSource"
      run_as_root bash -lc "curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -"
      run_as_root apt-get install -y nodejs
      ;;
    dnf)
      log "Installing Node.js ${NODE_MAJOR}.x via NodeSource"
      run_as_root bash -lc "curl -fsSL https://rpm.nodesource.com/setup_${NODE_MAJOR}.x | bash -"
      run_as_root dnf install -y nodejs
      ;;
    yum)
      log "Installing Node.js ${NODE_MAJOR}.x via NodeSource"
      run_as_root bash -lc "curl -fsSL https://rpm.nodesource.com/setup_${NODE_MAJOR}.x | bash -"
      run_as_root yum install -y nodejs
      ;;
    *)
      die "Node.js >= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR} is required. Install it manually and rerun."
      ;;
  esac

  node_is_supported || die "Installed Node.js is still below ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}"
}

ensure_pnpm() {
  if command_exists pnpm; then
    log "Using existing pnpm $(pnpm --version)"
    return 0
  fi

  if command_exists corepack; then
    log "Installing pnpm ${PNPM_VERSION} via corepack"
    run corepack enable
    run corepack prepare "pnpm@${PNPM_VERSION}" --activate
  elif command_exists npm; then
    log "Installing pnpm ${PNPM_VERSION} via npm"
    run npm install -g "pnpm@${PNPM_VERSION}"
  else
    die "pnpm is required and neither corepack nor npm is available."
  fi

  command_exists pnpm || die "pnpm installation failed"
}

clone_or_refresh_checkout() {
  if [ -d "${INSTALL_DIR}/.git" ]; then
    log "Reusing existing checkout at ${INSTALL_DIR}"
    run git -C "$INSTALL_DIR" remote set-url origin "$REPO_URL"
  elif [ -e "$INSTALL_DIR" ]; then
    die "Install dir exists but is not a git checkout: ${INSTALL_DIR}"
  else
    log "Cloning ${REPO_URL} into ${INSTALL_DIR}"
    run git clone "$REPO_URL" "$INSTALL_DIR"
  fi

  run git -C "$INSTALL_DIR" fetch origin --tags
  run git -C "$INSTALL_DIR" checkout "$BRANCH"
  run git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
}

build_checkout() {
  log "Installing dependencies"
  run pnpm --dir "$INSTALL_DIR" install --force

  log "Building OpenClaw"
  run pnpm --dir "$INSTALL_DIR" build
}

ensure_bin_dir() {
  run mkdir -p "$BIN_DIR"
}

install_links() {
  if [ "$NO_LINK" -eq 1 ]; then
    return 0
  fi

  ensure_bin_dir

  local cli_target update_target
  cli_target="${INSTALL_DIR}/openclaw.mjs"
  update_target="${INSTALL_DIR}/fork/linux/update-openclaw-vk.sh"

  if [ "$DRY_RUN" -eq 0 ]; then
    [ -f "$cli_target" ] || die "Missing CLI entrypoint: ${cli_target}"
    [ -f "$update_target" ] || die "Missing updater script: ${update_target}"
  fi

  run ln -sfn "$cli_target" "${BIN_DIR}/${LINK_NAME}"
  run ln -sfn "$update_target" "${BIN_DIR}/${UPDATE_LINK_NAME}"
}

print_next_steps() {
  cat <<EOF

Install complete.

Repo:      ${INSTALL_DIR}
Branch:    ${BRANCH}
CLI:       ${BIN_DIR}/${LINK_NAME}
Updater:   ${BIN_DIR}/${UPDATE_LINK_NAME}

Next steps:
  1. Ensure ${BIN_DIR} is on PATH.
  2. Run: ${LINK_NAME} onboard
  3. Update later with: ${UPDATE_LINK_NAME}

EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo-url)
      REPO_URL="${2:-}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    --bin-dir)
      BIN_DIR="${2:-}"
      shift 2
      ;;
    --link-name)
      LINK_NAME="${2:-}"
      shift 2
      ;;
    --update-link-name)
      UPDATE_LINK_NAME="${2:-}"
      shift 2
      ;;
    --no-link)
      NO_LINK=1
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

[ -n "$REPO_URL" ] || die "Repository URL must not be empty"
[ -n "$BRANCH" ] || die "Branch must not be empty"
[ -n "$INSTALL_DIR" ] || die "Install dir must not be empty"
[ -n "$BIN_DIR" ] || die "Bin dir must not be empty"
[ -n "$LINK_NAME" ] || die "Link name must not be empty"
[ -n "$UPDATE_LINK_NAME" ] || die "Update link name must not be empty"

ensure_core_packages
ensure_build_tools
install_node_if_needed
ensure_pnpm
clone_or_refresh_checkout
build_checkout
install_links
print_next_steps
