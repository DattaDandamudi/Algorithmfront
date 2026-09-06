import { describe, expect, it } from 'vitest';
import type { CoachContext, CoachTone } from '../data/types';
import { DEFAULT_PROFILE, DEFAULT_TARGETS } from '../data/defaults';
import { COACH_CHIPS } from '../engine/insights';
import { CHIPS, emptyContext, fullContext } from './coachContext.fixture';
import { EMERGENCY_MESSAGE, MAX_WORDS, ensureBoldAction, wordCount } from './guardrails';
import { answerOffline, nextSession, routeQuestion, type OfflineRoute } from './offlineCoach';

const EXPECTED_ROUTES: OfflineRoute[] = ['train', 'eat', 'recovery', 'weight', 'carbs', 'sleep', 'tobacco', 'labs'];
const TONES: CoachTone[] = ['conversational', 'direct'];

const ask = (q: string, ctx = fullContext(), tone: CoachTone = 'conversational') => answerOffline(q, ctx, DEFAULT_PROFILE, DEFAULT_TARGETS, tone);

describe('routeQuestion', () => {
  it('maps each chip to its handler', () => {
    expect(CHIPS.map((c) => routeQuestion(c))).toEqual(EXPECTED_ROUTES);
  });

  it('routes free-text variants', () => {
    expect(routeQuestion('how much rice can I have with dinner')).toBe('carbs');
    expect(routeQuestion('is my HRV ok?')).toBe('recovery');
    expect(routeQuestion('I slept badly, what now')).toBe('sleep');
    expect(routeQuestion('am I losing fat fast enough')).toBe('weight');
    expect(routeQuestion('best protein option at a shawarma place')).toBe('eat');
    expect(routeQuestion('should I deadlift heavy')).toBe('train');
    expect(routeQuestion('I smoked 4 today')).toBe('tobacco');
    expect(routeQuestion('is my iron low')).toBe('labs');
    expect(routeQuestion('hello there')).toBe('generic');
    expect(routeQuestion('')).toBe('generic');
  });
});

