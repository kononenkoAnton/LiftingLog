#!/usr/bin/env bash
# Stop hook: enforce the CLAUDE.md "keep skills in sync" rule.
#
# If the working tree has uncommitted changes to files the update-program skill
# documents (schema / parser / data / plate math) but NO change under the skill
# folder, re-engage the model once to check whether the skill needs updating.
# Self-limits to one nudge per session (sentinel) so it can never loop.
set -uo pipefail

input="$(cat)"
allow() { printf '{}'; exit 0; }

# session id (jq if present, else grep) — only used to scope the sentinel
if command -v jq >/dev/null 2>&1; then
  sid="$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)"
else
  sid="$(printf '%s' "$input" | grep -o '"session_id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"$//')"
fi
[ -z "${sid:-}" ] && sid="nosession"
sentinel="${TMPDIR:-/tmp}/claude-skill-sync-${sid}"
[ -f "$sentinel" ] && allow

repo="$(git rev-parse --show-toplevel 2>/dev/null)" || allow
changed="$(git -C "$repo" status --porcelain 2>/dev/null | cut -c4-)" || allow

# trigger files the skill documents
printf '%s\n' "$changed" | grep -Eq 'src/data/types\.ts|src/data/program\.json|scripts/parse-program\.mjs|src/lib/load\.ts' || allow
# already touched the skill in this same change set → nothing to nag about
printf '%s\n' "$changed" | grep -Eq '\.claude/skills/update-program/' && allow

touch "$sentinel"
cat <<'JSON'
{"decision":"block","reason":"You changed program schema/parser/data/plate-math files but did not touch the update-program skill. Per CLAUDE.md, verify whether .claude/skills/update-program (SKILL.md, references/parsing-rules.md, scripts/parse-program.mjs) needs updating to match — update it if so, otherwise state briefly that no skill change is needed. (This check fires once per session.)"}
JSON
