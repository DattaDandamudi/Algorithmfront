/**
 * Offline coach — the app must work with NO API key (SPEC §4/§5, README
 * "None (default): offline coach").
 *
 * Twelve rule-based handlers mirror the twelve quick-prompt chips, plus a
 * generic fallback. Every answer follows the §8 contract the Claude coach is
 * held to: second person, ≤120 words, cites the user's actual numbers from
 * CoachContext (and says plainly when one is missing), cause → effect → one
 * action, ends with a single **bold** action. 'direct' tone drops the
 * explanatory middle. The lab handler is lifestyle-only with a doctor cue;
 * elevated lead escalates to a physician (§6.7, CAVEATS).
 *
 * The four v3 routes (`lift`, `overtraining`, `stress`, `energy`) read the
 * `training` / `stress` / `energy` / `impact` blocks, which are optional: a
 * user with no wearable and no logged sessions still gets a complete answer,
 * because every sentence that depends on one of those blocks is either
 * rendered with its real numbers or not rendered at all — never a half
 * sentence, never a null. Two rules they inherit from the engine: ACWR is
 * described, never used as an injury prediction (Impellizzeri 2020), and
 * stress signals, behaviour effects and the illness flag are reported as
 * associations or patterns with their intervals — never as causes and never
 * as a diagnosis (§8 GUARDRAILS; persistence routes to the doctor cue).
 *
 * The illness/overload flag has exactly one wording here (`illnessNote`) and
 * one action (`ILLNESS_ACTION`), shared by every route that can be asked about
 * training while it is up — `stress`, `train` and `recovery`. It is the same
 * hedge as `ILLNESS_COPY` (engine/stress), the insight card and the readiness
 * modifier: **possible** illness *or* heavy overload, the user's own numbers as
 * the evidence, no condition named, and the doctor on persistence.
 */
import type { CoachContext, CoachTone, ISODate, Profile, SessionType, Targets, TrainingSplit, Weekday } from '../data/types';
import { hhmmToMinutes, weekdayOf } from '../lib/dates';
import { fmt, fmtSigned, fmtWeight, kgToLb, lbToKg, round } from '../lib/format';
import { EMERGENCY_MESSAGE, MAX_WORDS, detectEmergency, isSymptomAsk, wordCount } from './guardrails';

export type OfflineRoute =
  | 'lift'
  | 'overtraining'
  | 'stress'
  | 'energy'
  | 'train'
  | 'eat'
  | 'recovery'
  | 'weight'
  | 'carbs'
  | 'sleep'
  | 'tobacco'
  | 'labs'
  | 'generic';

/**
 * Order matters: earlier routes win ("carbs for a lift day" → carbs, not
 * train). The four v3 routes sit above `recovery`/`train` so the specific
 * question takes the specific handler ("what should I lift today?" → lift, not
 * train; "am I overtraining?" → overtraining, not recovery) and below `carbs`
 * so "plan my carbs for a lift day" is still a carb question.
 */