describe('answerOffline — output contract for all 8 chips', () => {
  const contexts = { full: fullContext(), empty: emptyContext() };

  for (const [name, ctx] of Object.entries(contexts)) {
    for (const tone of TONES) {
      it.each([...CHIPS, 'hello there'])(`[${name}/${tone}] "%s" is ≤120 words, ends with one bold action, no missing-value leaks`, (q) => {
        const out = ask(q, ctx, tone);
        expect(wordCount(out)).toBeLessThanOrEqual(MAX_WORDS);
        expect(out).toMatch(/\*\*[^*]+\.\*\*$/);
        expect(out.split('**').length - 1).toBe(2);
        expect(ensureBoldAction(out)).toBe(out);
        expect(out).not.toMatch(/\b(null|undefined|NaN)\b/);
        expect(out).toMatch(/\byou\b|\byour\b|\byou're\b/i);
      });
    }
  }

  it('direct tone is never longer than conversational', () => {
    for (const q of CHIPS) {
      expect(wordCount(ask(q, fullContext(), 'direct'))).toBeLessThanOrEqual(wordCount(ask(q, fullContext(), 'conversational')));
    }
  });
});

describe('answerOffline — cites the actual numbers (full context)', () => {
  it('train: readiness, HRV vs baseline and range, split day', () => {
    const out = ask(CHIPS[0]);
    expect(out).toContain('Readiness 71% (green)');
    expect(out).toContain('HRV 54 ms is 2 ms above your 52 ms 7-day average (normal range 48–56 ms)');
    expect(out).toContain('Sleep 7.4 h vs 7.9 h need, 30 min debt');
    expect(out).toContain('lower day');
    expect(out).toMatch(/\*\*Progress your lower loads today/);
  });

  it('eat: all meal slots used but protein short → small top-up before bed', () => {
    const ctx = fullContext();
    ctx.nutrition = { ...ctx.nutrition, mealsLogged: 4, mealsLeft: 0, remaining: { ...ctx.nutrition.remaining, p: 25 }, proteinPerMealNeeded: null };
    const out = ask(CHIPS[1], ctx);
    expect(out).toMatch(/\*\*Add a protein-only top-up of ~25 g \(Greek yogurt, eggs or paneer\) — small, and before 23:00\.\*\*$/);
  });

  it('eat: protein so far/remaining, meals left, per-meal need, carb range, fat floor', () => {
    const out = ask(CHIPS[1]);
    expect(out).toContain("You're at 98 g protein of 180 g with 2 meals left — 82 g to go, 820 kcal remaining.");
    expect(out).toContain('~41 g protein per remaining meal');
    expect(out).toContain('Carbs 95 g so far against today\'s 150–175 g lift-day range');
    expect(out).toContain('Fat 38 g (floor 60 g)');
    expect(out).toMatch(/\*\*Lead your next meal with ~41 g protein: 200 g chicken tikka \(~50 g\)/);
  });

  it('recovery: says when recovery is not actually low and cites HRV/RHR/sleep/tobacco', () => {
    const out = ask(CHIPS[2]);
    expect(out).toContain("Recovery isn't low today — readiness 71% (green).");
    expect(out).toContain('HRV 54 ms');
    expect(out).toContain('RHR 52 bpm (−2 vs your 54 baseline)');
    expect(out).toContain('Tobacco: 2 today; your HRV averages 56 ms smoke-free vs 50 ms after smoking');
    expect(out).toMatch(/\*\*You're primed/);
  });

  it('weight: trend, rate, target band, expenditure, hold action', () => {
    const out = ask(CHIPS[3]);
    expect(out).toContain('Trend 171.9 lb, −1.10 lb/wk (−0.64%/wk) against your 0.86–1.72 lb/wk loss target — on target.');
    expect(out).toContain("Today's scale 171.8 lb vs trend 171.9 lb");
    expect(out).toContain('Estimated expenditure 2480 kcal; you\'re targeting 1950 kcal.');
    expect(out).toMatch(/\*\*Hold 1950 kcal/);
  });

  it('weight: recommends a cut only when the rate is slow and expenditure is calibrated', () => {
    const ctx = fullContext();
    ctx.weight = { ...ctx.weight, weeklyRateLb: -0.3, weeklyRatePct: -0.17, inBand: 'below' };
    ctx.expenditure = { tdee: 2300, valid: true, reason: 'ok', suggestedKcal: 1800, suggestedDelta: -150 };
    const out = ask(CHIPS[3], ctx);
    expect(out).toContain('slower than target');
    expect(out).toMatch(/\*\*Drop to ~1800 kcal from tomorrow \(−150\), keeping protein at 180 g and fat ≥60 g\.\*\*$/);

    ctx.expenditure = { tdee: null, valid: false, reason: 'Need 5+ weigh-ins this week', suggestedKcal: null, suggestedDelta: null };
    const hold = ask(CHIPS[3], ctx);
    expect(hold).toContain("Expenditure isn't calibrated yet (Need 5+ weigh-ins this week)");
    expect(hold).toMatch(/\*\*Hold 1950 kcal one more week/);
  });

  it('weight: too-fast loss adds calories and never touches the fat floor', () => {
    const ctx = fullContext();
    ctx.weight = { ...ctx.weight, weeklyRateLb: -2.2, weeklyRatePct: -1.28, inBand: 'above' };
    ctx.expenditure = { tdee: 2700, valid: true, reason: 'ok', suggestedKcal: 2100, suggestedDelta: 150 };
    const out = ask(CHIPS[3], ctx);
    expect(out).toContain('faster than target');
    expect(out).toMatch(/\*\*Add ~150 kcal \(to 2100\), mostly carbs on lift days, to protect muscle\.\*\*$/);
  });

  it('carbs: lift-day range, carbs so far/remaining, roti/rice equivalents', () => {
    const out = ask(CHIPS[4]);
    expect(out).toContain('Today is a lower day, so carbs sit at 150–175 g');
    expect(out).toContain("You've had 95 g so far, 65 g to go.");
    expect(out).toContain('Protein still comes first: 82 g left of 180 g.');
    expect(out).toMatch(/\*\*Put ~39 g carbs around your session — 2 rotis or 140 g rice with your protein/);
  });

  it('carbs: on a rest day points to the next lift day', () => {
    const ctx = fullContext();
    ctx.today = '2026-09-06'; // Sunday → rest; next session Monday 'upper'
    ctx.dayType = 'rest';
    ctx.sessionType = 'rest';
    ctx.nutrition.targets.carbsRange = [70, 100];
    const out = ask(CHIPS[4], ctx);
    expect(out).toContain('Today is a rest day (70–100 g carbs); your next upper day opens up 150–175 g.');
    expect(out).toMatch(/\*\*Keep carbs to 70–100 g today/);
  });

  it('sleep: hours vs need, debt, bedtime vs target, readiness link', () => {
    const out = ask(CHIPS[5]);
    expect(out).toContain('You slept 7.4 h against a 7.9 h need — 30 min of debt.');
    expect(out).toContain('This morning: readiness 71% (green), HRV 54 ms (+2 vs 30-day avg).');
    expect(out).toContain('Bed at 23:10 vs your 23:00 target; bedtime has swung 38 min this week.');
    expect(out).toMatch(/\*\*Be in bed by 23:00 tonight/);
  });

  it('tobacco: count vs average and the user\'s own HRV difference', () => {
    const out = ask(CHIPS[6]);
    expect(out).toContain("You're at 2 today vs a 3.1/day 7-day average.");
    expect(out).toContain('On smoke-free days your HRV averages 56 ms vs 50 ms after smoking — 6 ms of recovery you keep by skipping.');
    expect(out).toMatch(/\*\*Cap today at 2/);
  });

  it('labs: lifestyle only, lead escalates to a physician, doctor cue, no dosing', () => {
    const out = ask(CHIPS[7]);
    expect(out).toContain("I don't interpret labs or set doses.");
    expect(out).toContain('Lead 4.3 µg/dL (elevated) needs physician follow-up');
    expect(out).toContain('cooking more at home (40% this week)');
    expect(out).toContain('Vitamin D 19 ng/mL (low)');
    expect(out).toContain('Ferritin 23 ng/mL (low): red meat 3× this week');
    expect(out).toContain('Omega-3 index 3% (low): fish 1× this week');
    expect(out).toMatch(/\*\*Book the retest and confirm any supplement dosing with your doctor\.\*\*$/);
    expect(out).not.toMatch(/\d+\s?(IU|mg|mcg)\b/);
  });

  it('labs: focuses on the marker that was asked about', () => {
    const out = ask('Is my ferritin ok?');
    expect(out).toContain('Ferritin 23 ng/mL (low)');
    expect(out).not.toContain('Vitamin D');
    expect(out).toContain('Lead 4.3'); // the escalation is never dropped
  });

  it('generic: readiness, protein remaining, top action', () => {
    const out = ask('hello there');
    expect(out).toContain('Readiness 71% (green) — verdict: Progress.');
    expect(out).toContain('Protein 98 g of 180 g — 82 g left over 2 meals; 820 kcal remaining.');
    expect(out).toMatch(/\*\*Lead your next meal with ~41 g protein\.\*\*$/);
  });
});

describe('answerOffline — says plainly when data is missing (empty context)', () => {
  const ctx = emptyContext();

  it('train', () => {
    const out = ask(CHIPS[0], ctx);
    expect(out).toContain("I don't have a readiness score for today");
    expect(out).toContain("I don't have HRV for today.");
    expect(out).toMatch(/\*\*Keep it a rest day: walk toward 8,000 steps and save the progression for your next upper session\.\*\*$/);
  });

  it('eat', () => {
    const out = ask(CHIPS[1], ctx);
    expect(out).toContain('Nothing logged yet today: 180 g protein and 1950 kcal to place across 4 meals.');
    expect(out).toContain('~45 g protein per remaining meal');
  });

  it('recovery', () => {
    const out = ask(CHIPS[2], ctx);
    expect(out).toContain("I don't have a readiness score for you today");
    expect(out).toContain("I don't have HRV for today.");
    expect(out).toContain("I don't have last night's sleep hours.");
    expect(out).toMatch(/\*\*Log or import today's WHOOP recovery and HRV/);
  });

  it('weight', () => {
    const out = ask(CHIPS[3], ctx);
    expect(out).toContain("I don't have a weight trend for you yet — 0 weigh-ins this week.");
    expect(out).toContain("Expenditure isn't calibrated yet (Need 5+ weigh-ins this week).");
    expect(out).toMatch(/\*\*Weigh in every morning this week/);
  });

  it('carbs', () => {
    const out = ask(CHIPS[4], ctx);
    expect(out).toContain('Today is a rest day (70–100 g carbs); your next upper day opens up 150–175 g.');
    expect(out).toContain("You've had 0 g so far, 100 g to go.");
  });

  it('sleep', () => {
    const out = ask(CHIPS[5], ctx);
    expect(out).toContain("I don't have your sleep hours from last night.");
    expect(out).toMatch(/\*\*Be in bed by 23:00 tonight/);
  });

  it('tobacco', () => {
    const out = ask(CHIPS[6], ctx);
    expect(out).toContain("You're at 0 today.");
    expect(out).toContain("I don't have enough smoke-free vs smoking days yet");
    expect(out).toMatch(/\*\*Keep today at zero/);
  });

  it('labs', () => {
    const out = ask(CHIPS[7], ctx);
    expect(out).toContain("I don't have any bloodwork on file — add it in Settings.");
    expect(out).toMatch(/doctor\.\*\*$/);
  });

  it('generic', () => {
    const out = ask('hello there', ctx);
    expect(out).toContain('No readiness score yet today');
    expect(out).toContain('Protein 0 g of 180 g — 180 g left over 4 meals; 1950 kcal remaining.');
  });
});

describe('nextSession', () => {
  it('finds the next non-rest day on the split', () => {
    expect(nextSession(DEFAULT_PROFILE.split, '2026-09-04')).toBe('upper'); // Fri → Mon
    expect(nextSession(DEFAULT_PROFILE.split, '2026-08-31')).toBe('lower'); // Mon → Tue
    expect(nextSession({ 0: 'rest', 1: 'rest', 2: 'rest', 3: 'rest', 4: 'rest', 5: 'rest', 6: 'rest' }, '2026-09-04')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Review round 5 reproductions
// ---------------------------------------------------------------------------

describe('R5-6 answerOffline — symptom asks never get a progression action', () => {
  const symptomAsks = [
    'I feel dizzy after training',
    'my knee hurts, should I squat today?',
    'palpitations after coffee, should I still do cardio?',
    'headache all day — eat more carbs?',
    'I feel nauseous, is my weight trend ok?',
    'is my iron low? I feel light-headed on the stairs',
  ];
  for (const [name, ctx] of Object.entries({ full: fullContext(), empty: emptyContext() })) {
    for (const tone of TONES) {
      it.each(symptomAsks)(`[${name}/${tone}] "%s" → hold or skip training + clinician cue`, (q) => {
        const out = ask(q, ctx, tone);
        expect(out).toMatch(/\*\*Hold or skip training today[^*]*clinician[^*]*\.\*\*$/);
        expect(out).not.toMatch(/\*\*[^*]*progress/i);
        expect(out).not.toMatch(/verdict: Progress/);
        expect(out).toMatch(/doctor|clinician/);
        expect(out.split('**').length - 1).toBe(2);
        expect(wordCount(out)).toBeLessThanOrEqual(MAX_WORDS);
      });
    }
  }

  it('still cites the numbers behind the hold', () => {
    const out = ask('I feel dizzy after training');
    expect(out).toContain('HRV 54 ms');
  });

  it('a non-symptom training ask keeps the normal progression action', () => {
    expect(ask(CHIPS[0])).toMatch(/\*\*Progress your lower loads today/);
  });

  it('backstop: an emergency phrase returns the emergency message, never coaching', () => {
    expect(ask("I think I'm having a heart attack, should I still train?")).toBe(EMERGENCY_MESSAGE);
  });
});

describe('R5-9 routeQuestion — supplement dosing goes to the lifestyle-only labs handler', () => {
  it.each(['take 5 g creatine daily?', 'should I take creatine', 'how much melatonin for sleep', 'ZMA before bed?'])('"%s" → labs', (q) => {
    expect(routeQuestion(q)).toBe('labs');
    expect(ask(q)).toMatch(/doctor\.\*\*$/);
  });
});

describe('R5-15 weight handler — rates the loss band only in a fat-loss phase', () => {
  it('muscle-gain: no loss-target framing; a falling trend asks for more food', () => {
    const out = answerOffline(CHIPS[3], fullContext(), { ...DEFAULT_PROFILE, goalPhase: 'muscle-gain' }, DEFAULT_TARGETS, 'conversational');
    expect(out).toContain('Trend 171.9 lb, −1.10 lb/wk (−0.64%/wk)');
    expect(out).toContain("you're in a muscle-gain phase");
    expect(out).not.toContain('loss target');
    expect(out).not.toContain('on target');
    expect(out).toMatch(/\*\*Add 100–150 kcal of carbs on lift days/);
  });

  it('muscle-gain: a rising trend is held', () => {
    const ctx = fullContext();
    ctx.weight = { ...ctx.weight, weeklyRateLb: 0.4, weeklyRatePct: 0.23, inBand: 'below' };
    const out = answerOffline(CHIPS[3], ctx, { ...DEFAULT_PROFILE, goalPhase: 'muscle-gain' }, DEFAULT_TARGETS, 'conversational');
    expect(out).toContain('+0.40 lb/wk');
    expect(out).not.toContain('slower than target');
    expect(out).toMatch(/\*\*Hold 1950 kcal and weigh in daily — the trend is drifting up as planned/);
  });

  it('maintenance: flat-trend framing, no band rating', () => {
    const out = answerOffline(CHIPS[3], fullContext(), { ...DEFAULT_PROFILE, goalPhase: 'maintenance' }, DEFAULT_TARGETS, 'direct');
    expect(out).toContain("you're in maintenance");
    expect(out).not.toContain('loss target');
    expect(out).not.toContain('on target');
    expect(out).toMatch(/\*\*Hold 1950 kcal and weigh in daily; if the trend keeps moving one way for two weeks, adjust by 100–200 kcal\.\*\*$/);
  });

  it('fat-loss keeps the band rating', () => {
    expect(ask(CHIPS[3])).toContain('against your 0.86–1.72 lb/wk loss target — on target.');
  });
});

// ---------------------------------------------------------------------------
// Review round 7 reproductions
// ---------------------------------------------------------------------------

describe('R7-8 offline coach — "baseline" is the 28-day reference the SWC is centred on', () => {
  const withRef = () => {
    const ctx = fullContext();
    ctx.hrv = { ...ctx.hrv, baseline28: 53, baselineEstablished: true, daysOfData: 30 };
    return ctx;
  };

  it('train/recovery cite today vs the 28-day reference, not the 7-day or 30-day means', () => {
    expect(ask(CHIPS[0], withRef())).toContain('HRV 54 ms is 1 ms above your 53 ms baseline (normal range 48–56 ms)');
    expect(ask(CHIPS[2], withRef())).toContain('HRV 54 ms is 1 ms above your 53 ms baseline');
  });

  it('sleep cites the same reference and labels it', () => {
    expect(ask(CHIPS[5], withRef())).toContain('HRV 54 ms (+1 vs 28-day baseline)');
  });

  it('without a 28-day reference the fallback figures are labelled by their window, never "baseline"', () => {
    for (const q of [CHIPS[0], CHIPS[2], CHIPS[5]]) {
      const out = ask(q);
      expect(out).not.toMatch(/\d+ ms baseline/);
      expect(out).not.toMatch(/vs baseline/);
    }
  });
});

describe('R7-9 offline coach — weights and rates follow profile.units', () => {
  const KG = { ...DEFAULT_PROFILE, units: 'kg' as const };
  const askKg = (q: string, ctx = fullContext()) => answerOffline(q, ctx, KG, DEFAULT_TARGETS, 'conversational');

  it('weight chip: trend, rate, band and scale in kg with no lb figure', () => {
    const out = askKg(CHIPS[3]);
    expect(out).toContain('Trend 78.0 kg, −0.50 kg/wk (−0.64%/wk) against your 0.39–0.78 kg/wk loss target — on target.');
    expect(out).toContain("Today's scale 77.9 kg vs trend 78.0 kg");
    expect(out).not.toMatch(/\blb\b/);
  });

  it('generic and no-rate leads use kg too', () => {
    expect(askKg('hello there')).toContain('Trend weight 78.0 kg, −0.50 kg/wk.');
    const ctx = fullContext();
    ctx.weight = { ...ctx.weight, trend: null, weeklyRateLb: null, weeklyRatePct: null, inBand: null };
    expect(askKg(CHIPS[3], ctx)).toContain('latest 77.9 kg');
    ctx.weight = { ...ctx.weight, trend: 171.9, weeklyRateLb: null };
    expect(askKg(CHIPS[3], ctx)).toContain('Trend weight is 78.0 kg (scale 77.9 kg)');
  });

  it('the too-fast ceiling is quoted in kg/wk', () => {
    const ctx = fullContext();
    ctx.weight = { ...ctx.weight, weeklyRateLb: -2.2, weeklyRatePct: -1.28, inBand: 'above' };
    ctx.expenditure = { tdee: null, valid: false, reason: 'Need 5+ weigh-ins this week', suggestedKcal: null, suggestedDelta: null };
    expect(askKg(CHIPS[3], ctx)).toMatch(/faster than the 0\.78 kg\/wk ceiling/);
    expect(ask(CHIPS[3], ctx)).toMatch(/faster than the 1\.72 lb\/wk ceiling/);
  });

  it('lb output is unchanged', () => {
    expect(ask(CHIPS[3])).toContain('Trend 171.9 lb, −1.10 lb/wk (−0.64%/wk) against your 0.86–1.72 lb/wk loss target — on target.');
  });
});

// ---------------------------------------------------------------------------
// Phase 2d — the four v3 routes (lift / overtraining / stress / energy)
// ---------------------------------------------------------------------------

/** COACH_CHIPS 8–11, the chips these routes answer. */
const V3_CHIPS = COACH_CHIPS.slice(8);
const [LIFT_CHIP, OVERTRAINING_CHIP, STRESS_CHIP, ENERGY_CHIP] = V3_CHIPS;

/** A context whose four v3 blocks are absent entirely (not merely empty). */
function noBlocks(): CoachContext {
  const ctx = fullContext();
  delete ctx.training;
  delete ctx.stress;
  delete ctx.energy;
  delete ctx.impact;
  delete ctx.changepoints;
  return ctx;
}

describe('2d routeQuestion — the v3 chips take the v3 handlers', () => {
  it('maps chips 8–11 in order', () => {
    expect(V3_CHIPS).toEqual(['What should I lift today?', 'Am I overtraining?', 'Why am I so stressed?', 'When will I have energy today?']);
    expect(V3_CHIPS.map(routeQuestion)).toEqual(['lift', 'overtraining', 'stress', 'energy']);
  });

  it('still maps the original eight chips to their own handlers', () => {
    expect(CHIPS.map((c) => routeQuestion(c))).toEqual(EXPECTED_ROUTES);
  });

  it('routes the contextual prompts the tiles offer', () => {
    expect(routeQuestion('Should I deload this week?')).toBe('overtraining');
    expect(routeQuestion('Why has this lift stalled?')).toBe('lift');
    expect(routeQuestion('Which muscles need more volume?')).toBe('lift');
    expect(routeQuestion('Which overnight signals are off?')).toBe('stress');
    expect(routeQuestion('Am I getting sick or just tired?')).toBe('stress');
    expect(routeQuestion('What do I do about three bad days?')).toBe('stress');
    expect(routeQuestion('How do I get my stress down today?')).toBe('stress');
  });

  it('routes free-text variants', () => {
    expect(routeQuestion('what exercises are on today')).toBe('lift');
    expect(routeQuestion('am I overreaching?')).toBe('overtraining');
    expect(routeQuestion('is my training load too much')).toBe('overtraining');
    expect(routeQuestion('feeling anxious and wound up')).toBe('stress');
    expect(routeQuestion('when does my afternoon slump hit')).toBe('energy');
  });

  it('does not steal the more specific routes that come first', () => {
    // carbs wins over lift, labs wins over energy, tobacco keeps its own chip
    expect(routeQuestion('Plan my carbs for a lift day.')).toBe('carbs');
    expect(routeQuestion('should I deadlift heavy')).toBe('train');
    expect(routeQuestion('Should I train today?')).toBe('train');
    expect(routeQuestion('is my energy expenditure right')).toBe('weight');
    expect(routeQuestion('caffeine pills for energy?')).toBe('labs');
  });
});

describe('2d answerOffline — output contract for the v3 chips', () => {
  const contexts = { full: fullContext(), empty: emptyContext(), noBlocks: noBlocks() };
  for (const [name, ctx] of Object.entries(contexts)) {
    for (const tone of TONES) {
      it.each(V3_CHIPS)(`[${name}/${tone}] "%s" is ≤120 words, ends with one bold action, no missing-value leaks`, (q) => {
        const out = ask(q, ctx, tone);
        expect(wordCount(out)).toBeLessThanOrEqual(MAX_WORDS);
        expect(out).toMatch(/\*\*[^*]+\.\*\*$/);
        expect(out.split('**').length - 1).toBe(2);
        expect(ensureBoldAction(out)).toBe(out);
        expect(out).not.toMatch(/\b(null|undefined|NaN)\b/);
        // No half-sentence: never an empty parenthesis, a dangling unit or a stray "of ." fragment.
        expect(out).not.toMatch(/\(\s*\)|\s—\s*\.|\bof\s+\.|\s{2,}/);
        expect(out).toMatch(/\byou\b|\byour\b|\byou're\b/i);
      });
    }
  }

  it('direct tone is never longer than conversational', () => {
    for (const q of V3_CHIPS) {
      expect(wordCount(ask(q, fullContext(), 'direct'))).toBeLessThanOrEqual(wordCount(ask(q, fullContext(), 'conversational')));
    }
  });
});

describe('2d lift — cites the planned session from ctx.training', () => {
  it('names the exercises, sets, reps and load, and opens with the first one', () => {
    const out = ask(LIFT_CHIP);
    expect(out).toContain('Today is your lower day — 3 exercises planned.');
    expect(out).toContain('Back squat 4×5–8 at 226 lb — progress.');
    expect(out).toContain('Romanian deadlift 3×6–10 at 198 lb — hold.');
    expect(out).toContain('Readiness 71% (green) — verdict: Progress.');
    expect(out).toMatch(/\*\*Open with Back squat 4×5–8 at 226 lb and take the top set to RPE 8\.\*\*$/);
  });

  it('names the least-recovered muscle and the week\'s PR', () => {
    const out = ask(LIFT_CHIP);
    expect(out).toContain('Your least-recovered muscle is front-delts at 74%, 18 h since you trained it.');
    expect(out).toContain('PR this week: Back squat e1RM 268 lb.');
  });

  it('holds the load rather than progressing when readiness is not green', () => {
    const ctx = fullContext();
    ctx.readiness = { ...ctx.readiness, score: 48, band: 'yellow', verdict: 'Hold loads', training: 'Train, hold loads' };
    expect(ask(LIFT_CHIP, ctx)).toMatch(/\*\*Open with Back squat 4×5–8 at 226 lb and hold that load — no PR attempts today\.\*\*$/);
  });

  it('swaps the session on a red day and deloads when the engine asks for one', () => {
    const red = fullContext();
    red.readiness = { ...red.readiness, score: 28, band: 'red', verdict: 'Rest', training: 'Rest' };
    expect(ask(LIFT_CHIP, red)).toMatch(/\*\*Swap the lower session for mobility or a 20–30 min walk and be in bed by 23:00\.\*\*$/);

    const deload = fullContext();
    deload.training = { ...deload.training!, deload: { recommended: true, reasons: ['acute load up 34% for two weeks'] } };
    expect(ask(LIFT_CHIP, deload)).toMatch(/\*\*Run the lower session as a deload — same loads, about two-thirds of the sets \(acute load up 34% for two weeks\)\.\*\*$/);
  });

  it('reports a plateau with its own numbers', () => {
    const ctx = fullContext();
    ctx.training = { ...ctx.training!, plateaus: [{ exerciseId: 'bench-press', name: 'Bench press', sessions: 5, gainPct: -0.4, rpeTrend: 0.3 }] };
    expect(ask(LIFT_CHIP, ctx)).toContain("Bench press hasn't moved in 5 sessions (−0.4%).");
  });

  it('quotes loads in kg for a kg profile', () => {
    const out = answerOffline(LIFT_CHIP, fullContext(), { ...DEFAULT_PROFILE, units: 'kg' }, DEFAULT_TARGETS, 'conversational');
    expect(out).toContain('Back squat 4×5–8 at 102.5 kg');
    expect(out).not.toMatch(/\blb\b/);
  });

  it('empty context: no plan, no invented exercises, points at the split', () => {
    const out = ask(LIFT_CHIP, emptyContext());
    expect(out).toBe(
      'Today is a rest day on your split; your next session is upper. **Keep it a rest day: walk toward 8,000 steps and save the progression for your next upper session.**',
    );
  });

  it('no training block at all: falls back to the split and asks for a log', () => {
    const out = ask(LIFT_CHIP, noBlocks());
    expect(out).toContain("Today is your lower day, but I have no planned session for it");
    expect(out).toMatch(/\*\*Log today's lower session in Train/);
    expect(out).not.toMatch(/exercises planned|least-recovered|PR this week/);
  });
});

describe('2d overtraining — cites load, ACWR and the check-in', () => {
  it('leads on absolute load and week-on-week change, with ACWR described only', () => {
    const out = ask(OVERTRAINING_CHIP);
    expect(out).toContain('Your 7-day load is 342 units against a 28-day base of 318, +6% week-on-week.');
    expect(out).toContain('ACWR 1.08 (sweet) — descriptive only, not a causal injury predictor.');
    expect(out).toContain('Form +13 (fresh), monotony 1.4.');
    expect(out).toContain('Check-in total 12 of 28 (green) across 26 days.');
    expect(out).toMatch(/\*\*Keep next week within about 10% of 342 load units and progress loads, not volume\.\*\*$/);
  });

  it('slows a ramp down instead of adding to it', () => {
    const ctx = fullContext();
    ctx.training = { ...ctx.training!, load: { ...ctx.training!.load, weekOverWeekPct: 34 } };
    const out = ask(OVERTRAINING_CHIP, ctx);
    expect(out).toContain('+34% week-on-week');
    expect(out).toMatch(/\*\*Hold this week near 342 load units instead of adding — the \+34% jump is the part to slow down\.\*\*$/);
  });

  it('three worse-than-normal check-ins in a row is the back-off cue', () => {
    const ctx = fullContext();
    ctx.stress = { ...ctx.stress!, checkIn: { ...ctx.stress!.checkIn, worseRun: 3, total: 20, band: 'yellow' } };
    const out = ask(OVERTRAINING_CHIP, ctx);
    expect(out).toContain('Your check-in has been worse than normal 3 days running — that is the back-off cue.');
    expect(out).toMatch(/\*\*Take two easy days and be in bed by 23:00 — 3 days of worse-than-normal check-ins is the cue to back off\.\*\*$/);
  });

  it('a recommended deload wins over everything else', () => {
    const ctx = fullContext();
    ctx.training = { ...ctx.training!, deload: { recommended: true, reasons: ['form −18 for 6 days', 'HRV below its range twice'] } };
    const out = ask(OVERTRAINING_CHIP, ctx);
    expect(out).toContain('Deload flags: form −18 for 6 days; HRV below its range twice.');
    expect(out).toMatch(/\*\*Run a deload week/);
  });

  it('empty context: says there is no load rather than reporting zeros', () => {
    const out = ask(OVERTRAINING_CHIP, emptyContext());
    expect(out).toContain("I don't have training load for you — no sessions logged and no WHOOP strain to read.");
    expect(out).not.toMatch(/ACWR|Form |monotony|Resilience/);
    expect(out).toMatch(/\*\*Log your sessions \(or import WHOOP workouts\) for a fortnight/);
  });

  it('no training block at all: the same honest empty answer', () => {
    const out = ask(OVERTRAINING_CHIP, noBlocks());
    expect(out).toContain("I don't have training load for you");
    expect(out).toContain('HRV 54 ms'); // the numbers it does have are still cited
  });
});

describe('2d stress — signals, check-in and resilience, as patterns not causes', () => {
  it('leads on the count of deviating signals and names them', () => {
    const out = ask(STRESS_CHIP);
    expect(out).toContain('1 of 5 overnight signals is outside your own range: breathing rate 14.9 (+1.4 SD).');
    expect(out).toContain('Overnight strain index 28 of 100 (19–37 interval), band none.');
    expect(out).toContain('You rated stress 2 of 7 and fatigue 3 of 7 this morning.');
    expect(out).toContain('Resilience 62 (solid), load-vs-recovery balance +0.19.');
  });

  it('protects the night when several signals deviate', () => {
    const ctx = fullContext();
    ctx.stress = {
      ...ctx.stress!,
      signalsDeviating: 3,
      band: 'major',
      outliers: ctx.stress!.outliers.map((o) => (o.key === 'hrv' || o.key === 'rhr' || o.key === 'rr' ? { ...o, deviating: true } : o)),
    };
    const out = ask(STRESS_CHIP, ctx);
    expect(out).toContain('3 of 5 overnight signals are outside your own range: hrv 54 (−0.4 SD) and resting hr 52 (−0.6 SD).');
    expect(out).toMatch(/\*\*Protect tonight: in bed by 23:00, nothing caffeinated after 14:00, and keep training easy\.\*\*$/);
  });

  it('empty context: no signals, no check-in, asks for the one that needs no wearable', () => {
    const out = ask(STRESS_CHIP, emptyContext());
    expect(out).toContain("I don't have overnight signals or a check-in from you yet");
    expect(out).toContain("I'm still learning your normal — 0 nights of reference so far.");
    expect(out).not.toMatch(/strain index|Resilience|association/);
    expect(out).toMatch(/\*\*Fill in today's check-in in Log/);
  });

  it('no stress block at all: renders nothing about stress rather than a fragment', () => {
    const out = ask(STRESS_CHIP, noBlocks());
    expect(out).toContain("I don't have overnight signals or a check-in from you yet");
    expect(out).not.toMatch(/of 5 overnight|strain index|check-in total/i);
  });
});

describe('2d stress & impact copy — associations with intervals, never causes or diagnoses', () => {
  it('quotes a behaviour effect with its interval and labels it an association', () => {
    const out = ask(STRESS_CHIP);
    expect(out).toContain('From your own days: on the 9 days you drank, next-morning HRV averaged 6.2 ms lower (95% CI 2.8–9.6) — an association, not a cause.');
    // Association wording only: no causal verb anywhere in the reply.
    expect(out).not.toMatch(/\bcaused\b|\bcauses\b|\bbecause\b|\bdue\s+to\b|\bmakes?\s+your\b|\blowered\s+your\b|\bfrom\s+drinking\b/i);
  });

  it('names the confound when the engine found one', () => {
    const ctx = fullContext();
    ctx.impact = { ...ctx.impact!, effects: [ctx.impact!.effects[1]] };
    const out = ask(STRESS_CHIP, ctx);
    expect(out).toContain('(95% CI 0.2–1.0) — an association, not a cause (those days were also harder training days).');
  });

  it('the illness flag stays a data pattern and routes to a doctor', () => {
    const ctx = fullContext();
    ctx.stress = {
      ...ctx.stress!,
      illness: { flag: true, since: '2026-09-02', reasons: ['skin temp +1.4 SD for 2 nights', 'breathing rate +1.6 SD'] },
    };
    const out = ask(STRESS_CHIP, ctx);
    expect(out).toContain(
      'Your overnight signals have matched an illness pattern since 2026-09-02 (skin temp +1.4 SD for 2 nights, breathing rate +1.6 SD) — a pattern in the data, not a diagnosis.',
    );
    expect(out).toMatch(/\*\*Keep today easy, sleep long and hydrate; if it lasts more than a few days or you feel unwell, see your doctor\.\*\*$/);
    // Never a condition, never a verdict on what it is.
    expect(out).not.toMatch(/\b(infection|virus|viral|flu|covid|fever|you\s+are\s+sick|you're\s+sick)\b/i);
    // The only time "diagnos" may appear is in the denial.
    expect(out.match(/diagnos\w*/gi)).toEqual(['diagnosis']);
  });

  it('"am I getting sick?" is a symptom ask: it holds training and sends the user to a clinician', () => {
    const ctx = fullContext();
    ctx.stress = { ...ctx.stress!, illness: { flag: true, since: '2026-09-02', reasons: ['skin temp +1.4 SD for 2 nights'] } };
    const out = ask('Am I getting sick or just tired?', ctx);
    expect(routeQuestion('Am I getting sick or just tired?')).toBe('stress');
    expect(out).toContain('not a diagnosis');
    expect(out).toMatch(/\*\*Hold or skip training today[^*]*clinician[^*]*\.\*\*$/);
    expect(out).not.toMatch(/\b(infection|virus|viral|covid)\b/i);
  });
});

describe('2d energy — a forecast, never a measurement', () => {
  it('cites the curve, the dip and the caffeine still on board', () => {
    const out = ask(ENERGY_CHIP);
    expect(out).toContain('Predicted energy is 72 of 100 at 15:20 — a forecast from your sleep and body clock, not a measurement.');
    expect(out).toContain('Your dip lands around 15:00 at 54 of 100.');
    expect(out).toContain('The best window is around 10:00 at 86.');
    expect(out).toContain('About 42 mg of caffeine is still in you.');
    expect(out).not.toMatch(/battery|measured\s+energy/i);
  });

  it('front-loads the day when the dip is still ahead', () => {
    const ctx = fullContext();
    ctx.nowHHMM = '09:30';
    expect(ask(ENERGY_CHIP, ctx)).toMatch(/\*\*Put your hardest work before 15:00 and give the dip a 10-min walk instead of more coffee\.\*\*$/);
  });

  it('empty context: says the forecast is missing and asks for the inputs', () => {
    const out = ask(ENERGY_CHIP, emptyContext());
    expect(out).toBe(
      "I don't have an energy forecast yet — it needs last night's sleep and your wake time. **Log last night's sleep and your wake time (or import WHOOP sleep) and I'll forecast today's peak and dip.**",
    );
  });

  it('no energy block at all: the same empty answer, no fragments', () => {
    expect(ask(ENERGY_CHIP, noBlocks())).toContain("I don't have an energy forecast yet");
  });
});
