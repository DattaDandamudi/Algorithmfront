/**
 * §1e Exercise database, default program and volume landmarks.
 *
 * The only place that knows what an exercise *is*: which muscles it trains,
 * what pattern it belongs to and what equipment it needs. `strength.ts` maps
 * sets onto muscles through this table, and the Train screen's picker searches
 * it. Everything here is static data — no clock, no state, no I/O.
 *
 * ## `EXERCISES` (Phase 1e)
 *
 * ~122 entries spanning every `MovementPattern`, each with
 * `muscles.primary` / `muscles.secondary`, `equipment`, `unilateral` where it
 * applies, and `aliases` for search ("bench", "bp", "flat bench"). Ids are
 * stable, lower-kebab and never reused — a workout logged in 2026 must still
 * resolve in 2030. User-created exercises live in
 * `settings.training.customExercises` and are passed in, never merged here.
 *
 * Muscle mapping is the coarse 15-bucket vocabulary of `Muscle`, chosen to
 * match how lifters talk rather than an anatomy chart: adductors ride with
 * `glutes`, the spinal erectors are `lower-back`, and everything a set trains
 * hard is `primary` while everything it trains incidentally is `secondary`
 * (counted at half a set by `strength.weeklySetsByMuscle`). Cardio, mobility
 * and sport entries carry **no** muscles on purpose: they are not resistance
 * volume, and letting a 40-minute run add sets to `quads` would quietly
 * corrupt the weekly-volume grid.
 *
 * ## `searchExercises` (Phase 1e)
 *
 * Token prefix match plus a one-edit typo tolerance (Levenshtein ≤ 1 on a
 * token), custom exercises first, then exact-prefix, then alias, then fuzzy.
 * Ranking is deterministic and case/diacritic-insensitive.
 *
 * ## `DEFAULT_PROGRAM` (Phase 1e)
 *
 * The built-in 4-day upper/lower A/B split matching `DEFAULT_SPLIT`
 * (Mon upper, Tue lower, Thu upper, Fri lower), each session a list of
 * `ProgramExercise { exerciseId, sets, reps: [lo, hi], rpe? }`. It lives here
 * rather than in `data/defaults.ts` so the data layer never imports the
 * engine; `settings.training.programs` ships empty and the Train screen falls
 * back to this one until the user edits a copy.
 *
 * `Program.sessions` is keyed by `SessionType`, which has one `upper` and one
 * `lower` slot — so the A and B days cannot live in a single `Program`. The
 * A day is `DEFAULT_PROGRAM` (Mon/Tue), the B day is `DEFAULT_PROGRAM_B`
 * (Thu/Fri), and `DEFAULT_PROGRAMS` is the pair in week order.
 *
 * ## Volume landmarks — advisory bands, not caps
 *
 * The 2025 *Sports Medicine* meta-regression found hypertrophy keeps rising
 * with weekly sets (diminishing returns, no clear plateau) and that strength is
 * largely volume-insensitive; **MRV has no RCT support**. So these numbers are
 * a starting point for a conversation, never a limit: `volumeStatus` in
 * `strength.ts` returns `high`, never "exceeded — cut", and nothing in the
 * engine removes sets because a landmark was crossed. Only fatigue signals
 * (readiness, form, muscle readiness, plateau) reduce anything.
 *
 * Beginner values are `data/defaults.DEFAULT_LANDMARKS` (imported, never
 * re-declared — one table, one source of truth) and follow the commonly
 * published Israetel-style tables; the intermediate (×1.4) and advanced (×1.7)
 * multipliers are **our heuristic**, not a measured progression, and the
 * Settings copy says so beside the reset button. Users override any cell in
 * `settings.training.volumeLandmarks`.
 */
import { DEFAULT_LANDMARKS } from '../data/defaults';
import type {
  Exercise,
  Muscle,
  MovementPattern,
  Profile,
  Program,
  VolumeLandmark,
} from '../data/types';

/**
 * The 15 volume buckets, in the order the UI renders them (push, pull, legs,
 * midline). Exported because every `Record<Muscle, …>` in the engine needs a
 * canonical iteration order, and a second copy of this list would drift.
 */
export const MUSCLES: readonly Muscle[] = [
  'chest',
  'front-delts',
  'side-delts',
  'rear-delts',
  'triceps',
  'back',
  'traps',
  'biceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
  'lower-back',
];

/** Terse constructor so 130 table rows stay readable and diffable. */
function ex(
  id: string,
  name: string,
  pattern: MovementPattern,
  equipment: Exercise['equipment'],
  primary: Muscle[],
  secondary: Muscle[] = [],
  aliases: string[] = [],
  unilateral = false,
): Exercise {
  const e: Exercise = { id, name, muscles: { primary, secondary }, pattern, equipment };
  if (unilateral) e.unilateral = true;
  if (aliases.length) e.aliases = aliases;
  return e;
}

/**
 * The built-in exercise library: the barbell / dumbbell / machine / cable /
 * bodyweight vocabulary a lifter on a 4-day upper/lower split actually logs,
 * plus the common cardio, mobility and sport entries so a run or a football
 * game has somewhere to go. Aliases are what people type, including the
 * abbreviations ("ohp", "rdl", "bss") and the plural/spaced spellings.
 */
