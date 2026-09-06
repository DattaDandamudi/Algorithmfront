import { describe, expect, it } from 'vitest';
import { mergeWhoopRecords, normalizeHeader, parseCsv, parseWhoopCsv, parseWhoopDateTime, WHOOP_FIELDS } from './whoopImport';
import type { DailyRecord } from './types';

const HEADER =
  '"Cycle start time","Cycle end time","Cycle timezone","Recovery score %","Resting heart rate (bpm)","Heart rate variability (ms)","Skin temp (celsius)","Blood oxygen %","Day Strain","Energy burned (cal)","Max HR (bpm)","Average HR (bpm)","Sleep onset","Wake onset","Sleep performance %","Respiratory rate (rpm)","Asleep duration (min)","In bed duration (min)","Light sleep duration (min)","Deep (SWS) duration (min)","REM duration (min)","Awake duration (min)","Sleep need (min)","Sleep debt (min)","Sleep efficiency %","Sleep consistency %"';
const ROW1 =
  '2026-09-04 23:10:00,2026-09-05 22:55:00,UTC-04:00,71,52,58,33.1,97,11.2,2100,165,72,2026-09-04 23:10:00,2026-09-05 06:50:00,88,15.1,444,480,220,90,134,36,474,30,92,80';
const ROW2 =
  '2026-09-06 00:15:00,2026-09-06 23:30:00,UTC-04:00,34,55,44,33.4,96,8.9,1900,150,70,2026-09-06 00:15:00,2026-09-06 07:05:00,71,15.6,381,420,200,70,111,39,480,75,90,65';
const CSV = `\uFEFF${HEADER}\r\n${ROW1}\r\n${ROW2}\r\n`;

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, embedded commas/newlines, CRLF and a BOM', () => {
    const rows = parseCsv('\uFEFFa,b,c\r\n1,"x, y","say ""hi"""\r\n"multi\nline",,3\n\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'say "hi"'],
      ['multi\nline', '', '3'],
    ]);
  });

  it('drops blank lines and keeps a trailing row without newline', () => {
    expect(parseCsv('a,b\n\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('')).toEqual([]);
  });
});

describe('parseWhoopDateTime', () => {
  it('reads wall-clock timestamps verbatim (space or T separated, optional seconds)', () => {
    expect(parseWhoopDateTime('2026-09-04 23:10:00')).toEqual({ date: '2026-09-04', time: '23:10' });
    expect(parseWhoopDateTime('2026-09-06T00:15')).toEqual({ date: '2026-09-06', time: '00:15' });
    expect(parseWhoopDateTime('2026-09-06 7:05:12.345')).toEqual({ date: '2026-09-06', time: '07:05' });
    expect(parseWhoopDateTime('2026-09-06')).toEqual({ date: '2026-09-06', time: null });
  });

  it('converts explicit-zone timestamps to local time and rejects garbage', () => {
    const z = parseWhoopDateTime('2026-09-05T03:10:00Z');
    expect(z).not.toBeNull();
    expect(/^\d{4}-\d{2}-\d{2}$/.test(z!.date)).toBe(true);
    expect(/^\d{2}:\d{2}$/.test(z!.time!)).toBe(true);
    const expected = new Date('2026-09-05T03:10:00Z');
    expect(z!.time).toBe(`${String(expected.getHours()).padStart(2, '0')}:${String(expected.getMinutes()).padStart(2, '0')}`);
    expect(parseWhoopDateTime('yesterday')).toBeNull();
    expect(parseWhoopDateTime('2026-13-01 10:00:00')).toBeNull();
    expect(parseWhoopDateTime('2026-09-05 25:00:00')).toBeNull();
    expect(parseWhoopDateTime('')).toBeNull();
    expect(parseWhoopDateTime(undefined)).toBeNull();
  });
});

