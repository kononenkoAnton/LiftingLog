# Program parsing rules

Reference for `scripts/parse-program.mjs` and for fixing flagged items or
polishing descriptions. The parser encodes all of this; this doc is the
human/model-readable spec.

## Output schema (`src/data/types.ts`)

```ts
type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight'

type Weight =
  | { kind: 'single';  kg: number }
  | { kind: 'range';   minKg: number; maxKg: number }
  | { kind: 'progression'; kg: number[] }            // 105-120-130 (ramp)
  | { kind: 'perSet';  steps: { kg: number; reps: number }[] }  // 120/3, 135/3
  | { kind: 'qualitative'; level: 'light' | 'medium' | 'heavy' }
  | { kind: 'bodyweight' }

interface Exercise {
  order: number            // 1-based within the session
  nameEn: string
  nameRu: string           // first clause of the Russian line
  descEn: string
  descRu: string
  equipment: Equipment
  perImplement?: boolean   // two dumbbells; weight is per dumbbell
  weight: Weight
  sets: number | null
  reps: string             // "3", "15-20", "45s" (plank duration)
  notesEn?: string
  notesRu?: string
}

interface Session { num: number; date: string; dateLabel: string; focus: string; exercises: Exercise[] }
interface Program { title: string; sessions: Session[] }
```

`focus` is left `""` — the app derives it at runtime. `date` is ISO `yyyy-mm-dd`
(first date if the header is a range like `09-10/03/2026`). `dateLabel` is `"9 Mar"`.

## Markdown shape

```
**21/01/2026 №1**
1) <exercise, russian>, <weight>, <sets/reps> [cues].
2) ...
____  (separator; ignore)
```

Export adds `![][imageN]` refs and backslash-escapes (`\)`, `\_`) — strip both.
**Gotcha:** JS `\w` and `\b` do NOT match Cyrillic. Use `[а-яё]` classes and
whitespace anchors instead.

## Glossary (RU → EN, equipment)

First match wins; list specific patterns before generic. `per` = perImplement.

| Russian | nameEn | equipment | per |
|---|---|---|---|
| жим гантел… лёжа (под углом = incline) | DB Bench Press / Incline DB Bench Press | dumbbell | yes |
| жим гантелей сидя | Seated DB Press | dumbbell | yes |
| французский жим лёжа | Lying Triceps Extension (Skullcrusher) | barbell | |
| французский жим стоя | Overhead DB Triceps Extension | dumbbell | |
| жим штанги стоя | Overhead Press | barbell | |
| жим (штанги) лёжа (средним хватом = medium grip) | Bench Press / Bench Press (medium grip) | barbell | |
| румынская тяга | Romanian Deadlift (RDL) | barbell | |
| становая тяга (с плинта/подставок = Block; с ямы = Deficit; классика/с пола = Conventional) | Deadlift variant | barbell | |
| приседание (в наколенниках = knee sleeves; с паузой = paused) | Squat | barbell | |
| наклоны со штангой / доброе утро | Good Morning | barbell | |
| выпады | Barbell Lunges | barbell | |
| жим ногами | Leg Press | machine | |
| разгибание ног | Leg Extension | machine | |
| шраги с гантелями | DB Shrugs | dumbbell | yes |
| махи гантелями | DB Lateral Raise | dumbbell | yes |
| разводка гантелями | DB Fly | dumbbell | yes |
| разгибание на трицепс в блоке | Cable Triceps Pushdown | cable | |
| разгибание на трицепс в тренажёре | Machine Triceps Extension | machine | |
| тяга гантели к поясу | DB Row | dumbbell | (no — single DB) |
| тяга штанги(/гантели) к поясу | Barbell Row | barbell | |
| тяга горизонтального блока | Seated Cable Row | cable | |
| тяга верхнего блока | Lat Pulldown | cable | |
| подтягивания | Pull-ups | bodyweight | |
| брусья | Dips | bodyweight | |
| отжимание от пола | Push-ups | bodyweight | |
| гиперэкстензия | Hyperextension | bodyweight | |
| пресс скручивание | Crunches | bodyweight | |
| пресс планка | Plank | bodyweight | |
| подъём ног к перекладине | Hanging Leg Raise | bodyweight | |

To add a new movement: append an entry to `GLOSSARY` in
`scripts/parse-program.mjs` (specific patterns first) and to the table above.

## Weight mapping

- `75 кг` → `{ kind:'single', kg:75 }`
- `25-28 кг` → `{ kind:'range', minKg:25, maxKg:28 }`
- `105-120-130` (ramp, 3+ values) → `{ kind:'progression', kg:[105,120,130] }`
- `120/3, 135/3, 145/2` (comma-separated weight/reps) → `{ kind:'perSet', steps:[...] }`
- `тяжёлый/средний/лёгкий` or `как можно больше` with no number → `qualitative`
  (`heavy`/`medium`/`light`; "как можно больше" = heavy)
- bodyweight move, no added load → `{ kind:'bodyweight' }`
- bodyweight move **с весом N кг** → that N as `single`/`range` (added weight),
  equipment stays `bodyweight`
- bare number with no «кг» (e.g. `110 по 3/6`) → `single` if it's a plausible
  barbell load (40–300 kg) and not a rep/set count
- dumbbell `по N кг` → that N with `perImplement: true` (weight is per dumbbell)
- "приблизительно/около" → use the number; you may note "approx" in `notesRu`

## Sets / reps

- `4 подхода/3 повторения` or `4/3` → `sets:4, reps:"3"`
- `3/15-20` → `sets:3, reps:"15-20"`
- plank/static `3/40 секунд` → `sets:3, reps:"40s"` (preserve ranges: `"45-55s"`)
- `по 15 повторений` (reps only) → `sets:null, reps:"15"`
- per-set weight schemes carry reps in the `perSet` steps; `reps` may be `""`

## Bundles & edge cases

- **`потом/затем`**: split into separate exercises **only if** the tail is itself a
  known lift (deadlift **потом** RDL). If the tail is a finisher or back-off of the
  same movement (`…и потом ещё 5-10 повторений`, `…потом 125/6`), keep it as one
  exercise — the parser does this and flags real splits for you to verify.
- **"A или B"** (choose) lines with no load: pick the first movement as the
  exercise, note the alternative; set a `qualitative` weight (`medium`) if none given.
- **Dual dates** (`18-19/04/2026`): use the first date.
- **Year typos** (`02026`): the 4-digit year is what matters.

## Descriptions (optional polish)

The parser sets `descEn = nameEn + "."` and `descRu` = the full Russian line. For
nicer output, a cheap model can rewrite per exercise: `descRu` = one clean Russian
sentence describing the movement; `descEn` = faithful English translation;
situational cues (`пауза 2 секунды`, `садись ниже`, `в лямках можно`) go in
`notesRu` + translated `notesEn`. Never change `weight`, `sets`, `reps`, or
`equipment` during polish.
