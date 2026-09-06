import { describe, expect, it } from 'vitest';
import {
  DISCLAIMER,
  EMERGENCY_MESSAGE,
  MAX_WORDS,
  checkLength,
  detectEmergency,
  ensureBoldAction,
  ensureDoctorCue,
  isMedicalAsk,
  isSymptomAsk,
  maskKey,
  wordCount,
} from './guardrails';
import { CHIPS } from './coachContext.fixture';

describe('detectEmergency', () => {
  const positives = [
    'I have chest pain and my left arm is numb',
    'Getting a lot of chest pressure when I walk upstairs',
    'trouble breathing after climbing the stairs',
    "I can't breathe properly",
    'I fainted this morning in the shower',
    'I feel like I am going to pass out',
    "cut my hand and the bleeding won't stop",
    'severe bleeding from my leg',
    "I think I'm having a stroke, my speech is slurred",
    'my face is drooping on one side',
    "I don't want to live anymore",
    'I took too many pills last night',
    'allergic reaction — my throat is swelling',
    'should I call 911 for this?',
    'is this a medical emergency',
  ];
  const negatives = [
    'my chest workout was brutal today',
    'chest day tomorrow or legs?',
    'out of breath after 5 min of cardio, is that normal?',
    'my legs are sore from squats',
    'do blackout curtains help sleep?',
    'I swam 40 strokes this morning',
    'I feel run down, why is my recovery low?',
    'how many roti can I eat on a lift day',
    ...CHIPS,
  ];

  it.each(positives)('flags "%s"', (q) => {
    const r = detectEmergency(q);
    expect(r.emergency).toBe(true);
    expect(r.message).toBe(EMERGENCY_MESSAGE);
  });

  it.each(negatives)('does not flag "%s"', (q) => {
    const r = detectEmergency(q);
    expect(r.emergency).toBe(false);
    expect(r.message).toBe('');
  });

  it('message is one calm sentence pointing to professional care', () => {
    expect(EMERGENCY_MESSAGE.split(/[.!?](\s|$)/).filter((s) => s.trim()).length).toBe(1);
    expect(EMERGENCY_MESSAGE).toMatch(/emergency services|911/);
    expect(EMERGENCY_MESSAGE).toMatch(/clinician/);
  });

  it('handles empty input', () => {
    expect(detectEmergency('').emergency).toBe(false);
  });
});

describe('isMedicalAsk', () => {
  const positives = [
    'Are my vitamin D / ferritin / omega-3 habits on track?',
    'how many mg of zinc should I take',
    'should I take 2000 IU a day',
    'my knee hurts when I squat',
    'I feel dizzy after training',
    'is my testosterone low',
    'my blood test results came back',
    'what dose of fish oil is right',
    'my lead level is elevated, what now',
    'should I see a doctor about this',
    'any supplement for sleep?',
    'I get palpitations after coffee',
  ];
  const negatives = [
    'Should I train today?',
    'What should I eat now?',
    'Why is my recovery low?',
    "How's my weight trend — adjust calories?",
    'Plan my carbs for a lift day.',
    "How did last night's sleep affect me?",
    'Help me cut back tobacco today.',
    'lead your next meal with protein — what should it be?',
    'how much rice on a rest day',
    'is a 1.2 lb/wk loss too fast',
  ];

  it.each(positives)('true for "%s"', (q) => expect(isMedicalAsk(q)).toBe(true));
  it.each(negatives)('false for "%s"', (q) => expect(isMedicalAsk(q)).toBe(false));
  it('false for empty input', () => expect(isMedicalAsk('')).toBe(false));
});

describe('wordCount / checkLength', () => {
  it('counts whitespace-separated words with letters or digits', () => {
    expect(wordCount('one two three')).toBe(3);
    expect(wordCount('  spaced   out\nwords ')).toBe(3);
    expect(wordCount('— ** —')).toBe(0);
    expect(wordCount('**Eat 40 g protein.**')).toBe(4);
    expect(wordCount('')).toBe(0);
  });

  it('flags replies over 120 words', () => {
    const w120 = Array.from({ length: MAX_WORDS }, (_, i) => `w${i}`).join(' ');
    expect(checkLength(w120)).toEqual({ words: 120, over: false });
    expect(checkLength(`${w120} extra`)).toEqual({ words: 121, over: true });
  });
});

