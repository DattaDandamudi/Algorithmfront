import { describe, expect, it } from 'vitest';
import { buildCSV, buildExportBundle, buildExportJSON, buildWorkoutsCSV, CSV_COLUMNS, csvCell, downloadText, EXPORT_NOTE, exportFilename, parseImport, WORKOUT_CSV_COLUMNS } from './export';
import { DEFAULT_SETTINGS, mergeSettings } from './defaults';
import { SCHEMA_VERSION, type ChatMessage, type DailyRecord, type Workout } from './types';

const BOM = '\uFEFF';

const DAYS: Record<string, DailyRecord> = {
  '2026-09-06': { d: '2026-09-06', w: 170.1, wt: 170.9, st: 4200, rec: 52, hrv: 57, rhr: 51, slh: 6.7, bt: '23:47', wk: '06:55', caf: ['08:05'], h2o: 3, kc: 1068, p: 87, meals: [{ id: 'm2', t: '13:00', n: 'Chicken tikka, "spicy"', g: 220, kc: 363, p: 55, f: 13.2, c: 6.6, fi: 1.1, tags: ['poultry', 'restaurant'] }] },
  '2026-09-05': { d: '2026-09-05', w: 171.9, tob: 0, lift: false, note: 'Rest day, ate out\nlate', meals: [{ id: 'm1', t: '20:15', n: 'Biryani', g: 350, kc: 630, p: 31.5, f: 24.5, c: 70, fi: 3.5 }] },
  '2026-09-04': { d: '2026-09-04', lift: true, tob: 3, nap: 20 },
};
const CHAT: ChatMessage[] = [
  { id: 'c1', role: 'user', text: 'Should I train today?', ts: 1_757_000_000_000 },
  { id: 'c2', role: 'assistant', text: 'Recovery is 52% (yellow) — **train, hold loads**.', ts: 1_757_000_001_000, source: 'offline' },
];

