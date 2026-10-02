#!/usr/bin/env sh
set -eu

# 用当前工作树生成临时提交，克隆到系统分配的干净目录后安装依赖并打包。
# 脚本不依赖 /workspace 等固定路径；临时目录结束时自动清理。
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
FRONTEND_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
REPO_DIR=$(CDPATH= cd -- "$FRONTEND_DIR/.." && pwd)
TMP_ROOT=$(mktemp -d)
BARE_REPO=$TMP_ROOT/source.git
CLEAN_CLONE=$TMP_ROOT/clean-clone
TMP_INDEX=$TMP_ROOT/index
cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT INT TERM

GIT_INDEX_FILE=$TMP_INDEX git -C "$REPO_DIR" add -A
TREE=$(GIT_INDEX_FILE=$TMP_INDEX git -C "$REPO_DIR" write-tree)
COMMIT=$(printf 'clean build verification\n' | git -C "$REPO_DIR" -c user.name='clean-build' -c user.email='clean-build@example.invalid' commit-tree "$TREE")

git init -q --bare "$BARE_REPO"
git --git-dir="$BARE_REPO" fetch -q "$REPO_DIR" "$COMMIT"
git --git-dir="$BARE_REPO" update-ref refs/heads/main "$COMMIT"
git --git-dir="$BARE_REPO" symbolic-ref HEAD refs/heads/main

git clone -q "$BARE_REPO" "$CLEAN_CLONE"
cd "$CLEAN_CLONE/frontend"
npm ci
npm run build

echo "干净目录克隆、安装依赖与打包均已通过。"