describe('ensureDoctorCue', () => {
  it('appends the cue to a medical reply that never mentions a clinician', () => {
    const out = ensureDoctorCue('Vitamin D is low. Get some sun.', true);
    expect(out).toBe('Vitamin D is low. Get some sun. Confirm dosing and any changes with your doctor.');
  });

  it('leaves replies alone when they already defer to a doctor / physician / clinician', () => {
    const t = 'Ask your physician about the retest.';
    expect(ensureDoctorCue(t, true)).toBe(t);
    expect(ensureDoctorCue('Check with your doctor.', true)).toBe('Check with your doctor.');
  });

  it('does nothing for non-medical asks', () => {
    expect(ensureDoctorCue('Progress your loads today.', false)).toBe('Progress your loads today.');
  });

  it('inserts the cue before a trailing bold action so the action stays last', () => {
    const out = ensureDoctorCue('Ferritin is 23. **Add red meat twice this week.**', true);
    expect(out).toBe('Ferritin is 23. Confirm dosing and any changes with your doctor. **Add red meat twice this week.**');
    expect(out.endsWith('**')).toBe(true);
  });

  it('returns just the cue for an empty medical reply', () => {
    expect(ensureDoctorCue('', true)).toBe('Confirm dosing and any changes with your doctor.');
  });
});

describe('ensureBoldAction', () => {
  it('keeps a reply whose single bold span is already the final sentence', () => {
    const t = 'HRV is 42 ms. **Keep today light.**';
    expect(ensureBoldAction(t)).toBe(t);
    expect(ensureBoldAction('**Eat 40 g protein.**')).toBe('**Eat 40 g protein.**');
  });

  it('bolds the last sentence', () => {
    expect(ensureBoldAction('Sentence one. Do this now.')).toBe('Sentence one. **Do this now.**');
    expect(ensureBoldAction('First!\nSecond line here')).toBe('First!\n**Second line here.**');
  });

  it('bolds a single-sentence reply and adds a period', () => {
    expect(ensureBoldAction('Eat 40 g protein')).toBe('**Eat 40 g protein.**');
  });

  it('does not split on decimals', () => {
    expect(ensureBoldAction('Your trend is down 1.2 lb/wk. Hold 1.5 roti per meal.')).toBe(
      'Your trend is down 1.2 lb/wk. **Hold 1.5 roti per meal.**',
    );
  });

  it('handles empty and whitespace input', () => {
    expect(ensureBoldAction('')).toBe('');
    expect(ensureBoldAction('   ')).toBe('');
  });
});

describe('maskKey', () => {
  it('shows only the sk-ant prefix and the last 4 characters', () => {
    expect(maskKey('sk-ant-api03-abcdefgh1234')).toBe('sk-ant-…1234');
  });
  it('masks non-Anthropic tokens generically', () => {
    expect(maskKey('proxy-token-xyz9')).toBe('pro…xyz9');
  });
  it('never leaks short keys', () => {
    expect(maskKey('abc')).toBe('••••');
    expect(maskKey('12345678')).toBe('••••');
  });
  it('returns empty for missing keys', () => {
    expect(maskKey(undefined)).toBe('');
    expect(maskKey('   ')).toBe('');
  });
});

describe('DISCLAIMER', () => {
  it('is the spec footer copy', () => {
    expect(DISCLAIMER).toBe('Wellness information only — not medical advice. Confirm labs, dosing and symptoms with your doctor.');
  });
});

// ---------------------------------------------------------------------------
// Review round 5 reproductions
// ---------------------------------------------------------------------------