export const EXERCISES: readonly Exercise[] = [
  // --- Squat --------------------------------------------------------------
  ex('back-squat', 'Back Squat', 'squat', 'barbell', ['quads', 'glutes'], ['hamstrings', 'lower-back', 'abs'], ['squat', 'bb squat', 'high bar squat', 'barbell squat']),
  ex('front-squat', 'Front Squat', 'squat', 'barbell', ['quads'], ['glutes', 'abs', 'lower-back'], ['fsq', 'front sq']),
  ex('low-bar-squat', 'Low-Bar Squat', 'squat', 'barbell', ['quads', 'glutes'], ['hamstrings', 'lower-back'], ['low bar squat', 'powerlifting squat']),
  ex('safety-bar-squat', 'Safety Bar Squat', 'squat', 'barbell', ['quads', 'glutes'], ['lower-back', 'abs'], ['ssb squat', 'ssb']),
  ex('box-squat', 'Box Squat', 'squat', 'barbell', ['quads', 'glutes'], ['hamstrings', 'lower-back']),
  ex('goblet-squat', 'Goblet Squat', 'squat', 'dumbbell', ['quads', 'glutes'], ['abs'], ['kb goblet squat']),
  ex('hack-squat', 'Hack Squat', 'squat', 'machine', ['quads'], ['glutes'], ['machine hack squat']),
  ex('leg-press', 'Leg Press', 'squat', 'machine', ['quads', 'glutes'], ['hamstrings'], ['lp', '45 degree leg press']),
  ex('smith-machine-squat', 'Smith Machine Squat', 'squat', 'machine', ['quads', 'glutes'], ['hamstrings'], ['smith squat']),

  // --- Hinge --------------------------------------------------------------
  ex('deadlift', 'Deadlift', 'hinge', 'barbell', ['hamstrings', 'glutes', 'lower-back'], ['back', 'traps', 'quads', 'forearms'], ['dl', 'conventional deadlift', 'deads']),
  ex('sumo-deadlift', 'Sumo Deadlift', 'hinge', 'barbell', ['glutes', 'quads', 'hamstrings'], ['lower-back', 'back', 'traps'], ['sumo dl']),
  ex('romanian-deadlift', 'Romanian Deadlift', 'hinge', 'barbell', ['hamstrings', 'glutes'], ['lower-back', 'forearms'], ['rdl', 'romanian dl']),
  ex('dumbbell-rdl', 'Dumbbell Romanian Deadlift', 'hinge', 'dumbbell', ['hamstrings', 'glutes'], ['lower-back'], ['db rdl', 'dumbbell rdl']),
  ex('stiff-leg-deadlift', 'Stiff-Leg Deadlift', 'hinge', 'barbell', ['hamstrings'], ['glutes', 'lower-back'], ['sldl', 'straight leg deadlift']),
  ex('trap-bar-deadlift', 'Trap Bar Deadlift', 'hinge', 'barbell', ['quads', 'glutes', 'hamstrings'], ['traps', 'back', 'lower-back'], ['hex bar deadlift', 'trap bar dl']),
  ex('rack-pull', 'Rack Pull', 'hinge', 'barbell', ['back', 'traps', 'lower-back'], ['hamstrings', 'glutes', 'forearms']),
  ex('good-morning', 'Good Morning', 'hinge', 'barbell', ['hamstrings', 'lower-back'], ['glutes'], ['gm']),
  ex('hip-thrust', 'Barbell Hip Thrust', 'hinge', 'barbell', ['glutes'], ['hamstrings'], ['hip thrust', 'bb hip thrust']),
  ex('back-extension', 'Back Extension', 'hinge', 'bodyweight', ['lower-back', 'glutes'], ['hamstrings'], ['hyperextension', '45 degree back extension']),
  ex('kettlebell-swing', 'Kettlebell Swing', 'hinge', 'kettlebell', ['glutes', 'hamstrings'], ['lower-back', 'abs'], ['kb swing', 'swing']),
  ex('single-leg-rdl', 'Single-Leg RDL', 'hinge', 'dumbbell', ['hamstrings', 'glutes'], ['lower-back'], ['sl rdl', 'single leg romanian deadlift'], true),

  // --- Horizontal push ----------------------------------------------------
  ex('bench-press', 'Bench Press', 'push-h', 'barbell', ['chest'], ['triceps', 'front-delts'], ['bench', 'bp', 'flat bench', 'barbell bench']),
  ex('incline-bench-press', 'Incline Bench Press', 'push-h', 'barbell', ['chest', 'front-delts'], ['triceps'], ['incline bench', 'incline bp']),
  ex('decline-bench-press', 'Decline Bench Press', 'push-h', 'barbell', ['chest'], ['triceps', 'front-delts'], ['decline bench']),
  ex('close-grip-bench-press', 'Close-Grip Bench Press', 'push-h', 'barbell', ['triceps', 'chest'], ['front-delts'], ['cgbp', 'close grip bench']),
  ex('dumbbell-bench-press', 'Dumbbell Bench Press', 'push-h', 'dumbbell', ['chest'], ['triceps', 'front-delts'], ['db bench', 'dumbbell press', 'db bench press']),
  ex('incline-dumbbell-press', 'Incline Dumbbell Press', 'push-h', 'dumbbell', ['chest', 'front-delts'], ['triceps'], ['incline db press', 'incline dumbbell bench']),
  ex('machine-chest-press', 'Machine Chest Press', 'push-h', 'machine', ['chest'], ['triceps', 'front-delts'], ['chest press']),
  ex('smith-bench-press', 'Smith Machine Bench Press', 'push-h', 'machine', ['chest'], ['triceps', 'front-delts'], ['smith bench']),
  ex('push-up', 'Push-Up', 'push-h', 'bodyweight', ['chest'], ['triceps', 'front-delts', 'abs'], ['pushup', 'press up', 'push ups']),
  ex('dip', 'Chest Dip', 'push-h', 'bodyweight', ['chest', 'triceps'], ['front-delts'], ['dips', 'parallel bar dip']),

  // --- Vertical push ------------------------------------------------------
  ex('overhead-press', 'Overhead Press', 'push-v', 'barbell', ['front-delts'], ['triceps', 'side-delts', 'abs'], ['ohp', 'military press', 'standing press', 'shoulder press']),
  ex('seated-barbell-press', 'Seated Barbell Press', 'push-v', 'barbell', ['front-delts'], ['triceps', 'side-delts'], ['seated ohp']),
  ex('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'push-v', 'dumbbell', ['front-delts'], ['triceps', 'side-delts'], ['db shoulder press', 'seated db press', 'db ohp']),
  ex('arnold-press', 'Arnold Press', 'push-v', 'dumbbell', ['front-delts', 'side-delts'], ['triceps']),
  ex('push-press', 'Push Press', 'push-v', 'barbell', ['front-delts'], ['triceps', 'quads', 'abs']),
  ex('machine-shoulder-press', 'Machine Shoulder Press', 'push-v', 'machine', ['front-delts'], ['triceps', 'side-delts']),
  ex('landmine-press', 'Landmine Press', 'push-v', 'barbell', ['front-delts', 'chest'], ['triceps', 'abs'], ['landmine shoulder press'], true),
  ex('pike-push-up', 'Pike Push-Up', 'push-v', 'bodyweight', ['front-delts'], ['triceps'], ['pike pushup']),

  // --- Horizontal pull ----------------------------------------------------
  ex('barbell-row', 'Barbell Row', 'pull-h', 'barbell', ['back'], ['rear-delts', 'biceps', 'forearms', 'lower-back'], ['bent over row', 'bor', 'bb row', 'row']),
  ex('pendlay-row', 'Pendlay Row', 'pull-h', 'barbell', ['back'], ['rear-delts', 'biceps', 'lower-back']),
  ex('dumbbell-row', 'One-Arm Dumbbell Row', 'pull-h', 'dumbbell', ['back'], ['rear-delts', 'biceps', 'forearms'], ['db row', 'single arm row', 'one arm row'], true),
  ex('chest-supported-row', 'Chest-Supported Row', 'pull-h', 'dumbbell', ['back'], ['rear-delts', 'biceps'], ['csr', 'incline row']),
  ex('seated-cable-row', 'Seated Cable Row', 'pull-h', 'cable', ['back'], ['rear-delts', 'biceps', 'forearms'], ['cable row', 'seated row']),
  ex('t-bar-row', 'T-Bar Row', 'pull-h', 'barbell', ['back'], ['rear-delts', 'biceps', 'lower-back'], ['tbar row']),
  ex('machine-row', 'Machine Row', 'pull-h', 'machine', ['back'], ['rear-delts', 'biceps'], ['hammer row', 'plate loaded row']),
  ex('inverted-row', 'Inverted Row', 'pull-h', 'bodyweight', ['back'], ['rear-delts', 'biceps', 'abs'], ['body row', 'australian pull up']),
  ex('single-arm-cable-row', 'Single-Arm Cable Row', 'pull-h', 'cable', ['back'], ['rear-delts', 'biceps'], ['one arm cable row'], true),
  ex('face-pull', 'Face Pull', 'pull-h', 'cable', ['rear-delts'], ['traps', 'back'], ['facepull', 'rope face pull']),

  // --- Vertical pull ------------------------------------------------------
  ex('pull-up', 'Pull-Up', 'pull-v', 'bodyweight', ['back'], ['biceps', 'forearms', 'rear-delts'], ['pullup', 'pull ups', 'pull up']),
  ex('chin-up', 'Chin-Up', 'pull-v', 'bodyweight', ['back', 'biceps'], ['forearms'], ['chinup', 'chin ups']),
  ex('neutral-grip-pull-up', 'Neutral-Grip Pull-Up', 'pull-v', 'bodyweight', ['back'], ['biceps', 'forearms'], ['hammer grip pull up']),
  ex('weighted-pull-up', 'Weighted Pull-Up', 'pull-v', 'bodyweight', ['back'], ['biceps', 'forearms'], ['weighted pullup']),
  ex('assisted-pull-up', 'Assisted Pull-Up', 'pull-v', 'machine', ['back'], ['biceps', 'forearms'], ['assisted pullup', 'pull up machine']),
  ex('lat-pulldown', 'Lat Pulldown', 'pull-v', 'cable', ['back'], ['biceps', 'forearms', 'rear-delts'], ['pulldown', 'lat pull down', 'lats']),
  ex('close-grip-pulldown', 'Close-Grip Pulldown', 'pull-v', 'cable', ['back'], ['biceps'], ['v bar pulldown', 'neutral grip pulldown']),

  // --- Lunge / single leg -------------------------------------------------
  ex('walking-lunge', 'Walking Lunge', 'lunge', 'dumbbell', ['quads', 'glutes'], ['hamstrings', 'calves'], ['lunge', 'lunges'], true),
  ex('reverse-lunge', 'Reverse Lunge', 'lunge', 'dumbbell', ['glutes', 'quads'], ['hamstrings'], ['backward lunge'], true),
  ex('bulgarian-split-squat', 'Bulgarian Split Squat', 'lunge', 'dumbbell', ['quads', 'glutes'], ['hamstrings', 'abs'], ['bss', 'rfess', 'rear foot elevated split squat'], true),
  ex('split-squat', 'Split Squat', 'lunge', 'barbell', ['quads', 'glutes'], ['hamstrings'], ['static lunge'], true),
  ex('step-up', 'Step-Up', 'lunge', 'dumbbell', ['quads', 'glutes'], ['calves'], ['box step up'], true),
  ex('lateral-lunge', 'Lateral Lunge', 'lunge', 'dumbbell', ['quads', 'glutes'], ['hamstrings'], ['side lunge'], true),
  ex('pistol-squat', 'Pistol Squat', 'lunge', 'bodyweight', ['quads', 'glutes'], ['hamstrings', 'abs'], ['single leg squat'], true),

  // --- Carry --------------------------------------------------------------
  ex('farmers-carry', "Farmer's Carry", 'carry', 'dumbbell', ['forearms', 'traps'], ['abs', 'quads'], ['farmers walk', 'farmer carry']),
  ex('suitcase-carry', 'Suitcase Carry', 'carry', 'dumbbell', ['abs', 'forearms'], ['traps'], ['single arm carry'], true),
  ex('overhead-carry', 'Overhead Carry', 'carry', 'dumbbell', ['front-delts', 'abs'], ['traps', 'triceps'], ['waiter walk']),
  ex('sled-push', 'Sled Push', 'carry', 'other', ['quads', 'glutes'], ['calves', 'hamstrings'], ['prowler push']),
  ex('sled-drag', 'Sled Drag', 'carry', 'other', ['quads', 'hamstrings'], ['glutes', 'calves'], ['reverse sled drag']),

  // --- Core ---------------------------------------------------------------
  ex('plank', 'Plank', 'core', 'bodyweight', ['abs'], ['lower-back'], ['front plank']),
  ex('side-plank', 'Side Plank', 'core', 'bodyweight', ['abs'], ['lower-back'], [], true),
  ex('hanging-leg-raise', 'Hanging Leg Raise', 'core', 'bodyweight', ['abs'], ['forearms'], ['hlr', 'leg raise']),
  ex('cable-crunch', 'Cable Crunch', 'core', 'cable', ['abs'], [], ['kneeling cable crunch']),
  ex('ab-wheel-rollout', 'Ab Wheel Rollout', 'core', 'other', ['abs'], ['lower-back', 'back'], ['ab wheel', 'rollout']),
  ex('crunch', 'Crunch', 'core', 'bodyweight', ['abs'], [], ['sit up', 'situp', 'crunches']),
  ex('russian-twist', 'Russian Twist', 'core', 'bodyweight', ['abs'], [], ['oblique twist']),
  ex('dead-bug', 'Dead Bug', 'core', 'bodyweight', ['abs'], ['lower-back'], ['deadbug']),
  ex('pallof-press', 'Pallof Press', 'core', 'cable', ['abs'], [], ['anti rotation press'], true),

  // --- Isolation ----------------------------------------------------------
  ex('barbell-curl', 'Barbell Curl', 'isolation', 'barbell', ['biceps'], ['forearms'], ['bb curl', 'curl', 'ez bar curl']),
  ex('dumbbell-curl', 'Dumbbell Curl', 'isolation', 'dumbbell', ['biceps'], ['forearms'], ['db curl', 'bicep curl']),
  ex('hammer-curl', 'Hammer Curl', 'isolation', 'dumbbell', ['biceps', 'forearms'], [], ['neutral curl']),
  ex('preacher-curl', 'Preacher Curl', 'isolation', 'barbell', ['biceps'], ['forearms'], ['scott curl']),
  ex('cable-curl', 'Cable Curl', 'isolation', 'cable', ['biceps'], ['forearms'], ['rope curl']),
  ex('incline-dumbbell-curl', 'Incline Dumbbell Curl', 'isolation', 'dumbbell', ['biceps'], ['forearms'], ['incline curl']),
  ex('triceps-pushdown', 'Triceps Pushdown', 'isolation', 'cable', ['triceps'], [], ['pushdown', 'tricep pushdown', 'rope pushdown']),
  ex('overhead-triceps-extension', 'Overhead Triceps Extension', 'isolation', 'cable', ['triceps'], [], ['overhead extension', 'french press']),
  ex('skull-crusher', 'Skull Crusher', 'isolation', 'barbell', ['triceps'], [], ['lying triceps extension', 'skullcrusher']),
  ex('triceps-kickback', 'Triceps Kickback', 'isolation', 'dumbbell', ['triceps'], [], ['kickback'], true),
  ex('bench-dip', 'Bench Dip', 'isolation', 'bodyweight', ['triceps'], ['chest', 'front-delts'], ['tricep dip']),
  ex('lateral-raise', 'Lateral Raise', 'isolation', 'dumbbell', ['side-delts'], ['traps'], ['side raise', 'lat raise', 'db lateral raise']),
  ex('cable-lateral-raise', 'Cable Lateral Raise', 'isolation', 'cable', ['side-delts'], ['traps'], ['cable side raise'], true),
  ex('machine-lateral-raise', 'Machine Lateral Raise', 'isolation', 'machine', ['side-delts'], ['traps']),
  ex('front-raise', 'Front Raise', 'isolation', 'dumbbell', ['front-delts'], [], ['db front raise']),
  ex('rear-delt-fly', 'Rear Delt Fly', 'isolation', 'dumbbell', ['rear-delts'], ['traps', 'back'], ['reverse fly', 'bent over fly']),
  ex('reverse-pec-deck', 'Reverse Pec Deck', 'isolation', 'machine', ['rear-delts'], ['traps'], ['reverse machine fly']),
  ex('upright-row', 'Upright Row', 'isolation', 'barbell', ['side-delts', 'traps'], ['biceps']),
  ex('barbell-shrug', 'Barbell Shrug', 'isolation', 'barbell', ['traps'], ['forearms'], ['shrug', 'shrugs']),
  ex('dumbbell-shrug', 'Dumbbell Shrug', 'isolation', 'dumbbell', ['traps'], ['forearms'], ['db shrug']),
  ex('cable-fly', 'Cable Fly', 'isolation', 'cable', ['chest'], ['front-delts'], ['cable crossover', 'crossover']),
  ex('pec-deck', 'Pec Deck', 'isolation', 'machine', ['chest'], ['front-delts'], ['chest fly machine', 'machine fly']),
  ex('dumbbell-fly', 'Dumbbell Fly', 'isolation', 'dumbbell', ['chest'], ['front-delts'], ['db fly', 'flyes']),
  ex('straight-arm-pulldown', 'Straight-Arm Pulldown', 'isolation', 'cable', ['back'], ['triceps'], ['lat pushdown']),
  ex('dumbbell-pullover', 'Dumbbell Pullover', 'isolation', 'dumbbell', ['back', 'chest'], ['triceps'], ['pullover']),
  ex('leg-extension', 'Leg Extension', 'isolation', 'machine', ['quads'], [], ['quad extension']),
  ex('lying-leg-curl', 'Lying Leg Curl', 'isolation', 'machine', ['hamstrings'], ['calves'], ['leg curl', 'hamstring curl']),
  ex('seated-leg-curl', 'Seated Leg Curl', 'isolation', 'machine', ['hamstrings'], ['calves']),
  ex('nordic-curl', 'Nordic Hamstring Curl', 'isolation', 'bodyweight', ['hamstrings'], ['glutes'], ['nordic ham curl']),
  ex('standing-calf-raise', 'Standing Calf Raise', 'isolation', 'machine', ['calves'], [], ['calf raise', 'calves']),
  ex('seated-calf-raise', 'Seated Calf Raise', 'isolation', 'machine', ['calves'], []),
  ex('hip-abduction', 'Hip Abduction', 'isolation', 'machine', ['glutes'], [], ['abductor machine']),
  ex('glute-kickback', 'Glute Kickback', 'isolation', 'cable', ['glutes'], ['hamstrings'], ['cable kickback'], true),
  ex('wrist-curl', 'Wrist Curl', 'isolation', 'dumbbell', ['forearms'], [], ['forearm curl']),
  ex('reverse-curl', 'Reverse Curl', 'isolation', 'barbell', ['forearms'], ['biceps'], ['reverse grip curl']),

  // --- Cardio (no muscle mapping — see the module header) -----------------
  ex('running', 'Running', 'cardio', 'other', [], [], ['run', 'jog', 'jogging', 'outdoor run']),
  ex('treadmill-run', 'Treadmill Run', 'cardio', 'machine', [], [], ['treadmill']),
  ex('incline-walk', 'Incline Treadmill Walk', 'cardio', 'machine', [], [], ['incline treadmill', '12-3-30']),
  ex('walking', 'Walking', 'cardio', 'other', [], [], ['walk', 'steps']),
  ex('cycling', 'Cycling', 'cardio', 'other', [], [], ['bike', 'ride', 'road cycling']),
  ex('stationary-bike', 'Stationary Bike', 'cardio', 'machine', [], [], ['spin bike', 'spinning', 'exercise bike']),
  ex('assault-bike', 'Air Bike', 'cardio', 'machine', [], [], ['assault bike', 'echo bike', 'airdyne']),
  ex('rowing-erg', 'Rowing Machine', 'cardio', 'machine', [], [], ['erg', 'rower', 'concept 2', 'rowing']),
  ex('elliptical', 'Elliptical', 'cardio', 'machine', [], [], ['cross trainer']),
  ex('stair-climber', 'Stair Climber', 'cardio', 'machine', [], [], ['stairmaster', 'stairs']),
  ex('swimming', 'Swimming', 'cardio', 'other', [], [], ['swim', 'laps']),
  ex('jump-rope', 'Jump Rope', 'cardio', 'other', [], [], ['skipping', 'skip rope']),

  // --- Mobility -----------------------------------------------------------
  ex('yoga', 'Yoga', 'mobility', 'bodyweight', [], [], ['vinyasa', 'yoga flow']),
  ex('stretching', 'Stretching', 'mobility', 'bodyweight', [], [], ['static stretching', 'stretch']),
  ex('dynamic-warmup', 'Dynamic Warm-Up', 'mobility', 'bodyweight', [], [], ['warm up', 'warmup']),
  ex('foam-rolling', 'Foam Rolling', 'mobility', 'other', [], [], ['foam roller', 'smr']),
  ex('hip-mobility', 'Hip Mobility', 'mobility', 'bodyweight', [], [], ['hip openers', 'couch stretch']),
  ex('shoulder-mobility', 'Shoulder Mobility', 'mobility', 'band', [], [], ['shoulder dislocates', 'band pull apart']),
  ex('pilates', 'Pilates', 'mobility', 'bodyweight', [], [], ['mat pilates']),

  // --- Sport --------------------------------------------------------------
  ex('basketball', 'Basketball', 'sport', 'other', [], [], ['hoops']),
  ex('soccer', 'Soccer', 'sport', 'other', [], [], ['football', 'futbol']),
  ex('tennis', 'Tennis', 'sport', 'other', [], []),
  ex('badminton', 'Badminton', 'sport', 'other', [], []),
  ex('cricket', 'Cricket', 'sport', 'other', [], []),
  ex('rock-climbing', 'Rock Climbing', 'sport', 'other', [], [], ['climbing', 'bouldering']),
  ex('martial-arts', 'Martial Arts', 'sport', 'other', [], [], ['boxing', 'mma', 'bjj', 'kickboxing']),
  ex('hiking', 'Hiking', 'sport', 'other', [], [], ['hike', 'trek']),
];

/** Training-level multipliers on the beginner table — a labelled heuristic. */
const LEVEL_MULTIPLIER: Record<Profile['trainingLevel'], number> = {
  beginner: 1,
  intermediate: 1.4,
  advanced: 1.7,
};

/**
 * Default landmarks for a training level, as a complete `Record<Muscle, …>`.
 *
 * Scales `DEFAULT_LANDMARKS` (the beginner table in `data/defaults.ts`, the
 * single source of truth) by the level multiplier and rounds to whole sets —
 * half a set is not a thing anyone can do. Monotonicity survives the rounding
 * because the multiplier is positive, so `mev ≤ mav ≤ mrv` always holds.
 *
 * `TrainingSettings.volumeLandmarks` is a *total* record, so every muscle is
 * present even when the table would read zero: a hole would quietly tell the
 * user they are below MEV on a muscle nobody has an opinion about.
 */
export function landmarkDefaults(
  level: Profile['trainingLevel'] = 'beginner',
): Record<Muscle, VolumeLandmark> {
  const k = LEVEL_MULTIPLIER[level] ?? 1;
  const out = {} as Record<Muscle, VolumeLandmark>;
  for (const m of MUSCLES) {
    const b = DEFAULT_LANDMARKS[m];
    out[m] = {
      mev: Math.round(b.mev * k),
      mav: Math.round(b.mav * k),
      mrv: Math.round(b.mrv * k),
    };
  }
  return out;
}

/**
 * The built-in 4-day upper/lower program, A week (Mon upper, Tue lower).
 *
 * Set × rep-range schemes: a heavy compound at 4 × 5–8 @ RPE 8, a second
 * compound at 3–4 × 6–12, then isolation at 3 × 10–20 @ RPE 9. The rep ranges
 * are the double-progression targets `strength.suggestProgression` reads — hit
 * the top of the range on every set at or under the target RPE and the load
 * goes up.
 */
export const DEFAULT_PROGRAM: Program = {
  id: 'builtin-ul4',
  name: 'Upper / Lower — 4 day (A)',
  builtIn: true,
  sessions: {
    upper: [
      { exerciseId: 'bench-press', sets: 4, reps: [5, 8], rpe: 8 },
      { exerciseId: 'barbell-row', sets: 4, reps: [6, 10], rpe: 8 },
      { exerciseId: 'overhead-press', sets: 3, reps: [6, 10], rpe: 8 },
      { exerciseId: 'lat-pulldown', sets: 3, reps: [8, 12], rpe: 9 },
      { exerciseId: 'lateral-raise', sets: 3, reps: [12, 20], rpe: 9 },
      { exerciseId: 'triceps-pushdown', sets: 3, reps: [10, 15], rpe: 9 },
      { exerciseId: 'barbell-curl', sets: 3, reps: [8, 12], rpe: 9 },
    ],
    lower: [
      { exerciseId: 'back-squat', sets: 4, reps: [5, 8], rpe: 8 },
      { exerciseId: 'romanian-deadlift', sets: 3, reps: [6, 10], rpe: 8 },
      { exerciseId: 'leg-press', sets: 3, reps: [10, 15], rpe: 9 },
      { exerciseId: 'lying-leg-curl', sets: 3, reps: [10, 15], rpe: 9 },
      { exerciseId: 'standing-calf-raise', sets: 4, reps: [10, 15], rpe: 9 },
      { exerciseId: 'hanging-leg-raise', sets: 3, reps: [8, 15], rpe: 9 },
    ],
  },
};

/**
 * The B week of the same program (Thu upper, Fri lower): vertical pull and
 * hinge lead, so each pattern is trained twice a week from two angles.
 * `Program.sessions` has a single `upper` / `lower` slot, so the B day is a
 * second `Program` rather than a second key.
 */
export const DEFAULT_PROGRAM_B: Program = {
  id: 'builtin-ul4-b',
  name: 'Upper / Lower — 4 day (B)',
  builtIn: true,
  sessions: {
    upper: [
      { exerciseId: 'pull-up', sets: 4, reps: [5, 10], rpe: 8 },
      { exerciseId: 'incline-dumbbell-press', sets: 4, reps: [8, 12], rpe: 8 },
      { exerciseId: 'seated-cable-row', sets: 3, reps: [8, 12], rpe: 8 },
      { exerciseId: 'dumbbell-shoulder-press', sets: 3, reps: [8, 12], rpe: 9 },
      { exerciseId: 'face-pull', sets: 3, reps: [12, 20], rpe: 9 },
      { exerciseId: 'hammer-curl', sets: 3, reps: [10, 15], rpe: 9 },
      { exerciseId: 'overhead-triceps-extension', sets: 3, reps: [10, 15], rpe: 9 },
    ],
    lower: [
      { exerciseId: 'deadlift', sets: 3, reps: [3, 6], rpe: 8 },
      { exerciseId: 'bulgarian-split-squat', sets: 3, reps: [8, 12], rpe: 8 },
      { exerciseId: 'hip-thrust', sets: 3, reps: [8, 12], rpe: 8 },
      { exerciseId: 'seated-leg-curl', sets: 3, reps: [10, 15], rpe: 9 },
      { exerciseId: 'seated-calf-raise', sets: 4, reps: [10, 15], rpe: 9 },
      { exerciseId: 'cable-crunch', sets: 3, reps: [10, 15], rpe: 9 },
    ],
  },
};

/** The A and B weeks in order — alternate them across the four training days. */
export const DEFAULT_PROGRAMS: readonly Program[] = [DEFAULT_PROGRAM, DEFAULT_PROGRAM_B];

// ---------------------------------------------------------------------------
// Lookup and search
// ---------------------------------------------------------------------------

const BY_ID: ReadonlyMap<string, Exercise> = new Map(EXERCISES.map((e) => [e.id, e]));

/**
 * Look up one exercise by id, searching the user's custom list first so an
 * override with a built-in id wins. `null` when nothing matches — a workout
 * may reference an exercise the user has since deleted.
 */
export function exerciseById(id: string, custom?: readonly Exercise[]): Exercise | null {
  if (!id) return null;
  if (custom) {
    for (const c of custom) if (c.id === id) return c;
  }
  return BY_ID.get(id) ?? null;
}

/** Display name for an id, falling back to the id itself so nothing renders blank. */
export function exerciseName(id: string, custom?: readonly Exercise[]): string {
  return exerciseById(id, custom)?.name ?? id;
}

export interface ExerciseSearchOpts {
  /** `settings.training.customExercises` — ranked above built-ins. */
  custom?: readonly Exercise[];
  /** Max results (default 20). */
  limit?: number;
}

/** Lowercase, de-accent, and reduce every separator to a single space. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  const n = normalize(s);
  return n ? n.split(' ') : [];
}

/**
 * True when `a` and `b` are one edit apart: one insert, delete or substitute
 * (Levenshtein ≤ 1) **or** one adjacent transposition, because "bnech" and
 * "sqaut" are the typos people actually make and plain Levenshtein scores a
 * swap as two edits.
 */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    const diffs: number[] = [];
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i]) {
        diffs.push(i);
        if (diffs.length > 2) return false;
      }
    }
    if (diffs.length <= 1) return true;
    // Exactly two mismatches: a swap of neighbours is still one typo.
    const [p, q] = diffs;
    return q === p + 1 && a[p] === b[q] && a[q] === b[p];
  }
  // One string is exactly one character longer: it must contain the other as a
  // subsequence with a single skip.
  const [short, long] = la < lb ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
    } else if (skipped) {
      return false;
    } else {
      skipped = true;
      j++;
    }
  }
  return true;
}

