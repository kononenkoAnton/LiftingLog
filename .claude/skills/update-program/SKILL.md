---
name: update-program
description: Regenerate src/data/program.json from the trainer's Google Doc when sessions are added or edited. Use for "update the program", "re-parse the doc", "sync the program", "pull new workouts", or when program.json looks stale vs the doc.
---

# Update the training program

The app renders `src/data/program.json` (55+ sessions). The source of truth is a
Google Doc the trainer edits. This skill regenerates `program.json` from that doc
**cheaply and deterministically** — the happy path needs no model at all.

## Why markdown export

Fetch the doc as Markdown, not HTML/PDF:

```
https://docs.google.com/document/d/1b5RGwxGWkxLRidCiblM07hcqnTFrgxQrkpkXyMuN81E/export?format=md
```

Markdown keeps the structure flat and predictable — `**DD/MM/YYYY №N**` headers,
`N)` exercise lines, `___` separators — so a regex parser handles it with no LLM
cost. The parser (`scripts/parse-program.mjs`) already encodes the format.

## The pipeline

```
fetch md → scripts/parse-program.mjs → program.json → review warnings → validate → commit
```

### 1. Run the parser

```bash
npm run parse                 # INCREMENTAL: keep existing sessions, append new ones
node scripts/parse-program.mjs --full     # full rebuild (overwrites everything)
# inspect without writing:
node scripts/parse-program.mjs --stdout > /tmp/parsed.json
# parse a saved file:
curl -sL "<export-md-url>" -o /tmp/program.md
node scripts/parse-program.mjs --file /tmp/program.md --stdout > /tmp/parsed.json
```

**Incremental (default):** reads the current `program.json`, keeps every existing
session by `num` **verbatim** (preserving hand-authored descriptions), and appends
only sessions with a new `num`. This is what you want when the trainer adds days.
It prints `kept N, appended M`.

**`--full`:** regenerate the whole file from the Doc (overwrites). Use for a clean
rebuild; note it replaces hand-polished descriptions with the parser's plainer ones.
An edited *existing* session won't be picked up incrementally (by design — it would
clobber hand-polish); re-author that one session by hand, or run `--full`.

The script otherwise:
- splits sessions by the `**DD/MM/YYYY №N**` header (first date of a range),
- classifies each exercise's English name + equipment via an ordered glossary,
- parses the weight into the typed `Weight` union (single / range / progression /
  perSet / qualitative / bodyweight),
- parses sets and reps (including plank durations like `45s`),
- splits genuine `потом/затем` bundles (deadlift **then** RDL) into two exercises,
- writes `{ title, sessions: [...] }` matching `src/data/types.ts`.

Pounds and plate loading are **computed at runtime** by `src/lib/load.ts`, so the
data file only needs kilograms — never put lb or plate math in `program.json`.

### 2. Review the warnings

Every line the rules can't resolve confidently prints to stderr as `WARN
session N: ...`. These are the only things needing attention. Typical ones:
- **`bundle split — verify`**: a `потом` line was split into two exercises — confirm
  the second is a real lift (not a back-off set of the first).
- **`unknown exercise`**: a movement not in the glossary → it lands as `nameEn:
  "UNKNOWN"`. Add it to the glossary in `scripts/parse-program.mjs` (and to
  `references/parsing-rules.md`) and re-run, or fix the entry by hand.
- **`no weight parsed`**: usually a "choose A or B" line with no load — set a
  sensible `weight` per `references/parsing-rules.md`.

Fix by editing the glossary/rules and re-running (preferred — keeps it
deterministic) or by hand-editing the few flagged entries.

### 3. (Optional) Polish descriptions with a cheap model

The parser sets `descEn` from the English name and `descRu` to the full Russian
line. That's functional but plain. If you want the nicer bilingual descriptions
the app shipped with, run a **cheap** model over only the new/changed sessions:
for each exercise give it `nameRu` + `descRu` and the rules in
`references/parsing-rules.md`, and have it return polished `descEn`, a clean
`descRu`, and optional `notesEn`/`notesRu` (coaching cues like "пауза 2 секунды").
Keep all numeric fields (`weight`, `sets`, `reps`, `equipment`) exactly as parsed.

### 4. Validate

```bash
npx tsc --noEmit     # program.json must conform to the Program type
npm run test         # structural test asserts session count + valid kinds
```

If you add sessions, update the count assertion in `src/data/program.test.ts`.

### 5. Commit

```bash
git add src/data/program.json && git commit -m "data: re-parse program (N sessions)"
```

## Incremental updates

When the trainer only appends new sessions, you can parse everything and let the
diff show just the additions, or process only sessions with `num` greater than the
current max. The parser is idempotent — same doc in, same JSON out.

## Files

- `scripts/parse-program.mjs` — the deterministic parser (glossary + weight/rep rules).
- `references/parsing-rules.md` — schema, glossary, weight/sets-reps mapping, edge
  cases. Read this when fixing a warning or polishing descriptions.