describe('R5-1 / R5-5 detectEmergency — acute phrases fire, ordinary logging language does not', () => {
  const positives = [
    "I think I'm having a heart attack",
    'heart attack symptoms — should I still train?',
    'my chest hurts really badly',
    "chest tightness that won't go away",
    'I had a seizure this morning',
    "I'm not breathing well and my lips are blue",
    "he's not breathing",
    'I collapsed at the gym and woke up on the floor',
    'my friend is unconscious',
    'vomiting blood since last night',
    'I keep coughing up blood',
    "I can't feel my legs",
    "can't move my face on one side",
    'my speech is slurred and my face is drooping',
    'I think I have a concussion after hitting my head',
    'I overdosed on sleeping pills',
    'severe allergic reaction, my throat is closing',
    'should I call 911 for this?',
    'I need an ambulance',
    "I'm choking on a piece of chicken",
    "I've been cutting myself",
    'I passed out during my workout',
    'worst headache of my life came on suddenly',
  ];
  const negatives = [
    "I'm at 911 kcal so far today, what should I eat?",
    'I ate 911 calories',
    "I'm cutting myself down to 1800 kcal",
    "I'm cutting myself some slack today",
    'I keep hurting myself in the gym, how do I progress safely',
    'choking down protein shakes is hard',
    'I get a mild allergic reaction to peanuts, what snacks instead?',
    'I drive an ambulance on night shifts, how do I fix my sleep?',
    'passed out on the couch after lunch, why so sleepy?',
    'my chest workout was brutal today',
    'chest day tomorrow or legs?',
    'out of breath after 5 min of cardio, is that normal?',
    'I swam 40 strokes this morning',
    'do blackout curtains help sleep?',
    'cut myself off from late-night snacks — good idea?',
    'my HRV collapsed after the night out, why?',
    'unconscious eating habits are wrecking my deficit',
    'breathing during squats — brace or exhale?',
    "my dad's family history of heart attack worries me, how do I lower risk?",
    'my chest hurts from bench press yesterday, train upper anyway?',
    ...CHIPS,
  ];

  it.each(positives)('flags "%s"', (q) => expect(detectEmergency(q).emergency).toBe(true));
  it.each(negatives)('does not flag "%s"', (q) => expect(detectEmergency(q).emergency).toBe(false));
});

describe('R5-7 ensureBoldAction — exactly one bold span, and it is the final sentence', () => {
  const oneTrailingSpan = /^[^*]*\*\*[^*]+\*\*$/;

  it.each([
    ['**Verdict:** train today. Your HRV is 54 ms. Hold loads.', 'Verdict: train today. Your HRV is 54 ms. **Hold loads.**'],
    ['Your **HRV is 54 ms**, 2 above baseline. **Progress loads.** Also **sleep more.**', 'Your HRV is 54 ms, 2 above baseline. Progress loads. **Also sleep more.**'],
    ['HRV is 42 ms. **Keep today light.** See you tomorrow.', 'HRV is 42 ms. Keep today light. **See you tomorrow.**'],
    ['Readiness 71%. **Progress your', 'Readiness 71%. **Progress your.**'],
    ['Readiness 71%. **Progress your lower-body loads today.**  ', 'Readiness 71%. **Progress your lower-body loads today.**'],
  ])('%j → %j', (input, expected) => {
    const out = ensureBoldAction(input);
    expect(out).toBe(expected);
    expect(out).toMatch(oneTrailingSpan);
  });
});

describe('R5-9 isMedicalAsk — supplement dosing', () => {
  it.each([
    'should I take creatine',
    'how much melatonin for sleep',
    'take 5 g creatine daily?',
    'what about ZMA before bed',
    'is ashwagandha worth it',
    'pre-workout before a morning session?',
    'caffeine pills instead of coffee?',
  ])('true for "%s"', (q) => expect(isMedicalAsk(q)).toBe(true));

  it.each(['180 g protein a day is my target, right?', 'how much rice on a rest day', 'Plan my carbs for a lift day.'])(
    'false for "%s" (nutrition amounts are not dosing)',
    (q) => expect(isMedicalAsk(q)).toBe(false),
  );
});

describe('R5-6 isSymptomAsk — the symptom subset of medical asks', () => {
  it.each(['I feel dizzy after training', 'my knee hurts when I squat', 'I get palpitations after coffee', 'headache all day, train or rest?', 'feeling faint on the stairs', 'my chest hurts from bench press yesterday'])(
    'true for "%s"',
    (q) => {
      expect(isSymptomAsk(q)).toBe(true);
      expect(isMedicalAsk(q)).toBe(true);
    },
  );
  it.each(['how many mg of zinc should I take', 'is my ferritin ok', 'Should I train today?', 'my legs are sore from squats', ''])('false for "%s"', (q) =>
    expect(isSymptomAsk(q)).toBe(false),
  );
});