describe('parseWhoopCsv', () => {
  it('parses a physiological_cycles.csv export into per-day WHOOP fields', () => {
    const res = parseWhoopCsv(CSV);
    expect(res.errors).toEqual([]);
    expect(res.skipped).toBe(0);
    expect(res.records).toHaveLength(2);
    const [a, b] = res.records;
    // Day = the morning you woke (wake onset), not the evening the cycle began.
    expect(a).toEqual({ d: '2026-09-05', rec: 71, rhr: 52, hrv: 58, strn: 11.2, slh: 7.4, sln: 7.9, dbt: 30, bt: '23:10', wk: '06:50' });
    expect(b.d).toBe('2026-09-06');
    expect(b.bt).toBe('00:15'); // after-midnight bedtime is stored as-is
    expect(b.wk).toBe('07:05');
    expect(b.rec).toBe(34);
    expect(b.slh).toBe(6.35);
    expect(b.dbt).toBe(75);
    expect(res.columnsFound).toEqual(
      expect.arrayContaining(['Cycle start time', 'Recovery score %', 'Resting heart rate (bpm)', 'Heart rate variability (ms)', 'Day Strain', 'Asleep duration (min)', 'Sleep need (min)', 'Sleep debt (min)', 'Sleep onset', 'Wake onset']),
    );
    expect(res.columnsFound).not.toContain('Skin temp (celsius)');
    // Never writes user-owned fields.
    for (const r of res.records) for (const k of Object.keys(r)) expect(['d', ...WHOOP_FIELDS]).toContain(k);
  });

  it('matches headers case- and space-insensitively and tolerates missing columns', () => {
    const csv = 'CYCLE START TIME, recovery score%, HeartRateVariability(ms), Nap duration (min)\n2026-09-01 22:50:00,66,61,25\n2026-09-02 23:05:00,,55,\n';
    const res = parseWhoopCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.records).toEqual([
      { d: '2026-09-01', rec: 66, hrv: 61, nap: 25 },
      { d: '2026-09-02', hrv: 55 },
    ]);
    expect(res.columnsFound).toEqual(['CYCLE START TIME', 'recovery score%', 'HeartRateVariability(ms)', 'Nap duration (min)']);
    expect(normalizeHeader(' Resting Heart Rate (bpm) ')).toBe('restingheartratebpm');
  });

  it('skips rows with bad dates or no metrics and reports them', () => {
    const csv = 'Cycle start time,Recovery score %,Heart rate variability (ms)\nnot-a-date,50,50\n2026-09-03 23:00:00,,\n2026-09-04 23:00:00,abc,60\n';
    const res = parseWhoopCsv(csv);
    expect(res.records).toEqual([{ d: '2026-09-04', hrv: 60 }]);
    expect(res.skipped).toBe(2);
    expect(res.errors).toHaveLength(2);
    expect(res.errors[0]).toMatch(/Row 2/);
    expect(res.errors[0]).toMatch(/not-a-date/);
    expect(res.errors[1]).toMatch(/Row 3/);
  });

  it('fails clearly when there is no date column, no metric columns, or no content', () => {
    const noDate = parseWhoopCsv('Recovery score %,HRV\n50,60\n');
    expect(noDate.records).toEqual([]);
    expect(noDate.errors[0]).toMatch(/Cycle start time/);
    expect(noDate.skipped).toBe(1);
    const noMetrics = parseWhoopCsv('Cycle start time,Skin temp (celsius)\n2026-09-01 23:00:00,33\n');
    expect(noMetrics.records).toEqual([]);
    expect(noMetrics.errors[0]).toMatch(/No recovery, HRV/);
    expect(parseWhoopCsv('').errors).toEqual(['File is empty.']);
    expect(parseWhoopCsv('\n\n').errors).toEqual(['File is empty.']);
  });

  it('merges duplicate days (later rows fill/override), clamps and rounds values, sorts ascending', () => {
    const csv = ['Cycle start time,Recovery score %,Resting heart rate (bpm),Heart rate variability (ms),Day Strain,Sleep debt (min)', '2026-09-02 23:00:00,80,50.4,62.6,12.34,-5', '2026-09-01 23:00:00,120,49,,25,10', '2026-09-02 23:00:00,,51,,,'].join('\n');
    const res = parseWhoopCsv(csv);
    expect(res.records.map((r) => r.d)).toEqual(['2026-09-01', '2026-09-02']);
    expect(res.records[0]).toEqual({ d: '2026-09-01', rec: 100, rhr: 49, strn: 21, dbt: 10 });
    expect(res.records[1]).toEqual({ d: '2026-09-02', rec: 80, rhr: 51, hrv: 63, strn: 12.3, dbt: 0 });
  });
});

describe('mergeWhoopRecords', () => {
  const existing: Record<string, DailyRecord> = {
    '2026-09-05': { d: '2026-09-05', w: 171.2, tob: 2, meals: [{ id: 'm1', t: '13:00', n: 'Chicken tikka', g: 200, kc: 330, p: 50, f: 12, c: 6, fi: 1 }], hrv: 50, rec: 55, bt: '23:30' },
    '2026-09-04': { d: '2026-09-04', hrv: 58, rec: 71, rhr: 52, slh: 7.4 },
  };

  it('overwrites only WHOOP fields, keeps user data, and counts updated vs created', () => {
    const res = mergeWhoopRecords(existing, [
      { d: '2026-09-05', hrv: 58, rec: 71, rhr: 52, bt: '23:10', wk: '06:50', slh: 7.4, sln: 7.9, dbt: 30, strn: 11.2 },
      { d: '2026-09-06', rec: 34, hrv: 44, bt: '00:15' },
    ]);
    expect(res.updated).toBe(1);
    expect(res.created).toBe(1);
    expect(res.merged.map((r) => r.d)).toEqual(['2026-09-05', '2026-09-06']);
    const day = res.merged[0];
    expect(day.w).toBe(171.2);
    expect(day.tob).toBe(2);
    expect(day.meals).toEqual(existing['2026-09-05'].meals);
    expect(day.hrv).toBe(58);
    expect(day.rec).toBe(71);
    expect(day.bt).toBe('23:10');
    expect(day.wk).toBe('06:50');
    expect(day.strn).toBe(11.2);
    expect(res.merged[1]).toEqual({ d: '2026-09-06', rec: 34, hrv: 44, bt: '00:15' });
    // Input map is not mutated.
    expect(existing['2026-09-05'].hrv).toBe(50);
  });

  it('ignores identical values and non-WHOOP keys smuggled into incoming records', () => {
    const same = mergeWhoopRecords(existing, [{ d: '2026-09-04', hrv: 58, rec: 71, rhr: 52, slh: 7.4 }]);
    expect(same).toEqual({ merged: [], updated: 0, created: 0 });
    const sneaky = mergeWhoopRecords(existing, [{ d: '2026-09-04', hrv: 60, w: 150, tob: 99 } as DailyRecord]);
    expect(sneaky.updated).toBe(1);
    expect(sneaky.merged[0].w).toBeUndefined();
    expect(sneaky.merged[0].tob).toBeUndefined();
    expect(sneaky.merged[0].hrv).toBe(60);
    expect(mergeWhoopRecords({}, [])).toEqual({ merged: [], updated: 0, created: 0 });
  });

  it('round-trips the parser output', () => {
    const parsed = parseWhoopCsv(CSV);
    const res = mergeWhoopRecords({}, parsed.records);
    expect(res.created).toBe(2);
    expect(res.merged[0]).toEqual(parsed.records[0]);
  });
});
