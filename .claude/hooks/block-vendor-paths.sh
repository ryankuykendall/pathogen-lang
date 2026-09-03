#!/usr/bin/env bash
# PreToolUse guard: refuse Bash / Read / Grep / Glob calls that touch vendored
# or generated trees (node_modules, dist, public, api/.wrangler-backup-*).
#
# Why a hook and not a permission rule: the Read(./node_modules/**) deny rule
# only covers the Read tool. Subagents in this environment search with shell
# grep/find, which a permission rule cannot see, and the resulting prompts
# reached the user three times. This hook auto-denies instead of prompting.
#
# Reads the hook JSON on stdin; prints a deny decision when a guarded path
# appears in the fields that can carry a path. Grep's `pattern` is a text
# regex, not a path, so it is deliberately not inspected.

input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // ""')

case "$tool" in
  Bash) fields=$(printf '%s' "$input" | jq -r '.tool_input.command // ""') ;;
  Read) fields=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""') ;;
  Grep) fields=$(printf '%s' "$input" | jq -r '[.tool_input.path, .tool_input.glob] | map(select(. != null)) | join("\n")') ;;
  Glob) fields=$(printf '%s' "$input" | jq -r '[.tool_input.path, .tool_input.pattern] | map(select(. != null)) | join("\n")') ;;
  *) exit 0 ;;
esac

# Drop exclusion idioms so "--exclude-dir=node_modules", "-g '!dist'" and
# "-path ./node_modules -prune" do not count as touching the tree.
scrubbed=$(printf '%s' "$fields" \
  | sed -E "s/--exclude-dir[= ]['\"]?[^ '\"]+['\"]?//g" \
  | sed -E "s/(-g|--glob|--iglob)[= ]['\"]?![^ '\"]+['\"]?//g" \
  | sed -E "s/-path ['\"]?[^ '\"]+['\"]? -prune//g")

guard='(^|[/ "'"'"'=(;&|<>	])(node_modules|dist|public|\.wrangler-backup[^/ "'"'"';&|<>	]*)(/|$|[ "'"'"');&|<>	])'
if printf '%s' "$scrubbed" | grep -qE "$guard"; then
  hit=$(printf '%s' "$scrubbed" | grep -oE "$guard" | head -1 | tr -d '\n')
  reason="Blocked: this project never searches or reads node_modules/, dist/, public/ or .wrangler-backup*/ (matched: ${hit}). Scope the command to src/, docs/, tests/, playground/, website/, packages/, scripts/ or project-docs/ instead."
  jq -cn --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
fi
exit 0
