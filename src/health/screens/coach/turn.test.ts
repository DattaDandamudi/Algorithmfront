import { describe, expect, it } from 'vitest';
import type { ChatMessage, CoachContext } from '../../data/types';
import { EMERGENCY_MESSAGE } from '../../ai/guardrails';
import {
  DeltaBuffer,
  INTERRUPTED_TEXT,
  STOPPED_TEXT,
  abortPatch,
  errorText,
  formatTime,
  introLine,
  makeMessage,
  needsMedicalCue,
  orphanPatch,
  planTurn,
  wordHint,
} from './turn';

const msg = (role: ChatMessage['role'], text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `${role}-${text.slice(0, 8)}`,
  role,
  text,
  ts: 0,
  ...extra,
});

describe('planTurn', () => {
  it('ignores empty / whitespace input', () => {
    expect(planTurn('')).toEqual({ kind: 'empty' });
    expect(planTurn('   \n ')).toEqual({ kind: 'empty' });
  });

  it('routes acute language to a guardrail reply with no model call', () => {
    const p = planTurn("I have chest pain and can't breathe");
    expect(p.kind).toBe('emergency');
    if (p.kind === 'emergency') expect(p.reply).toBe(EMERGENCY_MESSAGE);
  });

  it('flags lab / dosing questions as medical asks', () => {
    expect(planTurn('How much vitamin D should I take?')).toEqual({ kind: 'ask', text: 'How much vitamin D should I take?', medical: true });
  });

  it('treats ordinary training questions as plain asks and trims them', () => {
    expect(planTurn('  Should I train today?  ')).toEqual({ kind: 'ask', text: 'Should I train today?', medical: false });
  });
});

describe('makeMessage', () => {
  it('fills id and ts and omits absent optional keys', () => {
    const m = makeMessage('user', 'hi', { ts: 123 });
    expect(m.role).toBe('user');
    expect(m.text).toBe('hi');
    expect(m.ts).toBe(123);
    expect(m.id.startsWith('msg_')).toBe(true);
    expect('source' in m).toBe(false);
    expect('streaming' in m).toBe(false);
  });

  it('keeps source and streaming when given', () => {
    const m = makeMessage('assistant', '', { source: 'claude', streaming: true, id: 'x' });
    expect(m).toEqual({ id: 'x', role: 'assistant', text: '', ts: m.ts, source: 'claude', streaming: true });
  });
});

describe('needsMedicalCue', () => {
  const chat: ChatMessage[] = [
    msg('user', 'Should I train today?'),
    msg('assistant', 'Yes — **progress your loads.**', { source: 'claude' }),
    msg('user', 'Is my ferritin dose right?'),
    msg('assistant', 'Rate limited.', { source: 'error' }),
    msg('assistant', 'Iron-rich food first. **Confirm dosing with your doctor.**', { source: 'offline' }),
    msg('user', 'chest pain now'),
    msg('assistant', EMERGENCY_MESSAGE, { source: 'guardrail' }),
  ];

  it('is false for user turns and non-medical replies', () => {
    expect(needsMedicalCue(chat, 0)).toBe(false);
    expect(needsMedicalCue(chat, 1)).toBe(false);
  });

  it('skips error bubbles but cues the offline answer that follows', () => {
    expect(needsMedicalCue(chat, 3)).toBe(false);
    expect(needsMedicalCue(chat, 4)).toBe(true);
  });

  it('never cues guardrail replies or out-of-range indexes', () => {
    expect(needsMedicalCue(chat, 6)).toBe(false);
    expect(needsMedicalCue(chat, 99)).toBe(false);
  });
});

describe('end-of-turn patches', () => {
  it('abortPatch keeps partial text as a claude reply, else reports nothing arrived', () => {
    expect(abortPatch('HRV 42 ms is')).toEqual({ text: 'HRV 42 ms is', source: 'claude', streaming: false });
    expect(abortPatch('  ')).toEqual({ text: STOPPED_TEXT, source: 'error', streaming: false });
  });

  it('orphanPatch finalises interrupted placeholders', () => {
    expect(orphanPatch(msg('assistant', '', { streaming: true }))).toEqual({ text: INTERRUPTED_TEXT, source: 'error', streaming: false });
    expect(orphanPatch(msg('assistant', 'half a reply', { streaming: true }))).toEqual({ streaming: false, source: 'claude' });
    expect(orphanPatch(msg('assistant', 'x', { streaming: true, source: 'offline' }))).toEqual({ streaming: false, source: 'offline' });
  });

  it('errorText appends the offline hand-off', () => {
    expect(errorText({ message: 'Rate limited (429) — wait a moment and try again.' })).toBe(
      'Rate limited (429) — wait a moment and try again. Showing the offline answer instead.',
    );
    expect(errorText({ message: '' })).toBe('Something went wrong. Showing the offline answer instead.');
  });
});

describe('captions', () => {
  it('wordHint is null at or under 120 words and names the count above it', () => {
    expect(wordHint('short reply. **Do it.**')).toBeNull();
    const long = Array.from({ length: 134 }, (_, i) => `w${i}`).join(' ');
    expect(wordHint(long)).toBe('134 words · over the 120-word target');
  });

  it('formatTime renders a clock and tolerates garbage', () => {
    const d = new Date(2026, 8, 6, 9, 41);
    expect(formatTime(d.getTime())).toBe('9:41 am');
    expect(formatTime(Number.NaN)).toBe('');
  });
});

describe('introLine', () => {
  const base = { dayType: 'lift', sessionType: 'upper' } as Pick<CoachContext, 'dayType' | 'sessionType'>;
  it('names the day and the readiness verdict when there is a score', () => {
    const ctx = { ...base, readiness: { score: 72.4, band: 'green', source: 'whoop', verdict: 'Primed — progress loads today', training: 'Progress', detail: '' } } as CoachContext;
    expect(introLine(ctx)).toBe('Today is a upper day. Readiness 72% — Primed — progress loads today');
  });
  it('asks for a signal when there is none', () => {
    const ctx = { dayType: 'rest', sessionType: 'rest', readiness: { score: null, band: 'neutral', source: 'none', verdict: '', training: '', detail: '' } } as CoachContext;
    expect(introLine(ctx)).toContain('Today is a rest day. No readiness signal yet');
  });
});

describe('DeltaBuffer', () => {
  it('coalesces deltas into one flush per scheduler tick', () => {
    const ticks: Array<() => void> = [];
    const out: string[] = [];
    const b = new DeltaBuffer((t) => out.push(t), (cb) => ticks.push(cb));
    b.push('Your ');
    b.push('HRV ');
    b.push('is 42 ms.');
    expect(ticks).toHaveLength(1);
    expect(out).toEqual([]);
    ticks[0]();
    expect(out).toEqual(['Your HRV is 42 ms.']);
    b.push(' **Train.**');
    expect(ticks).toHaveLength(2);
    ticks[1]();
    expect(out).toEqual(['Your HRV is 42 ms.', 'Your HRV is 42 ms. **Train.**']);
  });

  it('keeps accumulating text after cancel but stops emitting', () => {
    const ticks: Array<() => void> = [];
    const out: string[] = [];
    const b = new DeltaBuffer((t) => out.push(t), (cb) => ticks.push(cb));
    b.push('partial');
    b.cancel();
    ticks[0]();
    b.push(' more');
    expect(out).toEqual([]);
    expect(b.text).toBe('partial more');
    expect(ticks).toHaveLength(1);
  });
});