/** Minimum token length before typo tolerance applies — "bp" must stay exact. */
const FUZZY_MIN_LEN = 4;

/**
 * The lifts people log most, in the order a picker should offer them. Only a
 * tie-breaker: it decides which of two equally good matches comes first
 * ("press" → Bench Press before Leg Press), never whether something matches.
 */
const HEADLINE_IDS: readonly string[] = [
  'bench-press',
  'back-squat',
  'deadlift',
  'overhead-press',
  'barbell-row',
  'pull-up',
  'romanian-deadlift',
  'lat-pulldown',
  'incline-bench-press',
  'dumbbell-bench-press',
  'dumbbell-shoulder-press',
  'dumbbell-row',
  'seated-cable-row',
  'leg-press',
  'hip-thrust',
  'push-up',
  'dip',
  'chin-up',
  'lateral-raise',
  'barbell-curl',
  'dumbbell-curl',
  'triceps-pushdown',
  'face-pull',
  'leg-extension',
  'lying-leg-curl',
  'standing-calf-raise',
  'plank',
  'hanging-leg-raise',
  'running',
  'walking',
  'cycling',
];

interface Indexed {
  ex: Exercise;
  nameTokens: string[];
  aliasTokens: string[];
  /** Lower sorts first among equally good matches. */
  prominence: number;
}