describe('buildCSV', () => {
  const csv = buildCSV(Object.values(DAYS));
  const lines = csv.slice(1).split('\r\n');

  it('starts with a UTF-8 BOM, then the header row, with CRLF line endings', () => {
    expect(csv.startsWith(BOM)).toBe(true);
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines).toHaveLength(1 + 3);
    // Row separators are CRLF; the only bare \n is the one inside the quoted note cell.
    const noNotes = buildCSV(Object.values(DAYS).map((d) => ({ ...d, note: undefined })));
    expect(noNotes.split('\r\n')).toHaveLength(4);
    expect(noNotes.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('writes one row per day sorted ascending, with every column present', () => {
    expect(lines[1].startsWith('2026-09-04,')).toBe(true);
    expect(lines[2].startsWith('2026-09-05,')).toBe(true);
    expect(lines[3].startsWith('2026-09-06,')).toBe(true);
    // Unquoted rows have exactly CSV_COLUMNS.length cells.
    expect(lines[1].split(',')).toHaveLength(CSV_COLUMNS.length);
    const cells = lines[1].split(',');
    const col = (name: (typeof CSV_COLUMNS)[number]) => cells[CSV_COLUMNS.indexOf(name)];
    expect(col('date')).toBe('2026-09-04');
    expect(col('weight_lb')).toBe('');
    expect(col('lift_day')).toBe('1');
    expect(col('tobacco')).toBe('3');
    expect(col('nap_min')).toBe('20');
    expect(col('meal_count')).toBe('');
  });

  it('escapes quotes, commas and newlines per RFC 4180 and flattens meals/caffeine', () => {
    // 2026-09-05: note with a comma and a newline → quoted.
    expect(csv).toContain('"Rest day, ate out\nlate"');
    expect(lines[2].split(',')[CSV_COLUMNS.indexOf('lift_day')]).toBe('0');
    expect(lines[2]).toContain('20:15 Biryani 350g 630kcal P31.5 F24.5 C70');
    // 2026-09-06: meal name with quotes and a comma → quoted with doubled quotes.
    expect(lines[3]).toContain('"13:00 Chicken tikka, ""spicy"" 220g 363kcal P55 F13.2 C6.6"');
    expect(lines[3]).toContain(',08:05,');
    expect(lines[3]).toContain(',170.1,170.9,');
  });

  it('handles an empty dataset (header only)', () => {
    expect(buildCSV([])).toBe(`${BOM}${CSV_COLUMNS.join(',')}`);
  });

  it('neutralises spreadsheet formula injection in text cells (R4-8)', () => {
    const rows = buildCSV([
      { d: '2026-09-07', note: '=HYPERLINK("http://evil","x")' },
      { d: '2026-09-08', note: '+1+1' },
      { d: '2026-09-09', note: '-1' },
      { d: '2026-09-10', note: '\tx' },
      { d: '2026-09-11', note: '@SUM(A1)' },
      { d: '2026-09-12', note: 'safe -text' },
    ])
      .slice(1)
      .split('\r\n');
    expect(rows[1]).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(rows[2].endsWith(",'+1+1")).toBe(true);
    expect(rows[3].endsWith(",'-1")).toBe(true);
    expect(rows[4].endsWith(",'\tx")).toBe(true);
    expect(rows[5].endsWith(",'@SUM(A1)")).toBe(true);
    expect(rows[6].endsWith(',safe -text')).toBe(true);
    // Numbers (incl. negatives) are never prefixed; CR is prefixed and quoted.
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell('@a')).toBe("'@a");
    expect(csvCell('\rx')).toBe(`"'\rx"`);
    expect(csvCell('plain')).toBe('plain');
  });
});

describe('buildExportJSON / parseImport', () => {
  it('round-trips a full bundle (days sorted, settings merged, chat preserved)', () => {
    const json = buildExportJSON(DEFAULT_SETTINGS, DAYS, CHAT);
    const bundle = JSON.parse(json);
    expect(bundle.app).toBe('hx');
    expect(bundle.version).toBe(SCHEMA_VERSION);
    expect(typeof bundle.exportedAt).toBe('string');
    const parsed = parseImport(json);
    expect(parsed.ok).toBe(true);
    expect(parsed.errors).toEqual([]);
    expect(parsed.days.map((d) => d.d)).toEqual(['2026-09-04', '2026-09-05', '2026-09-06']);
    expect(parsed.days).toEqual(Object.values(DAYS).sort((a, b) => (a.d < b.d ? -1 : 1)));
    expect(parsed.settings).toEqual(mergeSettings(DEFAULT_SETTINGS));
    expect(parsed.chat).toEqual(CHAT);
  });

  it('buildExportBundle sorts days, strips ai.apiKey (with a note) and carries chat by reference (R4-2)', () => {
    const withKey = { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_SETTINGS.ai, provider: 'anthropic-direct' as const, apiKey: 'sk-ant-secret', proxyUrl: 'https://proxy.example' } };
    const b = buildExportBundle(withKey, DAYS, CHAT);
    expect(b.days.map((d) => d.d)).toEqual(['2026-09-04', '2026-09-05', '2026-09-06']);
    expect(b.chat).toBe(CHAT);
    expect('apiKey' in b.settings.ai).toBe(false);
    expect(b.settings.ai.provider).toBe('anthropic-direct');
    expect(b.settings.ai.proxyUrl).toBe('https://proxy.example');
    expect(b.settings.profile).toBe(withKey.profile); // everything else is carried as is
    expect(b.exportNote).toBe(EXPORT_NOTE);
    expect(EXPORT_NOTE).toMatch(/apiKey/);
    expect(buildExportJSON(withKey, DAYS, CHAT)).not.toContain('sk-ant-secret');
    expect(withKey.ai.apiKey).toBe('sk-ant-secret'); // input untouched
  });

  it('accepts a bare array of records or an object with a days map, dropping invalid records', () => {
    const arr = parseImport(JSON.stringify([DAYS['2026-09-04'], { x: 1 }, { d: '2026-9-4' }, null, 'str']));
    expect(arr.ok).toBe(true);
    expect(arr.days).toEqual([DAYS['2026-09-04']]);
    expect(arr.errors).toEqual(['4 record(s) had no valid date and were skipped.']);
    expect(arr.settings).toBeNull();
    expect(arr.chat).toBeNull();

    const map = parseImport(JSON.stringify({ days: DAYS }));
    expect(map.ok).toBe(true);
    expect(map.days).toHaveLength(3);
  });

  it('rejects garbage with errors instead of throwing', () => {
    const notJson = parseImport('{not json');
    expect(notJson.ok).toBe(false);
    expect(notJson.days).toEqual([]);
    expect(notJson.errors[0]).toMatch(/^Not valid JSON/);

    expect(parseImport('42').errors).toEqual(['Unrecognised file shape.']);
    expect(parseImport('"hello"').errors).toEqual(['Unrecognised file shape.']);
    expect(parseImport('null').errors).toEqual(['Unrecognised file shape.']);

    const noDays = parseImport('{"foo":1}');
    expect(noDays.ok).toBe(false);
    expect(noDays.errors).toEqual(['No `days` array found in file.']);

    const allBad = parseImport('[1,2,"x"]');
    expect(allBad.ok).toBe(false);
    expect(allBad.errors).toEqual(['3 record(s) had no valid date and were skipped.']);

    expect(parseImport('').ok).toBe(false);
  });

  it('warns on a newer schema version but still imports, and filters malformed chat entries', () => {
    const res = parseImport(JSON.stringify({ version: SCHEMA_VERSION + 5, days: [DAYS['2026-09-05']], chat: [CHAT[0], null, { id: 'x' }, 'nope'] }));
    expect(res.ok).toBe(true);
    expect(res.errors[0]).toMatch(new RegExp(`schema v${SCHEMA_VERSION + 5}`));
    expect(res.days).toHaveLength(1);
    expect(res.chat).toEqual([CHAT[0]]);
  });

  it('imports a settings-only file as ok with merged defaults', () => {
    const res = parseImport(JSON.stringify({ days: [], settings: { profile: { name: 'Janak' }, targets: { kcal: 2000 } } }));
    expect(res.ok).toBe(true);
    expect(res.settings?.profile.name).toBe('Janak');
    expect(res.settings?.profile.age).toBe(DEFAULT_SETTINGS.profile.age);
    expect(res.settings?.targets.kcal).toBe(2000);
    expect(res.settings?.targets.protein).toBe(DEFAULT_SETTINGS.targets.protein);
    expect(res.settings?.version).toBe(SCHEMA_VERSION);
  });
});

