#!/bin/sh
# Usage: check-branch.sh <worktree-or-repo-path> <base> <owns-glob>...
# Globs are matched against the full repo-relative path; a glob that matches a
# directory prefix owns everything under it. Quote globs so the shell leaves them.
[ $# -ge 3 ] || { echo "usage: check-branch.sh <path> <base> <owns-glob>..." >&2; exit 2; }
path=$1 base=$2; shift 2
git -C "$path" rev-parse --verify --quiet "$base^{commit}" >/dev/null || { echo "error: $path is not a repo or $base is not a commit" >&2; exit 2; }
failed=0
[ -z "$(git -C "$path" status --porcelain)" ] || { echo "error: uncommitted changes in $path" >&2; failed=1; }
[ -n "$(git -C "$path" log --oneline "$base"..HEAD)" ] || { echo "error: no commits since $base" >&2; failed=1; }

owned() { # owned <file> <glob>...
  file=$1; shift
  for glob; do
    prefix=$file
    while :; do
      case $prefix in $glob) return 0 ;; esac
      [ "$prefix" = "${prefix%/*}" ] && break
      prefix=${prefix%/*}
    done
  done
  return 1
}

changed=$(git -C "$path" -c core.quotePath=false diff --no-renames --name-only "$base"...HEAD)
while IFS= read -r file; do
  [ -z "$file" ] || owned "$file" "$@" || { echo "error: $file is outside owns" >&2; failed=1; }
done <<EOF
$changed
EOF
exit $failed
