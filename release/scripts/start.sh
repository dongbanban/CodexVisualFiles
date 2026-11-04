#!/bin/sh
set -eu

if [ "$(/usr/bin/uname -s)" != "Darwin" ]; then
  echo "VisualFiles 当前仅支持 macOS。" >&2
  exit 1
fi

visualfiles_root=$(CDPATH= cd -- "$(/usr/bin/dirname "$0")/.." && pwd -P)

if [ -z "${VISUALFILES_CODEX:-}" ]; then
  for visualfiles_codex in \
    /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex \
    /Applications/Codex.app/Contents/Resources/codex; do
    if [ -x "$visualfiles_codex" ]; then
      export VISUALFILES_CODEX="$visualfiles_codex"
      break
    fi
  done
fi

if [ -z "${VISUALFILES_RG:-}" ] && ! command -v rg >/dev/null 2>&1; then
  visualfiles_rg=/Applications/ChatGPT.app/Contents/Resources/codex-cli/codex-path/rg
  if [ -x "$visualfiles_rg" ]; then
    export VISUALFILES_RG="$visualfiles_rg"
  fi
fi

if [ -n "${VISUALFILES_NODE:-}" ]; then
  set -- "$VISUALFILES_NODE"
else
  set -- \
    "$(command -v node 2>/dev/null || true)" \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    "${HOME:-}/.nvm/versions/node/"*/bin/node
fi

for visualfiles_node do
  if [ -x "$visualfiles_node" ] && \
    "$visualfiles_node" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; then
    exec "$visualfiles_node" "$visualfiles_root/dist/server.mjs"
  fi
done

echo "VisualFiles 需要 Node.js 22 或更高版本；请安装 Node.js 后重新启动 Codex。" >&2
exit 1