describe('parseImport normalisation (R4-3)', () => {
  it('backfills meal ids, coerces missing macros to 0 and numeric strings to numbers', () => {
    const json = JSON.stringify({
      days: [
        {
          d: '2026-09-06',
          w: '171.8',
          st: '9120',
          hrv: 'n/a',
          rec: null,
          meals: [{ t: '12:30', n: 'chicken tikka', g: 200, p: 50, kc: 330 }, { id: 'keep', t: '19:00', n: 'roti', g: '80', kc: '240', p: '7', f: '5', c: '40', fi: '5' }, 'junk'],
        },
      ],
    });
    const res = parseImport(json);
    expect(res.ok).toBe(true);
    const day = res.days[0];
    expect(day.w).toBe(171.8);
    expect(day.st).toBe(9120);
    expect(day.hrv).toBeUndefined();
    expect('rec' in day).toBe(false);
    expect(day.meals).toHaveLength(2);
    const [a, b] = day.meals!;
    expect(a.id).toMatch(/^m_/);
    expect(a).toMatchObject({ t: '12:30', n: 'chicken tikka', g: 200, p: 50, kc: 330, f: 0, c: 0, fi: 0 });
    expect(b).toEqual({ id: 'keep', t: '19:00', n: 'roti', g: 80, kc: 240, p: 7, f: 5, c: 40, fi: 5 });
    expect(res.errors).toEqual(['1 field(s) with non-numeric values were dropped.', '1 malformed meal(s) were skipped.']);
    // Every id-less meal gets its own id; an empty meals list is dropped.
    const two = parseImport(JSON.stringify([{ d: '2026-09-06', meals: [{ t: '1', n: 'a' }, { t: '2', n: 'b' }] }, { d: '2026-09-07', meals: [] }]));
    expect(two.days[0].meals![0].id).not.toBe(two.days[0].meals![1].id);
    expect(two.days[1].meals).toBeUndefined();
    expect(two.errors).toEqual([]);
  });

  it('gives chat messages default id/role/ts, drops entries without text and clears streaming', () => {
    const res = parseImport(
      JSON.stringify({
        days: [DAYS['2026-09-04']],
        chat: [{ text: 'hello' }, { id: 'c9', role: 'user', text: 'hi', ts: 5, streaming: true }, { role: 'system', text: 'x', ts: 'later' }, { id: 'e', role: 'user', text: '   ' }, { id: 'f', role: 'user' }],
      }),
    );
    expect(res.chat).toHaveLength(3);
    const [a, b, c] = res.chat!;
    expect(a.id).toMatch(/^c_/);
    expect(a.role).toBe('assistant');
    expect(typeof a.ts).toBe('number');
    expect(b).toEqual({ id: 'c9', role: 'user', text: 'hi', ts: 5 });
    expect('streaming' in b).toBe(false);
    expect(c.role).toBe('assistant');
    expect(typeof c.ts).toBe('number');
    expect(res.errors).toContain('2 chat message(s) had no text and were skipped.');
  });
});

