#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "此脚本仅供 GitHub Actions 的隔离工作目录运行。" >&2
  exit 1
fi
: "${RUNNER_TEMP:?}"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "发布工作目录必须干净。" >&2
  exit 1
fi
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

version=""
for attempt in 1 2 3; do
  git fetch origin main --tags
  git checkout --detach origin/main
  base=$(git rev-parse HEAD)
  version=$(node -p 'require("./package.json").version')
  if [[ "$(git log -1 --format=%s)" == "chore(release): v$version [skip ci]" ]]; then
    break
  fi

  npm ci
  npm version patch --no-git-tag-version
  npm run check
  npm run build
  npm run package
  version=$(node -p 'require("./package.json").version')
  git add package.json package-lock.json .codex-plugin/plugin.json src/shared.ts README.md release
  git commit -m "chore(release): v$version [skip ci]"
  git tag "v$version"
  if git push --atomic origin HEAD:refs/heads/main "refs/tags/v$version"; then
    break
  fi
  git tag -d "v$version"
  git fetch origin main
  if [[ "$(git rev-parse origin/main)" == "$base" ]]; then
    echo "发布推送失败，远端分支未变化；请检查写入权限或网络。" >&2
    exit 1
  fi
  echo "main 已更新，重新构建最新代码（第 $attempt 次尝试）。"
  version=""
done
if [[ -z "$version" ]]; then
  echo "main 持续更新，发布未完成；请重新运行工作流。" >&2
  exit 1
fi

tag="v$version"
if [[ "$(git rev-parse "$tag^{commit}")" != "$(git rev-parse HEAD)" ]]; then
  echo "发布标签与构建提交不一致。" >&2
  exit 1
fi
if gh release view "$tag" >/dev/null 2>&1; then
  echo "$tag 已发布，无需重复发布。"
  exit 0
fi
archive="$RUNNER_TEMP/visualfiles-$tag.zip"
(cd release && zip -qr "$archive" .)
gh release create "$tag" "$archive" --verify-tag --title "VisualFiles $tag" --generate-notes --latest