const ROUTES: Array<[OfflineRoute, RegExp]> = [
  // Supplement names ride with labs (R5-9): the handler is lifestyle-only and its action carries the doctor cue.
  ['labs', /vitamin|\bvit[-\s]?d\b|ferritin|omega|\biron\b|\bzinc\b|testosterone|\blead\s+(level|result|exposure)|\b(elevated|blood)\s+lead\b|\blabs?\b|blood\s*(work|test)|supplement|fish\s+oil|\bdos(e|ing|age)\b|retest|creatine|melatonin|ashwagandha|\bzma\b|pre[-\s]?workout|caffeine\s+(pills?|tablets?)|beta[-\s]?alanine|multivitamin/i],
  ['tobacco', /tobacco|smok|cigarette|nicotine|\bvap(e|ing)\b|\bquit/i],
  ['carbs', /\bcarb|\brice\b|\broti\b|\bnaan\b|\bfuel|glycogen|\bbread\b/i],
  ['lift', /what\s+(should|do|can|will)\s+i\s+lift|what\s+to\s+lift|\blift(s|ing)?\s+(today|now|next)|which\s+(lifts?|exercises?|muscles?)|what\s+exercises?|today'?s\s+(session|workout|lifts?)|planned\s+(session|workout|exercises?)|\bthis\s+lift\b|\be1rm\b|\bvolume\b|sets?\s+per\s+week|\bprogression\b|what\s+weight\s+should\s+i/i],
  ['overtraining', /\bover[-\s]?train|overreach|\bdeload\b|too\s+much\s+(training|volume|load|work)|training\s+too\s+(much|hard|often)|\bacwr\b|acute[:\s/]+chronic|\bmonotony\b|training\s+load|\bramping\s+up\b/i],
  ['stress', /\bstress(ed|ful|ors?|ing)?\b|\banxi(ous|ety)\b|overwhelm|\bwound\s+up\b|\bon\s+edge\b|\bhooper\b|resilien|check[-\s]?in\b|overnight\s+signals?|strain\s+index|getting\s+sick|coming\s+down\s+with|\bill(ness)?\b|\bbad\s+days\b|burn(t|ed)?\s*out/i],
  ['energy', /\benerg(y|etic|ies)\b(?!\s+(expenditure|density|balance|intake))|\balertness\b|afternoon\s+(slump|dip|crash)|\bslump\b|second\s+wind|\bpeak\s+(hours?|time)\b|\bwired\b/i],
  ['recovery', /recover|readiness|\bhrv\b|\brhr\b|resting\s+heart|heart\s+rate|\bstrain\b|whoop|overtrain|run[-\s]?down|burn(t|ed)?\s*out/i],
  ['sleep', /sleep|slept|\bbed|\bnap|tired|fatigue|\bdebt\b|wind[-\s]?down|caffeine|coffee|insomnia|\bwake|\bwoke/i],
  ['weight', /weigh|\btrend\b|\bscale\b|calorie|kcal|deficit|\btdee\b|expenditure|fat[-\s]?loss|\blos(e|ing)\s+(fat|weight)|plateau|stall|\bcut\b|maintenance|\bbulk/i],
  ['eat', /\beat|\bmeal|\bfood|lunch|dinner|breakfast|snack|hungry|hunger|protein|\bfat\b|fib(er|re)|macro|\bcook|restaurant|shawarma|tikka|kebab|biryani/i],
  ['train', /train|work\s*out|\blift|\bgym\b|session|exercise|progress|\bloads?\b|deload|squat|bench|deadlift|cardio|\bwalk|\brun\b|\bpush\b|\bpull\b|\blegs?\b|\bupper\b|\blower\b/i],
];

export function routeQuestion(q: string): OfflineRoute {
  const t = (q ?? '').trim();
  if (!t) return 'generic';
  for (const [route, re] of ROUTES) if (re.test(t)) return route;
  return 'generic';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const has = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const r0 = (v: number) => round(v, 0);
const r1 = (v: number) => round(v, 1);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * R7-9: weights and rates are stored in lb; every figure the coach quotes
 * follows `profile.units` exactly as the insight cards do (a kg user never
 * sees an lb number). `wtStr` is a weight ("78.0 kg"), `rateStr` a signed
 * weekly rate ("−0.50 kg/wk"), `perWk` an unsigned band edge ("0.39 kg/wk").
 */
type Units = Profile['units'];
const unitsOf = (p: Profile): Units => (p.units === 'kg' ? 'kg' : 'lb');
const inUnits = (lb: number, u: Units) => (u === 'kg' ? lbToKg(lb) : lb);
const wtStr = (lb: number, u: Units) => fmtWeight(lb, u);
const rateStr = (lb: number, u: Units) => `${fmtSigned(inUnits(lb, u), 2)} ${u}/wk`;
const perWk = (lb: number, u: Units) => `${fmt(inUnits(lb, u), 2)} ${u}/wk`;
/** Barbell loads are stored in kg (§1f); quote them in the same units as body weight. */
const loadStr = (kg: number, u: Units) => (u === 'kg' ? `${r1(kg)} kg` : `${r0(kgToLb(kg))} lb`);

interface Parts {
  lead: string;
  /** Optional sentences in priority order — later ones are dropped first to stay ≤120 words. */
  details: string[];
  /** The one action; rendered last in **bold**. */
  action: string;
}

/** Assemble lead + details + bold action, trimming details until the reply fits the word budget. */
function compose(parts: Parts, tone: CoachTone): string {
  const details = tone === 'direct' ? parts.details.slice(0, 2) : parts.details.slice();
  const action = `${parts.action.trim().replace(/[.!?\s]+$/, '')}.`;
  const build = () => `${[parts.lead, ...details].filter(Boolean).join(' ')} **${action}**`;
  let out = build();
  while (wordCount(out) > MAX_WORDS && details.length) {
    details.pop();
    out = build();
  }
  return out;
}

/** Next non-rest session after `today` on the weekly split, or null when the split is all rest. */
export function nextSession(split: TrainingSplit, today: ISODate): SessionType | null {
  const w = weekdayOf(today);
  for (let i = 1; i <= 7; i++) {
    const s = split[((w + i) % 7) as Weekday];
    if (s && s !== 'rest') return s;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * R7-8: the one user-facing HRV "baseline" is the 28-day reference the SWC is
 * centred on (`baseline28` — the figure the Today tile and hero also cite).
 * While it is still forming, the 7-day mean is named by its window instead.
 */
function hrvSentence(ctx: CoachContext): string {
  const h = ctx.hrv;
  if (!has(h.today)) return "I don't have HRV for today.";
  let s = `HRV ${r0(h.today)} ms`;
  const ref = has(h.baseline28) ? { value: h.baseline28, label: 'baseline' } : has(h.baseline7) ? { value: h.baseline7, label: '7-day average' } : null;
  if (ref) {
    const d = h.today - ref.value;
    const abs = r0(Math.abs(d));
    s += abs === 0 ? ` is at your ${r0(ref.value)} ms ${ref.label}` : ` is ${abs} ms ${d < 0 ? 'below' : 'above'} your ${r0(ref.value)} ms ${ref.label}`;
  }
  if (has(h.swcLower) && has(h.swcUpper)) s += ` (normal range ${r0(h.swcLower)}–${r0(h.swcUpper)} ms)`;
  return `${s}, band ${h.band}.`;
}

/** " (+1 vs 28-day baseline)" — or the explicitly-labelled 30-day mean while the reference is forming (R7-8). */
function hrvVsRef(h: CoachContext['hrv']): string {
  if (!has(h.today)) return '';
  if (has(h.baseline28)) return ` (${fmtSigned(h.today - h.baseline28, 0)} vs 28-day baseline)`;
  if (has(h.delta.delta)) return ` (${fmtSigned(h.delta.delta, 0)} vs 30-day avg)`;
  return '';
}

function sleepSentence(ctx: CoachContext): string {
  const s = ctx.sleep;
  if (!has(s.hours)) return "I don't have last night's sleep hours.";
  let out = `Sleep ${r1(s.hours)} h`;
  if (has(s.need)) out += ` vs ${r1(s.need)} h need`;
  if (has(s.debtMin) && s.debtMin > 0) out += `, ${r0(s.debtMin)} min debt`;
  return `${out}.`;
}

/**
 * The illness/overload flag in the one form the whole stack uses — `ILLNESS_COPY`
 * (engine/stress), the insight card (engine/insights) and the readiness modifier
 * (engine/readiness) all say the same thing: a **possibility**, with heavy
 * overload as the co-equal alternative, evidenced by the user's own numbers and
 * naming no condition. Null when the flag is down, so a caller can push it
 * without a guard of its own.
 */
function illnessNote(ctx: CoachContext): string | null {
  const ill = ctx.stress?.illness;
  if (!ill?.flag) return null;
  const since = ill.since ? ` since ${ill.since}` : '';
  const reasons = ill.reasons.length ? ` (${ill.reasons.slice(0, 2).join(', ')})` : '';
  return `Possible illness or heavy overload${since}${reasons} — a pattern in your own numbers, not a diagnosis.`;
}

/**
 * The action that goes with it. Any route that can be asked "should I train
 * today?" while the flag is up ends here rather than in a progression: an easy
 * day, and the doctor on persistence (§8 GUARDRAILS; `ILLNESS_DOCTOR_CUE` in
 * engine/stress). Before this, only the `stress` route escalated — a user on
 * day five of a flagged run who asked about training or recovery was given a
 * light-day instruction with no mention of the flag and no doctor cue at all.
 */
const ILLNESS_ACTION =
  'Keep today easy, sleep long and hydrate; if it lasts more than a few days or you feel unwell, see your doctor';

function train(ctx: CoachContext, profile: Profile, targets: Targets): Parts {
  const r = ctx.readiness;
  const session = ctx.dayType === 'lift' ? ctx.sessionType : null;
  const lead =
    r.score === null
      ? "I don't have a readiness score for today — no WHOOP recovery or HRV logged yet."
      : `Readiness ${r0(r.score)}% (${r.band}) from ${r.source === 'whoop' ? 'WHOOP recovery' : 'your HRV baseline'} — verdict: ${r.training}.`;
  const details = [hrvSentence(ctx), sleepSentence(ctx), session ? `Today is a ${session} day on your split.` : 'Today is a rest day on your split.'];
  // First, because `compose` drops details from the end to fit the word budget
  // and 'direct' keeps only the first two: the flag outranks every other line.
  const illness = illnessNote(ctx);
  if (illness) details.unshift(illness);

  let action: string;
  if (illness) {
    action = ILLNESS_ACTION;
  } else if (!session) {
    const next = nextSession(profile.split, ctx.today);
    action = `Keep it a rest day: walk toward ${targets.stepsMin.toLocaleString('en-US')} steps and save the progression for your next ${next ?? 'lift'} session`;
  } else if (r.band === 'green') {
    action = `Progress your ${session} loads today — add a rep or ~2.5% on the main lifts`;
  } else if (r.band === 'yellow') {
    action = `Train ${session} as planned but hold loads — no PRs, stop 1–2 reps shy of failure`;
  } else if (r.band === 'red') {
    action = `Swap the ${session} session for a light day — 20–30 min walk or mobility — and be in bed by ${profile.bedTarget}`;
  } else {
    action = `Train ${session} at moderate effort and hold loads until your readiness data is back`;
  }
  return { lead, details, action };
}

function eat(ctx: CoachContext, profile: Profile, targets: Targets): Parts {
  const n = ctx.nutrition;
  const pLeft = Math.max(0, r0(n.remaining.p));
  const kcLeft = r0(n.remaining.kc);
  const perMeal = has(n.proteinPerMealNeeded) ? r0(n.proteinPerMealNeeded) : 35;
  const lead =
    n.mealsLogged === 0
      ? `Nothing logged yet today: ${targets.protein} g protein and ${n.targets.kc} kcal to place across ${plural(n.mealsLeft, 'meal')}.`
      : `You're at ${r0(n.totals.p)} g protein of ${n.targets.p} g with ${plural(n.mealsLeft, 'meal')} left — ${pLeft} g to go, ${kcLeft} kcal remaining.`;
  const details: string[] = [];
  if (pLeft > 0 && n.mealsLeft > 0) details.push(`That's ~${perMeal} g protein per remaining meal.`);
  details.push(`Carbs ${r0(n.totals.c)} g so far against today's ${n.targets.carbsRange[0]}–${n.targets.carbsRange[1]} g ${ctx.dayType}-day range.`);
  details.push(
    n.fatBelowFloor
      ? `Fat is ${r0(n.totals.f)} g — under your ${n.targets.fatFloor} g floor, so include some (eggs, paneer, olive oil).`
      : `Fat ${r0(n.totals.f)} g (floor ${n.targets.fatFloor} g).`,
  );
  if (n.lateEating) details.push(`It's ${ctx.nowHHMM} — keep this one lighter and finish earlier tomorrow.`);

  let action: string;
  if (pLeft <= 0) {
    action = `Protein's done at ${r0(n.totals.p)} g — keep the rest of the day to veg and water and stay under ${targets.kcal} kcal`;
  } else if (n.mealsLeft === 0) {
    // All meal slots used but protein short: a small top-up, not a late fourth dinner (§6.5 late-eating rule).
    action = `Add a protein-only top-up of ~${Math.min(pLeft, 40)} g (Greek yogurt, eggs or paneer) — small, and before ${profile.bedTarget}`;
  } else if (ctx.dayType === 'lift') {
    action = `Lead your next meal with ~${perMeal} g protein: 200 g chicken tikka (~50 g) plus 1 roti or 150 g rice`;
  } else {
    action = `Lead your next meal with ~${perMeal} g protein: 200 g chicken tikka (~50 g) or 150 g tandoori prawns (~30 g) with salad — skip the naan`;
  }
  // "bed target", not "bedtime": the late-eating cutoff the engine actually
  // applies is the last fifth of your habitual wake window (McHill 2017), which
  // is not in the coach context — so this names the target you set rather than
  // implying it is when you go to sleep.
  if (n.lateEating && pLeft > 0) action += ` — and make it the last one before your ${profile.bedTarget} bed target`;
  return { lead, details, action };
}

function recovery(ctx: CoachContext, profile: Profile): Parts {
  const r = ctx.readiness;
  const lead =
    r.score === null
      ? "I don't have a readiness score for you today, so I can't say how low it is."
      : r.band === 'green'
        ? `Recovery isn't low today — readiness ${r0(r.score)}% (green).`
        : `Readiness is ${r0(r.score)}% (${r.band}).`;
  const details = [hrvSentence(ctx), sleepSentence(ctx)];
  const illness = illnessNote(ctx);
  if (illness) details.unshift(illness);
  if (has(ctx.rhr.today)) {
    details.push(`RHR ${r0(ctx.rhr.today)} bpm${has(ctx.rhr.delta) ? ` (${fmtSigned(ctx.rhr.delta, 0)} vs your ${r0(ctx.rhr.baseline ?? 0)} baseline)` : ''}.`);
  }
  const t = ctx.tobacco;
  if (t.today > 0 || (has(t.hrvSmokeFree) && has(t.hrvSmoking))) {
    let s = `Tobacco: ${t.today} today`;
    if (has(t.hrvSmokeFree) && has(t.hrvSmoking)) s += `; your HRV averages ${r0(t.hrvSmokeFree)} ms smoke-free vs ${r0(t.hrvSmoking)} ms after smoking`;
    details.push(`${s}.`);
  }
  if (has(ctx.sleep.bedtimeSdMin) && ctx.sleep.bedtimeSdMin > 45) {
    details.push(`Bedtime swung ${r0(ctx.sleep.bedtimeSdMin)} min this week — irregularity drags HRV down.`);
  }
  let action: string;
  if (illness) action = ILLNESS_ACTION;
  else if (r.band === 'red') action = `Keep today light — mobility or a 20–30 min walk — and be in bed by ${profile.bedTarget}`;
  else if (r.band === 'yellow') action = `Train but hold loads today, and protect tonight: in bed by ${profile.bedTarget}, no caffeine after ${profile.caffeineCutoff}`;
  else if (r.band === 'green') action = `You're primed — progress your loads and keep the same ${profile.bedTarget} bedtime tonight`;
  else action = `Log or import today's WHOOP recovery and HRV so I can pin down the cause; until then, train moderate and hold your loads`;
  return { lead, details, action };
}

// --- v3 routes: training, overtraining, stress, energy ---------------------
//
// Each one leans on an optional block. `t`/`s`/`e` are read through `?.` and
// every sentence is pushed only once its numbers exist, so a context with no
// training, stress or energy block yields a shorter answer, never a broken one.

/** Below this a muscle is still inside its 48–72 h recovery window (§1e). */
const RECOVERING_PCT = 90;
/** Three worse-than-normal check-ins in a row — the DALDA back-off cue (§1h). */
const WORSE_RUN_CUE = 3;
/** Week-on-week acute-load rise the engine treats as a ramp worth naming (§1e soft cap). */
const RAMP_PCT = 10;

const PR_KIND: Record<'weight' | 'reps' | 'e1rm', string> = { weight: 'load', reps: 'reps', e1rm: 'e1RM' };

/** "3×5–8 at 226 lb" — the part of a planned exercise a reply can act on. */
function prescription(e: NonNullable<CoachContext['training']>['plannedExercises'][number], u: Units): string {
  const load = has(e.loadKg) ? ` at ${loadStr(e.loadKg, u)}` : '';
  return `${e.sets}×${e.reps[0]}–${e.reps[1]}${load}`;
}

function lift(ctx: CoachContext, profile: Profile, targets: Targets): Parts {
  const t = ctx.training;
  const u = unitsOf(profile);
  const planned = t?.plannedExercises ?? [];
  const session = t && t.todaySession !== 'rest' ? t.todaySession : ctx.dayType === 'lift' ? ctx.sessionType : null;
  const next = nextSession(profile.split, ctx.today);
  const r = ctx.readiness;

  const lead = planned.length
    ? `Today is your ${session ?? 'training'} day — ${plural(planned.length, 'exercise')} planned.`
    : session
      ? `Today is your ${session} day, but I have no planned session for it — nothing logged for these lifts yet.`
      : `Today is a rest day on your split${next ? `; your next session is ${next}` : ''}.`;

  const details: string[] = [];
  for (const e of planned.slice(0, 2)) details.push(`${e.name} ${prescription(e, u)} — ${e.mode}.`);
  if (r.score !== null) details.push(`Readiness ${r0(r.score)}% (${r.band}) — verdict: ${r.training}.`);
  const sore = (t?.muscleReadiness ?? []).filter((m) => m.pct < RECOVERING_PCT).sort((a, b) => a.pct - b.pct)[0];
  if (sore) {
    details.push(`Your least-recovered muscle is ${sore.muscle} at ${r0(sore.pct)}%${has(sore.hoursSince) ? `, ${r0(sore.hoursSince)} h since you trained it` : ''}.`);
  }
  const pr = t?.prs7d[0];
  if (pr) details.push(`PR this week: ${pr.name} ${PR_KIND[pr.kind]} ${pr.kind === 'reps' ? r0(pr.value) : loadStr(pr.value, u)}.`);
  const plateau = t?.plateaus[0];
  if (plateau) details.push(`${plateau.name} hasn't moved in ${plural(plateau.sessions, 'session')} (${fmtSigned(plateau.gainPct, 1)}%).`);
  const lastSession = t?.lastSession;
  if (lastSession) details.push(`Last session: ${lastSession.session ?? lastSession.kind} on ${lastSession.d}${has(lastSession.srpe) ? ` at RPE ${lastSession.srpe}` : ''}.`);

  let action: string;
  if (!planned.length) {
    action = session
      ? `Log today's ${session} session in Train — with your sets and RPE on file I can pick the loads next time`
      : `Keep it a rest day: walk toward ${targets.stepsMin.toLocaleString('en-US')} steps and save the progression for your next ${next ?? 'lift'} session`;
  } else if (t?.deload.recommended) {
    action = `Run the ${session ?? 'planned'} session as a deload — same loads, about two-thirds of the sets${t.deload.reasons[0] ? ` (${t.deload.reasons[0]})` : ''}`;
  } else if (r.band === 'red') {
    action = `Swap the ${session ?? 'planned'} session for mobility or a 20–30 min walk and be in bed by ${profile.bedTarget}`;
  } else {
    const first = planned[0];
    action =
      first.mode === 'progress' && r.band === 'green'
        ? `Open with ${first.name} ${prescription(first, u)} and take the top set to RPE 8`
        : `Open with ${first.name} ${prescription(first, u)} and hold that load — no PR attempts today`;
  }
  return { lead, details, action };
}

function overtraining(ctx: CoachContext, profile: Profile): Parts {
  const l = ctx.training?.load;
  const s = ctx.stress;
  const c = s?.checkIn;
  const hasLoad = !!l && l.source !== 'none' && (l.acute7 > 0 || l.chronic28 > 0);

  const lead = hasLoad
    ? `Your 7-day load is ${r0(l.acute7)} units against a 28-day base of ${r0(l.chronic28)}${has(l.weekOverWeekPct) ? `, ${fmtSigned(l.weekOverWeekPct, 0)}% week-on-week` : ''}.`
    : "I don't have training load for you — no sessions logged and no WHOOP strain to read.";

  const details: string[] = [];
  if (hasLoad) {
    if (has(l.acwr) && l.acwrBand) details.push(`ACWR ${fmt(l.acwr, 2)} (${l.acwrBand}) — descriptive only, not a causal injury predictor.`);
    if (l.formBand) details.push(`Form ${fmtSigned(l.form, 0)} (${l.formBand})${has(l.monotony) ? `, monotony ${r1(l.monotony)}` : ''}.`);
  }
  if (c && c.worseRun >= WORSE_RUN_CUE) details.push(`Your check-in has been worse than normal ${plural(c.worseRun, 'day')} running — that is the back-off cue.`);
  else if (c && has(c.total)) details.push(`Check-in total ${r0(c.total)} of 28 (${c.band}) across ${plural(c.nDays, 'day')}.`);
  details.push(hrvSentence(ctx));
  if (ctx.hrv.overreaching === true) details.push('Your HRV variability has moved away from its own reference — the pattern that usually shows up before form drops.');
  if (s && has(s.resilience.score) && s.resilience.band) details.push(`Resilience ${r0(s.resilience.score)} (${s.resilience.band}) over ${plural(s.resilience.nDays, 'day')}.`);
  if (ctx.training?.deload.recommended) details.push(`Deload flags: ${ctx.training.deload.reasons.slice(0, 2).join('; ')}.`);

  let action: string;
  if (ctx.training?.deload.recommended) {
    action = 'Run a deload week — same loads, about two-thirds of the sets — and reassess at the next check-in';
  } else if (c && c.worseRun >= WORSE_RUN_CUE) {
    action = `Take two easy days and be in bed by ${profile.bedTarget} — ${plural(c.worseRun, 'day')} of worse-than-normal check-ins is the cue to back off`;
  } else if (hasLoad && has(l.weekOverWeekPct) && l.weekOverWeekPct > RAMP_PCT) {
    action = `Hold this week near ${r0(l.acute7)} load units instead of adding — the ${fmtSigned(l.weekOverWeekPct, 0)}% jump is the part to slow down`;
  } else if (hasLoad) {
    action = `Keep next week within about ${RAMP_PCT}% of ${r0(l.acute7)} load units and progress loads, not volume`;
  } else {
    action = 'Log your sessions (or import WHOOP workouts) for a fortnight so I can compare your acute load with your 28-day base';
  }
  return { lead, details, action };
}

/**
 * Stress. The leading number is the count of overnight signals outside the
 * user's own range, not the fused index — and every line here describes a
 * pattern: an outlying signal is never given a cause, a behaviour effect is
 * quoted with its interval, and the illness flag is named as a flag with its
 * reasons and routed to a doctor on persistence, never turned into a
 * diagnosis (§8 GUARDRAILS).
 */
function stress(ctx: CoachContext, profile: Profile): Parts {
  const s = ctx.stress;
  const c = s?.checkIn;
  const deviating = (s?.outliers ?? []).filter((o) => o.deviating);
  const named = deviating
    .slice(0, 2)
    .map((o) => `${o.label.toLowerCase()}${has(o.value) ? ` ${r1(o.value)}` : ''}${has(o.z) ? ` (${fmtSigned(o.z, 1)} SD)` : ''}`)
    .join(' and ');

  let lead: string;
  if (s && s.signalsAvailable > 0) {
    lead = `${s.signalsDeviating} of ${s.signalsAvailable} overnight signals ${s.signalsDeviating === 1 ? 'is' : 'are'} outside your own range${named ? `: ${named}` : ''}.`;
  } else if (c && has(c.total)) {
    lead = `I have no overnight signals for you, only your check-in: ${r0(c.total)} of 28 (${c.band}).`;
  } else {
    lead = "I don't have overnight signals or a check-in from you yet, so I can't say where your stress actually sits.";
  }

  // Order is the drop order: `compose` trims from the end, so the flag and the
  // back-off cue outrank the scores, and the scores outrank the context.
  const details: string[] = [];
  const illness = illnessNote(ctx);
  if (illness) details.push(illness);
  if (c && c.worseRun >= WORSE_RUN_CUE) details.push(`That's ${plural(c.worseRun, 'day')} running worse than your normal.`);
  if (s && has(s.osi)) {
    details.push(`Overnight strain index ${r0(s.osi)} of 100${has(s.osiLo) && has(s.osiHi) ? ` (${r0(s.osiLo)}–${r0(s.osiHi)} interval)` : ''}${s.band ? `, band ${s.band}` : ''}.`);
  }
  if (c && has(c.stress) && has(c.fatigue)) details.push(`You rated stress ${r0(c.stress)} of 7 and fatigue ${r0(c.fatigue)} of 7 this morning.`);
  if (s && has(s.resilience.score) && s.resilience.band) {
    details.push(`Resilience ${r0(s.resilience.score)} (${s.resilience.band})${has(s.resilience.balance) ? `, load-vs-recovery balance ${fmtSigned(s.resilience.balance, 2)}` : ''}.`);
  }
  const effect = ctx.impact?.effects[0];
  if (effect) details.push(`From your own days: ${effect.label} — an association, not a cause${effect.confound ? ` (${effect.confound})` : ''}.`);
  if (s?.calibrating) details.push(`I'm still learning your normal — ${plural(s.nRef, 'night')} of reference so far.`);

  let action: string;
  if (illness) {
    action = ILLNESS_ACTION;
  } else if (c && c.worseRun >= WORSE_RUN_CUE) {
    action = `Take today easy and be in bed by ${profile.bedTarget} — ${plural(c.worseRun, 'day')} of worse-than-normal check-ins is the cue to back off`;
  } else if (s && (s.band === 'major' || s.signalsDeviating >= 2)) {
    action = `Protect tonight: in bed by ${profile.bedTarget}, nothing caffeinated after ${profile.caffeineCutoff}, and keep training easy`;
  } else if (!c || c.missingToday) {
    action = `Fill in today's check-in in Log — four 1–7 taps, and it's the one stress signal that works without a wearable`;
  } else {
    action = `Keep tonight's routine — in bed by ${profile.bedTarget}, no caffeine after ${profile.caffeineCutoff} — and log tomorrow's check-in`;
  }
  return { lead, details, action };
}

/**
 * Energy. Every number is from the two-process forecast in `ctx.energy`; the
 * copy calls it a forecast, never a measurement, because nothing here has
 * continuous heart rate to measure it with.
 */
function energy(ctx: CoachContext, profile: Profile): Parts {
  const e = ctx.energy;
  const curve = e?.forecast ?? [];
  const peak = curve.reduce<(typeof curve)[number] | null>((best, p) => (best === null || p.value > best.value ? p : best), null);
  const nowMin = hhmmToMinutes(ctx.nowHHMM);
  const troughMin = e?.trough ? hhmmToMinutes(e.trough.hhmm) : null;
  const beforeTrough = nowMin !== null && troughMin !== null && nowMin < troughMin;

  const lead = has(e?.now)
    ? `Predicted energy is ${r0(e.now)} of 100 at ${ctx.nowHHMM} — a forecast from your sleep and body clock, not a measurement.`
    : curve.length
      ? "Here's today's predicted energy curve — a forecast from your sleep and body clock, not a measurement."
      : "I don't have an energy forecast yet — it needs last night's sleep and your wake time.";

  const details: string[] = [];
  if (e?.trough) details.push(`Your dip lands around ${e.trough.hhmm} at ${r0(e.trough.value)} of 100.`);
  if (peak) details.push(`The best window is around ${peak.hhmm} at ${r0(peak.value)}.`);
  if (e && has(e.atWake)) details.push(`You started the day at ${r0(e.atWake)}.`);
  if (e && has(e.caffeineActiveMg) && e.caffeineActiveMg > 0) details.push(`About ${r0(e.caffeineActiveMg)} mg of caffeine is still in you.`);
  if (e?.bedtimeReadyAt) details.push(`The curve reaches sleep-ready at ${e.bedtimeReadyAt}.`);
  if (e?.drivers.length) details.push(`Behind it: ${e.drivers.slice(0, 2).join(' and ')}.`);
  if (e && curve.length) details.push(`Confidence is ${e.confidence} — this is modelled, not measured.`);

  let action: string;
  if (!curve.length && !has(e?.now)) {
    action = `Log last night's sleep and your wake time (or import WHOOP sleep) and I'll forecast today's peak and dip`;
  } else if (e?.trough && beforeTrough) {
    action = `Put your hardest work before ${e.trough.hhmm} and give the dip a 10-min walk instead of more coffee`;
  } else if (e?.bedtimeReadyAt) {
    action = `Use the window after your dip for anything demanding, then start winding down at ${e.bedtimeReadyAt}`;
  } else {
    action = `Keep caffeine before ${profile.caffeineCutoff} so tonight's sleep isn't what flattens tomorrow's curve`;
  }
  return { lead, details, action };
}

function weight(ctx: CoachContext, profile: Profile, targets: Targets): Parts {
  const w = ctx.weight;
  const e = ctx.expenditure;
  const phase = profile.goalPhase;
  const u = unitsOf(profile);
  const [lo, hi] = w.targetLbPerWk;
  const details: string[] = [];
  let lead: string;
  if (!has(w.trend)) {
    lead = `I don't have a weight trend for you yet — ${plural(w.weighInsThisWeek, 'weigh-in')} this week${has(w.latest) ? `, latest ${wtStr(w.latest, u)}` : ''}.`;
  } else if (!has(w.weeklyRateLb)) {
    lead = `Trend weight is ${wtStr(w.trend, u)}${has(w.latest) ? ` (scale ${wtStr(w.latest, u)})` : ''}, but I need 8+ days of weigh-ins for a weekly rate.`;
  } else {
    // R5-15: the engine's band is a fat-loss band (§6.1, 0.5–1 %BW/wk); only rate it in that phase.
    const rate = `${rateStr(w.weeklyRateLb, u)} (${fmtSigned(w.weeklyRatePct, 2)}%/wk)`;
    if (phase === 'fat-loss') {
      const bandWord = w.inBand === 'in' ? 'on target' : w.inBand === 'below' ? 'slower than target' : w.inBand === 'above' ? 'faster than target' : 'not yet rated';
      lead = `Trend ${wtStr(w.trend, u)}, ${rate} against your ${fmt(inUnits(lo, u), 2)}–${perWk(hi, u)} loss target — ${bandWord}.`;
    } else if (phase === 'muscle-gain') {
      lead = `Trend ${wtStr(w.trend, u)}, ${rate} — you're in a muscle-gain phase, so I'm not rating that against a loss band; the aim is a slow upward trend.`;
    } else {
      lead = `Trend ${wtStr(w.trend, u)}, ${rate} — you're in maintenance, so I'm not rating that against a loss band; the aim is a flat trend.`;
    }
    if (has(w.latest)) details.push(`Today's scale ${wtStr(w.latest, u)} vs trend ${wtStr(w.trend, u)} — trust the trend, not the dot.`);
  }
  if (e.valid && has(e.tdee)) {
    let s = `Estimated expenditure ${r0(e.tdee)} kcal; you're targeting ${targets.kcal} kcal.`;
    if (has(e.suggestedKcal) && has(e.suggestedDelta) && e.suggestedDelta !== 0) s += ` The weekly check suggests ${r0(e.suggestedKcal)} kcal (${fmtSigned(e.suggestedDelta, 0)}).`;
    details.push(s);
  } else {
    details.push(`Expenditure isn't calibrated yet${e.reason ? ` (${e.reason})` : ''}.`);
  }
  if (w.weighInsThisWeek < 5) details.push(`Only ${plural(w.weighInsThisWeek, 'weigh-in')} this week — 5+ are needed for a valid update.`);

  let action: string;
  if (w.inBand === null || !has(w.weeklyRateLb)) {
    action = `Weigh in every morning this week so your trend and expenditure can calibrate, and hold ${targets.kcal} kcal`;
  } else if (phase === 'muscle-gain') {
    // §6 step size (100–200 kcal) — a falling trend in a gain phase means intake is short.
    if (w.weeklyRateLb < 0) {
      action =
        e.valid && has(e.suggestedKcal) && e.suggestedKcal > targets.kcal
          ? `Add ~${r0(e.suggestedKcal - targets.kcal)} kcal (to ${r0(e.suggestedKcal)}), mostly carbs on lift days — a gain phase needs the trend drifting up, not down`
          : `Add 100–150 kcal of carbs on lift days — a gain phase needs the trend drifting up, not down`;
    } else {
      action = `Hold ${targets.kcal} kcal and weigh in daily — the trend is drifting up as planned; reassess at the weekly check`;
    }
  } else if (phase === 'maintenance') {
    // §6: adjust in 100–200 kcal steps and give adaptation 14+ days to show before reacting.
    action = `Hold ${targets.kcal} kcal and weigh in daily; if the trend keeps moving one way for two weeks, adjust by 100–200 kcal`;
  } else if (w.inBand === 'in') {
    action = `Hold ${targets.kcal} kcal — the trend is in the band; ignore single-day scale swings`;
  } else if (w.inBand === 'below') {
    action =
      e.valid && has(e.suggestedKcal) && e.suggestedKcal < targets.kcal
        ? `Drop to ~${r0(e.suggestedKcal)} kcal from tomorrow (${fmtSigned(e.suggestedKcal - targets.kcal, 0)}), keeping protein at ${targets.protein} g and fat ≥${targets.fatFloor} g`
        : `Hold ${targets.kcal} kcal one more week and tighten logging before cutting — never take fat below ${targets.fatFloor} g`;
  } else {
    action =
      e.valid && has(e.suggestedKcal) && e.suggestedKcal > targets.kcal
        ? `Add ~${r0(e.suggestedKcal - targets.kcal)} kcal (to ${r0(e.suggestedKcal)}), mostly carbs on lift days, to protect muscle`
        : `Add 100–150 kcal of carbs on lift days — you're losing faster than the ${perWk(hi, u)} ceiling`;
  }
  return { lead, details, action };
}

function carbs(ctx: CoachContext, profile: Profile, targets: Targets): Parts {
  const n = ctx.nutrition;
  const [lo, hi] = n.targets.carbsRange;
  const [liftLo, liftHi] = targets.carbsLift;
  const remC = Math.max(0, r0(n.remaining.c));
  const next = nextSession(profile.split, ctx.today);
  const lead =
    ctx.dayType === 'lift'
      ? `Today is a ${ctx.sessionType} day, so carbs sit at ${lo}–${hi} g — training fuel, not a treat.`
      : `Today is a rest day (${lo}–${hi} g carbs); your next ${next ?? 'lift'} day opens up ${liftLo}–${liftHi} g.`;
  const details = [
    `You've had ${r0(n.totals.c)} g so far, ${remC} g to go.`,
    `Protein still comes first: ${Math.max(0, r0(n.remaining.p))} g left of ${n.targets.p} g.`,
    n.fatBelowFloor ? `Fat ${r0(n.totals.f)} g is under the ${n.targets.fatFloor} g floor.` : `For reference: 1 roti ≈ 21 g carbs, 150 g rice ≈ 42 g, 1 naan ≈ 45 g.`,
  ];
  let action: string;
  if (ctx.dayType === 'lift') {
    if (remC <= 0) action = `You've covered today's carbs (${r0(n.totals.c)} g) — keep the rest of the day to protein and veg`;
    else {
      const around = r0(remC * 0.6);
      const rotis = Math.max(1, r0(around / 21));
      const rice = Math.max(50, r0(around / 0.28 / 10) * 10);
      action = `Put ~${around} g carbs around your session — ${plural(rotis, 'roti')} or ${rice} g rice with your protein — and the rest at dinner`;
    }
  } else {
    action = `Keep carbs to ${lo}–${hi} g today (veg, dal, one roti) and load ${liftLo}–${liftHi} g on your next ${next ?? 'lift'} day`;
  }
  return { lead, details, action };
}

function sleep(ctx: CoachContext, profile: Profile): Parts {
  const s = ctx.sleep;
  const r = ctx.readiness;
  let lead: string;
  if (!has(s.hours)) {
    lead = `I don't have your sleep hours from last night${s.lastBedtime ? `, only a bedtime of ${s.lastBedtime}` : ''}.`;
  } else {
    lead = `You slept ${r1(s.hours)} h${has(s.need) ? ` against a ${r1(s.need)} h need` : ''}`;
    if (has(s.debtMin)) lead += s.debtMin > 0 ? ` — ${r0(s.debtMin)} min of debt` : ' — no debt';
    lead += '.';
  }
  const details: string[] = [];
  if (r.score !== null || has(ctx.hrv.today)) {
    const parts = [];
    if (r.score !== null) parts.push(`readiness ${r0(r.score)}% (${r.band})`);
    if (has(ctx.hrv.today)) parts.push(`HRV ${r0(ctx.hrv.today)} ms${hrvVsRef(ctx.hrv)}`);
    details.push(`This morning: ${parts.join(', ')}.`);
  }
  if (s.lastBedtime) {
    details.push(`Bed at ${s.lastBedtime} vs your ${profile.bedTarget} target${has(s.bedtimeSdMin) ? `; bedtime has swung ${r0(s.bedtimeSdMin)} min this week` : ''}.`);
  }
  const short = has(s.hours) && has(s.need) && s.hours < s.need - 0.5;
  if (short) details.push('Short sleep in a deficit shifts loss toward muscle and pushes hunger up — expect stronger cravings today.');
  if (ctx.nutrition.caffeineAfterCutoff) details.push(`Caffeine at ${ctx.nutrition.caffeineAfterCutoff} was past your ${profile.caffeineCutoff} cutoff.`);
  const action =
    has(s.hours) && has(s.need) && s.hours >= s.need
      ? `Good night's work — keep the same ${profile.bedTarget} bedtime tonight to bank consistency`
      : `Be in bed by ${profile.bedTarget} tonight — screens off 30 min before, no caffeine after your ${profile.caffeineCutoff} cutoff`;
  return { lead, details, action };
}

function tobacco(ctx: CoachContext): Parts {
  const t = ctx.tobacco;
  let lead = `You're at ${t.today} today`;
  if (has(t.avg7)) lead += ` vs a ${r1(t.avg7)}/day 7-day average`;
  if (t.streakDays > 0) lead += `, with a ${plural(t.streakDays, 'day')} smoke-free streak`;
  lead += '.';
  const details: string[] = [];
  if (has(t.hrvFree3) && has(t.hrvDelta3) && t.hrvDelta3 >= 1) {
    // §7 #9 wording — the last 3 smoke-free mornings (R3-11); the 30-day comparison is the fallback.
    details.push(`On your last 3 smoke-free days your HRV averaged ${r0(t.hrvFree3)} ms — ${r0(t.hrvDelta3)} ms higher than after smoking days, recovery you keep by skipping.`);
  } else if (has(t.hrvSmokeFree) && has(t.hrvSmoking)) {
    details.push(`On smoke-free days your HRV averages ${r0(t.hrvSmokeFree)} ms vs ${r0(t.hrvSmoking)} ms after smoking — ${r0(t.hrvSmokeFree - t.hrvSmoking)} ms of recovery you keep by skipping.`);
  } else {
    details.push("I don't have enough smoke-free vs smoking days yet to show your own HRV difference.");
  }
  if (ctx.readiness.score !== null || has(ctx.hrv.today)) {
    details.push(`Today: ${[ctx.readiness.score !== null ? `readiness ${r0(ctx.readiness.score)}%` : null, has(ctx.hrv.today) ? `HRV ${r0(ctx.hrv.today)} ms` : null].filter(Boolean).join(', ')}.`);
  }
  if (has(t.avg30)) details.push(`30-day average ${r1(t.avg30)}/day.`);
  details.push('Nicotine also trims REM and lifts overnight RHR, so every skipped one shows up in tomorrow\'s recovery.');
  const action =
    t.today === 0
      ? `Keep today at zero — one more day on the streak; when an urge hits, take a 10-min walk instead`
      : `Cap today at ${t.today} — push the next urge past a 10-min walk or your next meal`;
  return { lead, details, action };
}

const LAB_MENTION: Record<string, RegExp> = {
  vitd: /vitamin\s*d|\bvit[-\s]?d\b/i,
  ferritin: /ferritin|\biron\b/i,
  omega3: /omega|fish\s+oil/i,
  zinc: /\bzinc\b/i,
  testosterone: /testosterone|\bt\s+levels?\b/i,
  lead: /\blead\b/i,
};

function labs(ctx: CoachContext, targets: Targets, question: string): Parts {
  const bw = ctx.bloodwork;
  const mentioned = bw.filter((m) => LAB_MENTION[m.key]?.test(question));
  const focus = (mentioned.length ? mentioned : bw.filter((m) => m.status !== 'normal')).slice(0, 4);
  const val = (m: (typeof bw)[number]) =>
    Number.isFinite(m.value) && (m.value !== 0 || m.unit) ? `${m.value}${m.unit === '%' ? '%' : m.unit ? ` ${m.unit}` : ''} ` : '';
  const details: string[] = [];
  const leadMarker = bw.find((m) => m.key === 'lead' && (m.status === 'elevated' || m.status === 'high'));
  if (leadMarker) {
    details.push(
      `Lead ${val(leadMarker)}(elevated) needs physician follow-up — not something to manage here${has(ctx.frequency.homeCookedPct7d) ? `; cooking more at home (${r0(ctx.frequency.homeCookedPct7d)}% this week) lowers exposure` : ''}.`,
    );
  }
  for (const m of focus) {
    const v = val(m);
    switch (m.key) {
      case 'vitd':
        details.push(`Vitamin D ${v}(${m.status}): get midday daylight and oily fish or eggs most days.`);
        break;
      case 'ferritin':
        details.push(`Ferritin ${v}(${m.status}): red meat ${ctx.frequency.redMeatServings7d}× this week — pair iron foods with vitamin C and keep tea/coffee an hour from meals.`);
        break;
      case 'omega3':
        details.push(`Omega-3 index ${v}(${m.status}): fish ${ctx.frequency.fishServings7d}× this week; 2–3 oily-fish meals a week is what moves the index.`);
        break;
      case 'zinc':
        details.push(`Zinc (${m.status}): red meat, seafood and legumes cover it.`);
        break;
      case 'testosterone':
        details.push(`Testosterone ${v}(${m.status}): sleep ≥7 h, keep fat ≥${targets.fatFloor} g (you're at ${r0(ctx.nutrition.totals.f)} g today), lift consistently.`);
        break;
      case 'lead':
        break;
      default:
        details.push(`${m.label} ${v}(${m.status}).`);
    }
  }
  if (!bw.length) details.push("I don't have any bloodwork on file — add it in Settings.");
  const retest = focus.find((m) => m.retestOn)?.retestOn;
  return {
    lead: "Here's the lifestyle side only — I don't interpret labs or set doses.",
    details,
    action: `Book the retest${retest ? ` (${retest})` : ''} and confirm any supplement dosing with your doctor`,
  };
}

function generic(ctx: CoachContext, profile: Profile): Parts {
  const r = ctx.readiness;
  const n = ctx.nutrition;
  const pLeft = Math.max(0, r0(n.remaining.p));
  const lead = r.score === null ? 'No readiness score yet today — log or import WHOOP recovery or HRV.' : `Readiness ${r0(r.score)}% (${r.band}) — verdict: ${r.training}.`;
  const details = [`Protein ${r0(n.totals.p)} g of ${n.targets.p} g — ${pLeft} g left over ${plural(n.mealsLeft, 'meal')}; ${r0(n.remaining.kc)} kcal remaining.`];
  const u = unitsOf(profile);
  if (has(ctx.weight.trend)) details.push(`Trend weight ${wtStr(ctx.weight.trend, u)}${has(ctx.weight.weeklyRateLb) ? `, ${rateStr(ctx.weight.weeklyRateLb, u)}` : ''}.`);
  details.push(sleepSentence(ctx));
  details.push('Ask me about training, food, recovery, weight, carbs, sleep, tobacco or your lab habits.');
  let action: string;
  if (pLeft > 0 && n.mealsLeft > 0) action = `Lead your next meal with ~${has(n.proteinPerMealNeeded) ? r0(n.proteinPerMealNeeded) : 35} g protein`;
  else if (r.band === 'red') action = `Keep today light and be in bed by ${profile.bedTarget}`;
  else action = `Be in bed by ${profile.bedTarget} tonight`;
  return { lead, details, action };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

type Handler = (ctx: CoachContext, profile: Profile, targets: Targets, question: string) => Parts;

const HANDLERS: Record<OfflineRoute, Handler> = {
  lift: (ctx, profile, targets) => lift(ctx, profile, targets),
  overtraining: (ctx, profile) => overtraining(ctx, profile),
  stress: (ctx, profile) => stress(ctx, profile),
  energy: (ctx, profile) => energy(ctx, profile),
  train: (ctx, profile, targets) => train(ctx, profile, targets),
  eat: (ctx, profile, targets) => eat(ctx, profile, targets),
  recovery: (ctx, profile) => recovery(ctx, profile),
  weight: (ctx, profile, targets) => weight(ctx, profile, targets),
  carbs: (ctx, profile, targets) => carbs(ctx, profile, targets),
  sleep: (ctx, profile) => sleep(ctx, profile),
  tobacco: (ctx) => tobacco(ctx),
  labs: (ctx, _profile, targets, question) => labs(ctx, targets, question),
  generic: (ctx, profile) => generic(ctx, profile),
};

const SYMPTOM_LEAD =
  "You've mentioned a symptom, and that's outside what I can coach on — confirm it with your doctor rather than training through it.";
const SYMPTOM_ACTION = 'Hold or skip training today and check with a clinician before your next session';

/**
 * §8 GUARDRAILS (R5-6): a question that carries a symptom (pain, dizziness,
 * palpitations, …) keeps its cited numbers but never gets a progression
 * action — whatever the route, the action becomes "hold or skip training and
 * check with a clinician". The readiness verdict is dropped from the lead so
 * the reply cannot say "verdict: Progress" and "hold" in the same breath.
 */
function withSymptomHold(parts: Parts): Parts {
  const lead = parts.lead.replace(/ — verdict: [^.]+\./, '.');
  return { lead: SYMPTOM_LEAD, details: [lead, ...parts.details], action: SYMPTOM_ACTION };
}

/**
 * Rule-based answer for the offline coach; always ≤120 words and ends with one
 * **bold** action — except for an emergency phrase, which returns the plain
 * EMERGENCY_MESSAGE (a stop, not an action). The Coach screen already stops
 * such turns before calling this; the check here is a backstop (R5-1).
 */
export function answerOffline(question: string, ctx: CoachContext, profile: Profile, targets: Targets, tone: CoachTone): string {
  if (detectEmergency(question).emergency) return EMERGENCY_MESSAGE;
  const parts = HANDLERS[routeQuestion(question)](ctx, profile, targets, question);
  return compose(isSymptomAsk(question) ? withSymptomHold(parts) : parts, tone);
}
