# VK fork Linux installer

This directory contains a fork-only Linux install/update path for the VK-enabled OpenClaw fork.

It is intentionally isolated from upstream OpenClaw install/update code so the main VK feature branch can stay clean for upstream PRs.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/frznfrgg/openclaw/vk-fork-installer/fork/linux/install-openclaw-vk.sh | bash
```

What it does:

- installs `git`, `curl`, and `ca-certificates` when missing
- installs Node.js 24 when the host does not already have Node.js `22.12+`
- installs `pnpm`
- clones `https://github.com/frznfrgg/openclaw.git`
- checks out `vk-fork-installer`
- runs `pnpm install --force`
- runs `pnpm build`
- creates `~/.local/bin/openclaw`
- creates `~/.local/bin/openclaw-vk-update`

Defaults:

- checkout dir: `~/openclaw`
- branch: `vk-fork-installer`
- main CLI link: `openclaw`
- updater link: `openclaw-vk-update`

## Update

After install:

```bash
openclaw-vk-update
```

Manual fallback:

```bash
bash ~/openclaw/fork/linux/update-openclaw-vk.sh
```

Optional gateway restart:

```bash
openclaw-vk-update --restart-gateway
```

## Useful overrides

Install another branch:

```bash
curl -fsSL https://raw.githubusercontent.com/frznfrgg/openclaw/vk-fork-installer/fork/linux/install-openclaw-vk.sh | \
  bash -s -- --branch some-other-branch
```

Install to another directory:

```bash
bash install-openclaw-vk.sh --install-dir /opt/openclaw-vk
```

Skip link creation:

```bash
bash install-openclaw-vk.sh --no-link
```

Preview commands only:

```bash
bash install-openclaw-vk.sh --dry-run
bash update-openclaw-vk.sh --dry-run
```

## Notes

- This is Linux-only.
- The updater expects a clean git worktree unless you pass `--allow-dirty`.
- The scripts are source-checkout based; they do not publish or install a separate npm package.