describe('exportFilename / downloadText', () => {
  it('names files by ISO date and extension', () => {
    expect(exportFilename('json', new Date('2026-09-06T12:00:00Z'))).toBe('health-log-2026-09-06.json');
    expect(exportFilename('csv', new Date('2026-01-31T12:00:00Z'))).toBe('health-log-2026-01-31.csv');
  });

  it('is a no-op outside the browser', () => {
    expect(() => downloadText('x.json', '{}')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Workouts (schema v2)
// ---------------------------------------------------------------------------

const WORKOUTS: Record<string, Workout> = {
  w1: {
    id: 'w1',
    d: '2026-09-05',
    start: '18:10',
    durationMin: 62,
    kind: 'strength',
    session: 'upper',
    title: 'Upper A',
    srpe: 7,
    load: 434,
    source: 'manual',
    exercises: [
      { exerciseId: 'bench-press', sets: [{ w: 60, r: 8, rpe: 7 }, { w: 60, r: 8, rpe: 8 }, { w: 40, r: 10, k: 'wu' }] },
      { exerciseId: 'row', sets: [{ w: 50, r: 10 }], note: 'felt "easy", +5 next time' },
    ],
  },
  w2: {
    id: 'w2',
    d: '2026-09-06',
    start: '07:20',
    durationMin: 35,
    kind: 'cardio',
    source: 'whoop',
    externalId: 'whoop:2026-09-06T07:20',
    cardio: { sport: 'run', distanceKm: 6.2, avgHr: 148, maxHr: 171, elevM: 40, kcal: 410 },
  },
};

describe('workouts in the JSON bundle', () => {
  it('exports them sorted and round-trips through parseImport', () => {
    const bundle = buildExportBundle(DEFAULT_SETTINGS, DAYS, CHAT, WORKOUTS);
    expect(bundle.workouts.map((w) => w.id)).toEqual(['w1', 'w2']);

    const back = parseImport(JSON.stringify(bundle));
    expect(back.ok).toBe(true);
    expect(back.workouts).toHaveLength(2);
    expect(back.workouts[0].exercises?.[0].sets[0]).toEqual({ w: 60, r: 8, rpe: 7 });
    expect(back.workouts[1].cardio?.distanceKm).toBe(6.2);
    expect(back.errors).toEqual([]);
  });

  it('defaults the workouts array so a v1 bundle still imports cleanly', () => {
    const v1 = { app: 'hx', version: 1, exportedAt: '2026-09-06T00:00:00.000Z', exportNote: '', settings: DEFAULT_SETTINGS, days: Object.values(DAYS), chat: CHAT };
    const back = parseImport(JSON.stringify(v1));
    expect(back.ok).toBe(true);
    expect(back.workouts).toEqual([]);
    expect(back.days.length).toBe(3);
  });

  it('normalises a hand-edited session: id, numbers, unknown enums, bad sets', () => {
    const back = parseImport(
      JSON.stringify({
        days: [],
        workouts: [
          { d: '2026-09-05', start: '9:5', durationMin: '45', kind: 'yoga', source: 'nowhere', srpe: '6', exercises: [{ exerciseId: 'squat', sets: [{ w: '100', r: '5' }, { r: 5 }, { w: 80 }, 'nope'] }, { sets: [] }] },
          { d: 'not-a-date' },
        ],
      }),
    );
    const w = back.workouts[0];
    expect(back.workouts).toHaveLength(1);
    expect(w.id).toMatch(/^w/);
    expect(w.durationMin).toBe(45);
    expect(w.srpe).toBe(6);
    expect(w.kind).toBe('strength'); // unknown kind falls back
    expect(w.source).toBe('manual'); // unknown source falls back
    expect(w.start).toBe('12:00'); // malformed time falls back
    expect(w.exercises?.[0].sets).toEqual([{ w: 100, r: 5 }, { w: 0, r: 5 }]); // set without reps dropped, bodyweight → 0
    expect(back.errors.join(' ')).toMatch(/1 workout\(s\) had no valid date/);
  });

  it('gives colliding ids fresh ones so the store cannot lose a session', () => {
    const back = parseImport(JSON.stringify({ days: [], workouts: [{ id: 'dup', d: '2026-09-05', start: '10:00' }, { id: 'dup', d: '2026-09-06', start: '10:00' }] }));
    expect(back.workouts).toHaveLength(2);
    expect(back.workouts[0].id).not.toBe(back.workouts[1].id);
  });

  it('imports a file that contains only workouts', () => {
    const back = parseImport(JSON.stringify({ workouts: [{ id: 'w9', d: '2026-09-05', start: '10:00' }] }));
    expect(back.ok).toBe(true);
    expect(back.workouts).toHaveLength(1);
  });
});

describe('buildWorkoutsCSV', () => {
  const csv = buildWorkoutsCSV(Object.values(WORKOUTS));
  const lines = csv.slice(1).split('\r\n');

  it('has the BOM, header and one row per set (plus one for the cardio session)', () => {
    expect(csv.startsWith(BOM)).toBe(true);
    expect(lines[0]).toBe(WORKOUT_CSV_COLUMNS.join(','));
    expect(lines).toHaveLength(1 + 3 + 1 + 1); // 3 bench sets + 1 row set + 1 cardio row
  });

  it('labels warm-ups and carries set numbers', () => {
    expect(lines[1]).toContain('bench-press,1,working,60,8,7');
    expect(lines[3]).toContain('bench-press,3,warmup,40,10');
  });

  it('writes cardio fields on the session row', () => {
    const cardio = lines[lines.length - 1];
    expect(cardio).toContain('run,6.2,148,171,40,410');
  });

  it('quotes a note containing a comma or quote and never lets it run as a formula', () => {
    expect(lines[4]).toContain('"felt ""easy"", +5 next time"');
    expect(csvCell('=1+1')).toBe("'=1+1");
  });
});

describe('exportFilename', () => {
  it('names the workouts file distinctly', () => {
    const d = new Date('2026-09-06T12:00:00Z');
    expect(exportFilename('json', d)).toBe('health-log-2026-09-06.json');
    expect(exportFilename('csv', d, 'workouts')).toBe('health-workouts-2026-09-06.csv');
  });
});

describe('new day fields in the CSV', () => {
  it('adds check-in, stress and Kalman columns and converts the slope to lb/week', () => {
    const csv = buildCSV([{ d: '2026-09-06', kl: 171.4, ks: -0.14, ld: 434, wko: 1, qs: 3, qf: 4, qt: 5, qo: 2, rr: 15.2, skt: 33.4, spo: 96, alc: 2, osi: 58, vo2: 44.1 }]);
    const row = csv.slice(1).split('\r\n')[1].split(',');
    const at = (name: string) => row[CSV_COLUMNS.indexOf(name as (typeof CSV_COLUMNS)[number])];
    expect(at('kalman_lb')).toBe('171.4');
    expect(at('kalman_rate_lb_wk')).toBe('-0.98');
    expect(at('load')).toBe('434');
    expect(at('checkin_stress')).toBe('5');
    expect(at('stress_index')).toBe('58');
    expect(at('vo2max')).toBe('44.1');
  });
});

describe('CSV completeness — no field is silently dropped', () => {
  it('exports a rejected weigh-in as suspect rather than as an ordinary weight', () => {
    const csv = buildCSV([{ d: '2026-09-06', w: 210.4, ws: true, kv: 0.31, mens: true, qsk: true }]);
    const row = csv.slice(1).split('\r\n')[1].split(',');
    const at = (name: string) => row[CSV_COLUMNS.indexOf(name as (typeof CSV_COLUMNS)[number])];
    expect(at('weight_lb')).toBe('210.4');
    // Without this the spreadsheet disagrees with the app's own trend and
    // never says why.
    expect(at('weight_suspect')).toBe('1');
    expect(at('kalman_var')).toBe('0.31');
    expect(at('menstruating')).toBe('1');
    expect(at('checkin_skipped')).toBe('1');
  });

  it('leaves the boolean columns empty rather than writing 0 for an ordinary day', () => {
    const csv = buildCSV([{ d: '2026-09-06', w: 210.4 }]);
    const row = csv.slice(1).split('\r\n')[1].split(',');
    const at = (name: string) => row[CSV_COLUMNS.indexOf(name as (typeof CSV_COLUMNS)[number])];
    expect(at('weight_suspect')).toBe('');
    expect(at('menstruating')).toBe('');
  });

  it('every numeric day field reaches a populated CSV cell', () => {
    // A field in the type with no column is silent data loss on export, and a
    // column that never gets written is the same bug wearing a header.
    const numeric = ['w', 'wt', 'kc', 'p', 'f', 'c', 'fi', 'st', 'rec', 'hrv', 'rhr', 'slh', 'sln', 'dbt', 'strn', 'nap', 'tob', 'h2o', 'kl', 'ks', 'kv', 'ld', 'wko', 'qs', 'qf', 'qt', 'qo', 'rr', 'skt', 'spo', 'alc', 'osi', 'vo2', 'srssR', 'srssS', 'pss4'];
    const rec: Record<string, number> = {};
    for (const k of numeric) rec[k] = 1;
    const row = buildCSV([{ ...(rec as unknown as DailyRecord), d: '2026-09-06' }]).slice(1).split('\r\n')[1].split(',');
    const populated = row.filter((c) => c !== '').length;
    // date + all 36 numeric values. Only the text and boolean columns are empty
    // on this record: bedtime, wake, caffeine, lift_day, the three flags, and
    // the two meal columns.
    expect(populated).toBe(1 + numeric.length);
  });

  it('keeps the session note on a strength workout that has sets', () => {
    const w: Workout = {
      id: 'w1',
      d: '2026-09-05',
      start: '18:10',
      durationMin: 62,
      kind: 'strength',
      source: 'manual',
      note: 'left shoulder twinged on set 3, dropped the load',
      exercises: [{ exerciseId: 'bench-press', sets: [{ w: 80, r: 5, rpe: 9 }], note: 'felt heavy', superset: 'A' }],
    };
    const csv = buildWorkoutsCSV([w]);
    // The note carries a comma, so it is quoted — assert on the file, not on a
    // naive comma split.
    expect(csv).toContain('"left shoulder twinged on set 3, dropped the load"');
    expect(csv).toContain(',A,felt heavy,');
    expect(WORKOUT_CSV_COLUMNS).toContain('session_note');
    expect(WORKOUT_CSV_COLUMNS).toContain('exercise_note');
    expect(WORKOUT_CSV_COLUMNS).toContain('superset');
  });

  it('still carries the session note when the workout has no exercises', () => {
    const csv = buildWorkoutsCSV([{ id: 'w2', d: '2026-09-06', start: '07:20', durationMin: 35, kind: 'cardio', source: 'whoop', note: 'easy shakeout' }]);
    expect(csv).toContain('easy shakeout');
  });
});
