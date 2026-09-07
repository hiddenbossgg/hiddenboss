#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): surface JSDoc block comments and long //
# runs in edited app/** and inertia/** TypeScript files, so new over-commenting
# is visible in the session. Advisory only - always exits 0, never blocks.

set -u
input="$(cat)"

file="$(printf '%s' "$input" \
  | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]+"' \
  | head -n1 \
  | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"

[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0
case "$file" in
  */app/*|*/inertia/*) : ;;
  *) exit 0 ;;
esac
case "$file" in
  *.ts|*.tsx) : ;;
  *) exit 0 ;;
esac

report="$(awk '
  !inblk && /\/\*\*/ { inblk = 1; bstart = NR; blen = 0 }
  inblk { blen++ }
  inblk && /\*\// {
    inblk = 0; blocks++; span += blen
    bs = bs (bs == "" ? "" : ",") bstart
  }
  {
    if ($0 ~ /^[[:space:]]*\/\//) { run++; if (run == 1) rstart = NR }
    else { if (run >= 3) { runs++; rs = rs (rs == "" ? "" : ",") rstart } run = 0 }
  }
  END {
    if (run >= 3) { runs++; rs = rs (rs == "" ? "" : ",") rstart }
    if (blocks) printf "%d JSDoc block(s) spanning %d lines at %s", blocks, span, bs
    if (blocks && runs) printf "; "
    if (runs) printf "%d run(s) of 3+ // lines at %s", runs, rs
  }
' "$file")"

[ -n "$report" ] || exit 0

base="$(basename "$file" | tr -cd 'A-Za-z0-9._-')"
msg="comment-check ${base}: ${report}. Rule (CLAUDE.md): a comment only names an external constraint or a non-obvious consequence, and is one line. Re-read every comment just written and delete any that restates the code or explains a design decision."

printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}\n' "$msg"
exit 0
