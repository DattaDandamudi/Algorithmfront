import { describe, expect, it } from 'vitest';
import { buildCSV, buildExportBundle, buildExportJSON, CSV_COLUMNS, downloadText, exportFilename, parseImport } from './export';
import { DEFAULT_SETTINGS, mergeSettings } from './defaults';
import { SCHEMA_VERSION, type ChatMessage, type DailyRecord } from './types';

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

  it('buildExportBundle sorts days and carries settings/chat by reference', () => {
    const b = buildExportBundle(DEFAULT_SETTINGS, DAYS, CHAT);
    expect(b.days.map((d) => d.d)).toEqual(['2026-09-04', '2026-09-05', '2026-09-06']);
    expect(b.settings).toBe(DEFAULT_SETTINGS);
    expect(b.chat).toBe(CHAT);
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

describe('exportFilename / downloadText', () => {
  it('names files by ISO date and extension', () => {
    expect(exportFilename('json', new Date('2026-09-06T12:00:00Z'))).toBe('health-log-2026-09-06.json');
    expect(exportFilename('csv', new Date('2026-01-31T12:00:00Z'))).toBe('health-log-2026-01-31.csv');
  });

  it('is a no-op outside the browser', () => {
    expect(() => downloadText('x.json', '{}')).not.toThrow();
  });
});