function indexOf(e: Exercise, fallbackRank: number): Indexed {
  const aliasTokens: string[] = [];
  for (const a of e.aliases ?? []) aliasTokens.push(...tokenize(a));
  const headline = HEADLINE_IDS.indexOf(e.id);
  return {
    ex: e,
    nameTokens: tokenize(e.name),
    aliasTokens,
    prominence: headline >= 0 ? headline : HEADLINE_IDS.length + fallbackRank,
  };
}

const INDEX: readonly Indexed[] = EXERCISES.map((e, i) => indexOf(e, i));

/**
 * Cost of the best way this exercise matches one query token; `Infinity` when
 * it does not match at all (every query token must match something). Name and
 * alias are worth the same — "rdl" is not a worse way to mean the Romanian
 * deadlift than typing it out — and ties fall through to `prominence`.
 */
function tokenCost(ix: Indexed, q: string): number {
  if (ix.nameTokens.includes(q) || ix.aliasTokens.includes(q)) return 0;
  if (ix.nameTokens.some((t) => t.startsWith(q)) || ix.aliasTokens.some((t) => t.startsWith(q))) return 1;
  if (q.length >= FUZZY_MIN_LEN) {
    if (ix.nameTokens.some((t) => withinOneEdit(t, q))) return 2;
    if (ix.aliasTokens.some((t) => withinOneEdit(t, q))) return 2;
  }
  return Infinity;
}

