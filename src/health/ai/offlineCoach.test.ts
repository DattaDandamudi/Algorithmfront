import { describe, expect, it } from 'vitest';
import type { CoachTone } from '../data/types';
import { DEFAULT_PROFILE, DEFAULT_TARGETS } from '../data/defaults';
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
