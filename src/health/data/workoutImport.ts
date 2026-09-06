/**
 * Workout imports: WHOOP `workouts.csv`, Strava `activities.csv` and the
 * Apple Health `export.xml`.
 *
 * Pure and deterministic — every function takes text (or a chunk of it) and
 * returns `Workout[]` plus a diagnostic. Nothing here reads the clock, touches
 * storage, or decides what to keep: the store's `importWorkouts` owns dedupe
 * (by `externalId`, or same day + kind within 10 minutes) and never lets an
 * import overwrite a session the user typed.
 *
 * Each source gets a stable `externalId` so re-importing a bigger export of the
 * same history is a no-op rather than a duplicated year of training.
 *
 * CSV parsing, header normalisation and the wall-clock timestamp reader are
 * shared with `whoopImport.ts` — WHOOP writes both files the same way, and
 * Strava's date format is close enough that one tolerant parser covers both.
 */
import type { CardioDetail, ISODate, HHMM, Workout, WorkoutKind, WorkoutSource } from './types';
import { normalizeHeader, parseCsv, parseWhoopDateTime } from './whoopImport';
import { round } from '../lib/format';

export interface WorkoutParseResult {
  workouts: Workout[];
  /** Rows that carried no usable date/duration. */
  skipped: number;
  errors: string[];
  /** Header names that were recognised, in file order. */
  columnsFound: string[];
}

const MAX_ERRORS = 20;

const empty = (errors: string[] = [], skipped = 0): WorkoutParseResult => ({ workouts: [], skipped, errors, columnsFound: [] });

/** A number, or null for blank/non-numeric cells. Tolerates a trailing % or unit. */
function num(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim().replace(/[%,]/g, '');
  if (s === '') return null;
  const n = Number(s.replace(/[^\d.eE+-].*$/, ''));
  return Number.isFinite(n) ? n : null;
}

