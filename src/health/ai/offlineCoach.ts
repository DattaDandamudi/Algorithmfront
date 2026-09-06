/**
 * Offline coach — the app must work with NO API key (SPEC §4/§5, README
 * "None (default): offline coach").
 *
 * Eight rule-based handlers mirror the eight quick-prompt chips, plus a
 * generic fallback. Every answer follows the §8 contract the Claude coach is
 * held to: second person, ≤120 words, cites the user's actual numbers from
 * CoachContext (and says plainly when one is missing), cause → effect → one
 * action, ends with a single **bold** action. 'direct' tone drops the
 * explanatory middle. The lab handler is lifestyle-only with a doctor cue;
 * elevated lead escalates to a physician (§6.7, CAVEATS).
 */
import type { CoachContext, CoachTone, ISODate, Profile, SessionType, Targets, TrainingSplit, Weekday } from '../data/types';
import { weekdayOf } from '../lib/dates';
import { fmtSigned, round } from '../lib/format';
import { MAX_WORDS, wordCount } from './guardrails';

export type OfflineRoute = 'train' | 'eat' | 'recovery' | 'weight' | 'carbs' | 'sleep' | 'tobacco' | 'labs' | 'generic';

/** Order matters: earlier routes win ("carbs for a lift day" → carbs, not train). */
const ROUTES: Array<[OfflineRoute, RegExp]> = [
  ['labs', /vitamin|\bvit[-\s]?d\b|ferritin|omega|\biron\b|\bzinc\b|testosterone|\blead\s+(level|result|exposure)|\b(elevated|blood)\s+lead\b|\blabs?\b|blood\s*(work|test)|supplement|fish\s+oil|\bdos(e|ing|age)\b|retest/i],
  ['tobacco', /tobacco|smok|cigarette|nicotine|\bvap(e|ing)\b|\bquit/i],
  ['carbs', /\bcarb|\brice\b|\broti\b|\bnaan\b|\bfuel|glycogen|\bbread\b/i],
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

function hrvSentence(ctx: CoachContext): string {
  const h = ctx.hrv;
  if (!has(h.today)) return "I don't have HRV for today.";
  let s = `HRV ${r0(h.today)} ms`;
  if (has(h.baseline7)) {
    const d = h.today - h.baseline7;
    s += ` is ${r0(Math.abs(d))} ms ${d < 0 ? 'below' : 'above'} your ${r0(h.baseline7)} ms baseline`;
  }
  if (has(h.swcLower) && has(h.swcUpper)) s += ` (normal range ${r0(h.swcLower)}–${r0(h.swcUpper)} ms)`;
  return `${s}, band ${h.band}.`;
}

function sleepSentence(ctx: CoachContext): string {
  const s = ctx.sleep;
  if (!has(s.hours)) return "I don't have last night's sleep hours.";
  let out = `Sleep ${r1(s.hours)} h`;
  if (has(s.need)) out += ` vs ${r1(s.need)} h need`;
  if (has(s.debtMin) && s.debtMin > 0) out += `, ${r0(s.debtMin)} min debt`;
  return `${out}.`;
}

function train(ctx: CoachContext, profile: Profile, targets: Targets): Parts {
  const r = ctx.readiness;
  const session = ctx.dayType === 'lift' ? ctx.sessionType : null;
  const lead =
    r.score === null
      ? "I don't have a readiness score for today — no WHOOP recovery or HRV logged yet."
      : `Readiness ${r0(r.score)}% (${r.band}) from ${r.source === 'whoop' ? 'WHOOP recovery' : 'your HRV baseline'} — verdict: ${r.training}.`;
  const details = [hrvSentence(ctx), sleepSentence(ctx), session ? `Today is a ${session} day on your split.` : 'Today is a rest day on your split.'];

  let action: string;
  if (!session) {
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
  if (n.lateEating && pLeft > 0) action += ` — and make it the last meal before your ${profile.bedTarget} bedtime`;
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
  if (r.band === 'red') action = `Keep today light — mobility or a 20–30 min walk — and be in bed by ${profile.bedTarget}`;
  else if (r.band === 'yellow') action = `Train but hold loads today, and protect tonight: in bed by ${profile.bedTarget}, no caffeine after ${profile.caffeineCutoff}`;
  else if (r.band === 'green') action = `You're primed — progress your loads and keep the same ${profile.bedTarget} bedtime tonight`;
  else action = `Log or import today's WHOOP recovery and HRV so I can pin down the cause; until then, train moderate and hold your loads`;
  return { lead, details, action };
}

function weight(ctx: CoachContext, profile: Profile, targets: Targets): Parts {
  const w = ctx.weight;
  const e = ctx.expenditure;
  const [lo, hi] = w.targetLbPerWk;
  const details: string[] = [];
  let lead: string;
  if (!has(w.trend)) {
    lead = `I don't have a weight trend for you yet — ${plural(w.weighInsThisWeek, 'weigh-in')} this week${has(w.latest) ? `, latest ${r1(w.latest)} lb` : ''}.`;
  } else if (!has(w.weeklyRateLb)) {
    lead = `Trend weight is ${r1(w.trend)} lb${has(w.latest) ? ` (scale ${r1(w.latest)} lb)` : ''}, but I need 8+ days of weigh-ins for a weekly rate.`;
  } else {
    const bandWord = w.inBand === 'in' ? 'on target' : w.inBand === 'below' ? 'slower than target' : w.inBand === 'above' ? 'faster than target' : 'not yet rated';
    lead = `Trend ${r1(w.trend)} lb, ${fmtSigned(w.weeklyRateLb, 2)} lb/wk (${fmtSigned(w.weeklyRatePct, 2)}%/wk) against your ${lo}–${hi} lb/wk loss target — ${bandWord}.`;
    if (has(w.latest)) details.push(`Today's scale ${r1(w.latest)} lb vs trend ${r1(w.trend)} lb — trust the trend, not the dot.`);
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
  const fatLoss = profile.goalPhase === 'fat-loss';
  if (w.inBand === null || !fatLoss) {
    action = `Weigh in every morning this week so your trend and expenditure can calibrate, and hold ${targets.kcal} kcal`;
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
        : `Add 100–150 kcal of carbs on lift days — you're losing faster than the ${hi} lb/wk ceiling`;
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
    if (has(ctx.hrv.today)) parts.push(`HRV ${r0(ctx.hrv.today)} ms${has(ctx.hrv.delta.delta) ? ` (${fmtSigned(ctx.hrv.delta.delta, 0)} vs baseline)` : ''}`);
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
  if (has(t.hrvSmokeFree) && has(t.hrvSmoking)) {
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
  if (has(ctx.weight.trend)) details.push(`Trend weight ${r1(ctx.weight.trend)} lb${has(ctx.weight.weeklyRateLb) ? `, ${fmtSigned(ctx.weight.weeklyRateLb, 2)} lb/wk` : ''}.`);
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

/** Rule-based answer for the offline coach; always ≤120 words and ends with one **bold** action. */
export function answerOffline(question: string, ctx: CoachContext, profile: Profile, targets: Targets, tone: CoachTone): string {
  return compose(HANDLERS[routeQuestion(question)](ctx, profile, targets, question), tone);
}
