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
  it('keeps a reply that already has a bold span', () => {
    const t = 'HRV is 42 ms. **Keep today light.** See you tomorrow.';
    expect(ensureBoldAction(t)).toBe(t);
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