/** Minutes between two 'HH:MM' wall-clock times, wrapping past midnight. */
function minutesBetween(start: HHMM, end: HHMM): number | null {
  const toMin = (t: HHMM) => {
    const [h, m] = t.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  };
  const a = toMin(start);
  const b = toMin(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = b >= a ? b - a : b + 1440 - a;
  return diff;
}

/**
 * Activity name → the four kinds the app analyses.
 *
 * Anything that is clearly resistance work is `strength` (it feeds volume and
 * e1RM); anything with a pace or a heart-rate curve is `cardio`; stretching and
 * yoga are `mobility`; a named sport is `sport`. An unrecognised name defaults
 * to `cardio` rather than `strength`, because mis-labelling a kickabout as
 * lifting would invent sets that never happened.
 */
export function classifyActivity(name: string | undefined): WorkoutKind {
  const s = (name ?? '').toLowerCase();
  if (!s) return 'cardio';
  if (/(weight|lift|strength|resistance|powerlift|crossfit|functional|bodyweight|calisthenic)/.test(s)) return 'strength';
  if (/(yoga|pilates|stretch|mobility|meditation|breath|barre|foam)/.test(s)) return 'mobility';
  if (/(run|jog|walk|hik|cycl|bike|ride|swim|row|elliptical|stair|cardio|treadmill|ski|skat|paddle|climb|erg)/.test(s)) return 'cardio';
  if (/(soccer|football|basketball|tennis|squash|padel|badminton|cricket|hockey|rugby|volleyball|golf|box|martial|jiu|wrestl|dance|sport)/.test(s)) {
    return 'sport';
  }
  return 'cardio';
}

/** The sport label we keep for display, tidied but not invented. */
function sportName(raw: string | undefined): string | undefined {
  const s = (raw ?? '').trim();
  return s ? s : undefined;
}

function cardioOrUndefined(c: CardioDetail): CardioDetail | undefined {
  return Object.values(c).some((v) => v !== undefined) ? c : undefined;
}

/** Map header cells to canonical keys using an alias table; first match wins. */
function mapColumns<K extends string>(header: string[], aliases: Record<K, string[]>): { index: Partial<Record<K, number>>; found: string[] } {
  const index: Partial<Record<K, number>> = {};
  const found: string[] = [];
  header.forEach((h, i) => {
    const norm = normalizeHeader(h);
    if (!norm) return;
    for (const key of Object.keys(aliases) as K[]) {
      if (index[key] === undefined && aliases[key].includes(norm)) {
        index[key] = i;
        found.push(h.trim());
        break;
      }
    }
  });
  return { index, found };
}

// ---------------------------------------------------------------------------
// WHOOP workouts.csv
// ---------------------------------------------------------------------------

type WhoopKey =
  | 'start'
  | 'end'
  | 'activity'
  | 'strain'
  | 'avgHr'
  | 'maxHr'
  | 'kcal'
  | 'distance'
  | 'elev'
  | 'duration'
  | 'z0'
  | 'z1'
  | 'z2'
  | 'z3'
  | 'z4'
  | 'z5';

const WHOOP_ALIASES: Record<WhoopKey, string[]> = {
  start: ['workoutstarttime', 'starttime', 'start'],
  end: ['workoutendtime', 'endtime', 'end'],
  activity: ['activityname', 'activitytype', 'activity', 'sport', 'sportname'],
  strain: ['activitystrain', 'strain', 'workoutstrain'],
  avgHr: ['averagehrbpm', 'averageheartratebpm', 'averagehr', 'avghrbpm', 'avghr'],
  maxHr: ['maxhrbpm', 'maxheartratebpm', 'maxhr'],
  kcal: ['energyburnedcal', 'energyburned', 'calories', 'kilojoule', 'kilojoules'],
  distance: ['distancemeters', 'distancemeter', 'distancem', 'distancekm', 'distance'],
  elev: ['altitudegainmeters', 'altitudegainm', 'elevationgainm', 'elevationgain', 'altitudegain'],
  duration: ['durationmin', 'duration', 'workoutdurationmin'],
  z0: ['hrzone1%', 'hrzone1', 'zone1%', 'heartratezone1%'],
  z1: ['hrzone2%', 'hrzone2', 'zone2%', 'heartratezone2%'],
  z2: ['hrzone3%', 'hrzone3', 'zone3%', 'heartratezone3%'],
  z3: ['hrzone4%', 'hrzone4', 'zone4%', 'heartratezone4%'],
  z4: ['hrzone5%', 'hrzone5', 'zone5%', 'heartratezone5%'],
  z5: ['hrzone6%', 'hrzone6', 'zone6%', 'heartratezone6%'],
};

/**
 * WHOOP's zone columns are percentages of the session, so they become minutes
 * against the session duration. WHOOP labels its zones 1–6; the app's
 * `zoneMin` array is indexed 0–5 in the same order.
 */
function whoopZones(pct: (number | null)[], durationMin: number): CardioDetail['zoneMin'] | undefined {
  if (!pct.some((p) => p !== null)) return undefined;
  const mins = pct.map((p) => round(((p ?? 0) / 100) * durationMin, 1));
  return [mins[0], mins[1], mins[2], mins[3], mins[4], mins[5]];
}

export function parseWhoopWorkouts(text: string): WorkoutParseResult {
  const rows = parseCsv(text ?? '');
  if (rows.length === 0) return empty(['File is empty.']);
  const { index, found } = mapColumns(rows[0], WHOOP_ALIASES);
  // A session needs a start AND something that makes it a session — a duration,
  // an end, or an activity name. Without that guard, physiological_cycles.csv
  // (same export, one row per day) would be read as a year of empty workouts.
  const hasSession = index.end !== undefined || index.duration !== undefined || index.activity !== undefined;
  if (index.start === undefined || !hasSession) {
    return { ...empty(['No workout start time and duration/activity columns found — is this workouts.csv?'], Math.max(0, rows.length - 1)), columnsFound: found };
  }

  const workouts: Workout[] = [];
  const errors: string[] = [];
  let skipped = 0;
  const fail = (line: number, why: string) => {
    skipped++;
    if (errors.length < MAX_ERRORS) errors.push(`Row ${line}: ${why}`);
  };

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const cell = (k: WhoopKey) => (index[k] === undefined ? undefined : cells[index[k] as number]);
    const start = parseWhoopDateTime(cell('start'));
    if (!start?.time) {
      fail(r + 1, `unreadable start time "${(cell('start') ?? '').trim()}"`);
      continue;
    }
    const end = parseWhoopDateTime(cell('end'));
    const durationMin = num(cell('duration')) ?? (end?.time ? minutesBetween(start.time, end.time) : null);
    if (durationMin === null || durationMin <= 0) {
      fail(r + 1, `no usable duration for ${start.date}`);
      continue;
    }

    const activity = sportName(cell('activity'));
    const kind = classifyActivity(activity);
    const strain = num(cell('strain'));
    const distanceRaw = num(cell('distance'));
    const distanceKm =
      distanceRaw === null ? undefined : /km/.test(normalizeHeader(rows[0][index.distance as number] ?? '')) ? round(distanceRaw, 2) : round(distanceRaw / 1000, 2);
    const kcalRaw = num(cell('kcal'));
    const kcalHeader = normalizeHeader(rows[0][index.kcal as number] ?? '');
    const kcal = kcalRaw === null ? undefined : /kilojoule/.test(kcalHeader) ? Math.round(kcalRaw / 4.184) : Math.round(kcalRaw);

    const cardio = cardioOrUndefined({
      sport: activity,
      distanceKm,
      avgHr: num(cell('avgHr')) ?? undefined,
      maxHr: num(cell('maxHr')) ?? undefined,
      elevM: num(cell('elev')) ?? undefined,
      kcal,
      zoneMin: whoopZones([num(cell('z0')), num(cell('z1')), num(cell('z2')), num(cell('z3')), num(cell('z4')), num(cell('z5'))], durationMin),
    });

    workouts.push(
      compactWorkout({
        id: '',
        d: start.date,
        start: start.time,
        durationMin: Math.round(durationMin),
        kind,
        title: activity,
        // WHOOP strain is 0–21 on a logarithmic scale; halving it lands in the
        // 1–10 Foster range well enough to seed a session RPE the user can
        // correct. engine/load fits the strain→load curve properly.
        srpe: strain === null ? undefined : round(Math.min(10, Math.max(1, strain / 2)), 1),
        cardio: kind === 'strength' ? undefined : cardio,
        source: 'whoop',
        externalId: `whoop:${start.date}T${start.time}`,
      }),
    );
  }

  return { workouts, skipped, errors, columnsFound: found };
}