/** Compounds before accessories before conditioning in the default listing. */
const PATTERN_ORDER: readonly MovementPattern[] = [
  'squat',
  'hinge',
  'push-h',
  'push-v',
  'pull-h',
  'pull-v',
  'lunge',
  'core',
  'carry',
  'isolation',
  'cardio',
  'mobility',
  'sport',
];

function byNameThenId(a: Exercise, b: Exercise): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Search by name or alias: token prefix match with a one-edit typo tolerance,
 * custom exercises first. An empty query returns the most useful default list
 * (customs, then compounds) rather than nothing, so the picker is never blank.
 *
 * Every query token has to match something — "incline db" narrows rather than
 * widens — and ties break on the headline order, then name, then id, so the
 * same query always returns the same list in the same order.
 */
export function searchExercises(query: string, opts?: ExerciseSearchOpts): Exercise[] {
  const limit = Math.max(0, Math.floor(opts?.limit ?? 20));
  if (limit === 0) return [];
  const custom = opts?.custom ?? [];
  const q = tokenize(query ?? '');

  if (q.length === 0) {
    const customFirst = [...custom].sort(byNameThenId);
    const builtIns = [...EXERCISES].sort((a, b) => {
      const pa = PATTERN_ORDER.indexOf(a.pattern);
      const pb = PATTERN_ORDER.indexOf(b.pattern);
      if (pa !== pb) return pa - pb;
      return byNameThenId(a, b);
    });
    const seenIds = new Set(customFirst.map((e) => e.id));
    return [...customFirst, ...builtIns.filter((e) => !seenIds.has(e.id))].slice(0, limit);
  }

  const customIds = new Set(custom.map((c) => c.id));
  const pool: Indexed[] = [
    ...custom.map((c, i) => indexOf(c, HEADLINE_IDS.length + EXERCISES.length + i)),
    ...INDEX,
  ];
  const seen = new Set<string>();
  const scored: { ix: Indexed; score: number }[] = [];
  for (const ix of pool) {
    if (seen.has(ix.ex.id)) continue; // a custom override shadows its built-in
    let score = 0;
    for (const token of q) {
      const c = tokenCost(ix, token);
      if (!Number.isFinite(c)) {
        score = Infinity;
        break;
      }
      score += c;
    }
    if (!Number.isFinite(score)) continue;
    seen.add(ix.ex.id);
    // The user's own exercises outrank everything built in.
    if (ix.ex.custom || customIds.has(ix.ex.id)) score -= 100;
    scored.push({ ix, score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.ix.prominence !== b.ix.prominence) return a.ix.prominence - b.ix.prominence;
    return byNameThenId(a.ix.ex, b.ix.ex);
  });
  return scored.slice(0, limit).map((s) => s.ix.ex);
}