// ---------------------------------------------------------------------------
// Strava activities.csv
// ---------------------------------------------------------------------------

type StravaKey = 'id' | 'date' | 'name' | 'type' | 'elapsed' | 'moving' | 'distance' | 'elev' | 'avgHr' | 'maxHr' | 'kcal' | 'effort' | 'perceived';

const STRAVA_ALIASES: Record<StravaKey, string[]> = {
  id: ['activityid'],
  date: ['activitydate', 'date'],
  name: ['activityname', 'name'],
  type: ['activitytype', 'type'],
  elapsed: ['elapsedtime'],
  moving: ['movingtime'],
  distance: ['distance', 'distancekm'],
  elev: ['elevationgain', 'totalelevationgain'],
  avgHr: ['averageheartrate', 'avgheartrate'],
  maxHr: ['maxheartrate'],
  kcal: ['calories'],
  effort: ['relativeeffort'],
  perceived: ['perceivedexertion'],
};

/**
 * Strava writes dates like "Sep 6, 2026, 7:15:03 AM" as well as ISO, so this
 * falls back to a month-name parse when the shared ISO reader declines.
 */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseStravaDate(raw: string | undefined): { date: ISODate; time: HHMM } | null {
  const iso = parseWhoopDateTime(raw);
  if (iso?.time) return { date: iso.date, time: iso.time };
  const s = (raw ?? '').trim();
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/.exec(s);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].toLowerCase());
  if (mi < 0) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  let hour = Number(m[4]);
  const min = Number(m[5]);
  const ampm = m[6]?.toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (day < 1 || day > 31 || hour > 23 || min > 59) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${year}-${pad(mi + 1)}-${pad(day)}`, time: `${pad(hour)}:${pad(min)}` };
}

export function parseStravaActivities(text: string): WorkoutParseResult {
  const rows = parseCsv(text ?? '');
  if (rows.length === 0) return empty(['File is empty.']);
  const { index, found } = mapColumns(rows[0], STRAVA_ALIASES);
  if (index.date === undefined) {
    return { ...empty(['No "Activity Date" column found — is this activities.csv?'], Math.max(0, rows.length - 1)), columnsFound: found };
  }

  const workouts: Workout[] = [];
  const errors: string[] = [];
  let skipped = 0;
  const fail = (line: number, why: string) => {
    skipped++;
    if (errors.length < MAX_ERRORS) errors.push(`Row ${line}: ${why}`);
  };

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const cell = (k: StravaKey) => (index[k] === undefined ? undefined : cells[index[k] as number]);
    const when = parseStravaDate(cell('date'));
    if (!when) {
      fail(r + 1, `unreadable activity date "${(cell('date') ?? '').trim()}"`);
      continue;
    }
    // Strava times are seconds; moving time is the honest one for load.
    const seconds = num(cell('moving')) ?? num(cell('elapsed'));
    if (seconds === null || seconds <= 0) {
      fail(r + 1, `no usable duration for ${when.date}`);
      continue;
    }
    const durationMin = Math.max(1, Math.round(seconds / 60));
    const type = sportName(cell('type'));
    const kind = classifyActivity(type ?? cell('name'));
    const distanceRaw = num(cell('distance'));
    // Strava exports metres in the bulk CSV; anything under 100 is already km.
    const distanceKm = distanceRaw === null ? undefined : round(distanceRaw >= 100 ? distanceRaw / 1000 : distanceRaw, 2);
    // "Relative Effort" is Strava's own load number, not an RPE; only the
    // Perceived Exertion column is a 1-10 rating the user actually gave.
    const perceived = num(cell('perceived'));

    workouts.push(
      compactWorkout({
        id: '',
        d: when.date,
        start: when.time,
        durationMin,
        kind,
        title: sportName(cell('name')) ?? type,
        srpe: perceived === null ? undefined : round(Math.min(10, Math.max(1, perceived)), 1),
        cardio:
          kind === 'strength'
            ? undefined
            : cardioOrUndefined({
                sport: type,
                distanceKm,
                avgHr: num(cell('avgHr')) ?? undefined,
                maxHr: num(cell('maxHr')) ?? undefined,
                elevM: num(cell('elev')) ?? undefined,
                kcal: num(cell('kcal')) ?? undefined,
              }),
        source: 'strava',
        externalId: `strava:${(cell('id') ?? '').trim() || `${when.date}T${when.time}`}`,
      }),
    );
  }

  return { workouts, skipped, errors, columnsFound: found };
}

// ---------------------------------------------------------------------------
// Apple Health export.xml
// ---------------------------------------------------------------------------

const APPLE_TYPE_MAP: Array<[RegExp, WorkoutKind]> = [
  [/TraditionalStrengthTraining|FunctionalStrengthTraining|CrossTraining|Core/i, 'strength'],
  [/Yoga|Pilates|Flexibility|MindAndBody|Cooldown|PreparationAndRecovery/i, 'mobility'],
  [/Running|Walking|Cycling|Swimming|Rowing|Elliptical|StairClimbing|HighIntensityIntervalTraining|Hiking/i, 'cardio'],
  [/Soccer|Basketball|Tennis|Badminton|Cricket|Hockey|Rugby|Volleyball|Golf|Boxing|MartialArts|Dance|Squash/i, 'sport'],
];

function appleKind(type: string): WorkoutKind {
  for (const [re, kind] of APPLE_TYPE_MAP) if (re.test(type)) return kind;
  return classifyActivity(type.replace(/^HKWorkoutActivityType/, ''));
}

/** 'YYYY-MM-DD HH:MM:SS +0000' → wall-clock date and time, offset ignored (Apple writes local time). */
function appleDateTime(raw: string | undefined): { date: ISODate; time: HHMM } | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec((raw ?? '').trim());
  return m ? { date: m[1], time: `${m[2]}:${m[3]}` } : null;
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : undefined;
}

/**
 * Apple's export is one huge XML file (hundreds of MB of `<Record>` samples),
 * so this scans for `<Workout ...>` elements with a regex rather than building
 * a DOM, and the caller streams the file in chunks. `<Record>` elements are
 * never parsed — they are the bulk of the file and none of them is a workout.
 *
 * Statistics children (heart rate, distance, energy) are read from the element
 * body when the workout tag is not self-closing.
 */
export function parseAppleWorkouts(xml: string): WorkoutParseResult {
  const workouts: Workout[] = [];
  const errors: string[] = [];
  let skipped = 0;

  const re = /<Workout\b([^>]*?)(\/>|>([\s\S]*?)<\/Workout>)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const head = match[1];
    const body = match[3] ?? '';
    const type = attr(`<x ${head}>`, 'workoutActivityType') ?? '';
    const when = appleDateTime(attr(`<x ${head}>`, 'startDate'));
    if (!when) {
      skipped++;
      if (errors.length < MAX_ERRORS) errors.push('A workout element had no readable startDate.');
      continue;
    }
    const durationRaw = Number(attr(`<x ${head}>`, 'duration') ?? '');
    const unit = (attr(`<x ${head}>`, 'durationUnit') ?? 'min').toLowerCase();
    const durationMin = Number.isFinite(durationRaw) ? (unit.startsWith('s') ? durationRaw / 60 : durationRaw) : NaN;
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      skipped++;
      if (errors.length < MAX_ERRORS) errors.push(`Workout on ${when.date} had no usable duration.`);
      continue;
    }

    // `name` may be an alternation, so it is wrapped: without the group the
    // alternation would escape the surrounding attribute pattern and match
    // nothing (or the wrong element).
    const statTag = (name: string): string | undefined =>
      new RegExp(`<WorkoutStatistics[^>]*type="[^"]*(?:${name})[^"]*"[^>]*/?>`, 'i').exec(body)?.[0];
    const statOf = (tag: string | undefined, which: 'average' | 'maximum' | 'sum'): number | undefined => {
      if (!tag) return undefined;
      const v = attr(tag, which);
      const n = v === undefined ? NaN : Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const hrTag = statTag('HeartRate');
    const distanceTag = statTag('DistanceWalkingRunning|DistanceCycling|DistanceSwimming');
    const energyTag = statTag('ActiveEnergyBurned');
    const distance = statOf(distanceTag, 'sum');
    // Apple writes the unit on the statistic itself, and a UK/US export can mix
    // miles and kilometres in the same file.
    const distanceUnitIsMiles = /unit="mi"/i.test(distanceTag ?? '');
    const avgHr = statOf(hrTag, 'average');
    const maxHr = statOf(hrTag, 'maximum');
    const kcal = statOf(energyTag, 'sum');
    const kind = appleKind(type);

    workouts.push(
      compactWorkout({
        id: '',
        d: when.date,
        start: when.time,
        durationMin: Math.round(durationMin),
        kind,
        title: type.replace(/^HKWorkoutActivityType/, '') || undefined,
        cardio:
          kind === 'strength'
            ? undefined
            : cardioOrUndefined({
                sport: type.replace(/^HKWorkoutActivityType/, '') || undefined,
                distanceKm: distance === undefined ? undefined : round(distanceUnitIsMiles ? distance * 1.60934 : distance, 2),
                avgHr: avgHr === undefined ? undefined : Math.round(avgHr),
                maxHr: maxHr === undefined ? undefined : Math.round(maxHr),
                kcal: kcal === undefined ? undefined : Math.round(kcal),
              }),
        source: 'apple',
        externalId: `apple:${when.date}T${when.time}:${type}`,
      }),
    );
  }

  return { workouts, skipped, errors, columnsFound: [] };
}

// ---------------------------------------------------------------------------

/** Drop undefined keys so imported sessions serialise as compactly as typed ones. */
function compactWorkout(w: Workout): Workout {
  const out = { ...w } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  if (out.cardio && typeof out.cardio === 'object') {
    const c = { ...(out.cardio as Record<string, unknown>) };
    for (const k of Object.keys(c)) if (c[k] === undefined) delete c[k];
    out.cardio = c;
  }
  return out as unknown as Workout;
}

/** Which parser to use, by file name and a peek at the content. */
export function detectWorkoutSource(filename: string, sample: string): WorkoutSource | null {
  const f = filename.toLowerCase();
  if (f.endsWith('.xml') || /<HealthData|<Workout\b/.test(sample)) return 'apple';
  if (/workouts?\.csv$/.test(f)) return 'whoop';
  if (/activities?\.csv$/.test(f)) return 'strava';
  const head = normalizeHeader(sample.split(/\r?\n/)[0] ?? '');
  if (head.includes('activitydate') || head.includes('activityid')) return 'strava';
  if (head.includes('workoutstarttime') || head.includes('activitystrain')) return 'whoop';
  return null;
}

/** Parse by detected source; returns an empty result with an error when unrecognised. */
export function parseWorkoutFile(filename: string, text: string): WorkoutParseResult & { source: WorkoutSource | null } {
  const source = detectWorkoutSource(filename, text.slice(0, 4000));
  if (source === 'whoop') return { ...parseWhoopWorkouts(text), source };
  if (source === 'strava') return { ...parseStravaActivities(text), source };
  if (source === 'apple') return { ...parseAppleWorkouts(text), source };
  return { ...empty([`Could not tell what "${filename}" is — expected WHOOP workouts.csv, Strava activities.csv, or an Apple Health export.xml.`]), source: null };
}
