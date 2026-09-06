/**
 * The chunked Apple Health reader (Settings §9).
 *
 * The thing worth testing is not the parse — `data/workoutImport` owns that and
 * has its own fixtures — but the streaming: a `<Workout>` element split across
 * chunk boundaries must survive, `<Record>` samples must be walked past rather
 * than parsed, a multi-byte character on a boundary must not become U+FFFD, and
 * a file over the cap must be refused rather than half-read.
 */
import { describe, expect, it } from 'vitest';
import { APPLE_MAX_BYTES, drainWorkoutElements, scanAppleWorkouts, type ChunkedSource } from './appleStream';

const RECORDS = 400;

/** An export shaped like Apple's: thousands of samples, then the workouts. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_GB">
 <Me HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexMale"/>
${Array.from({ length: RECORDS }, (_, i) => ` <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Wrïst" value="${60 + (i % 40)}" startDate="2026-09-06 08:${String(i % 60).padStart(2, '0')}:00 +0100"/>`).join('\n')}
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="35.4" durationUnit="min" startDate="2026-09-06 07:20:00 +0100" endDate="2026-09-06 07:55:24 +0100">
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="148.2" maximum="171" unit="count/min"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="6.2" unit="km"/>
  <WorkoutEvent type="HKWorkoutEventTypePause" date="2026-09-06 07:40:00 +0100"/>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" duration="3720" durationUnit="s" startDate="2026-09-05 18:10:00 +0100"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeYoga" duration="20" durationUnit="min" startDate="2026-09-04 21:00:00 +0100"/>
</HealthData>`;

/** A File-shaped stub over a UTF-8 string; slices are real byte slices. */
function source(text: string, sizeOverride?: number): ChunkedSource {
  const bytes = new TextEncoder().encode(text);
  return {
    size: sizeOverride ?? bytes.byteLength,
    slice: (start, end) => ({ arrayBuffer: async () => bytes.slice(start, end).buffer as ArrayBuffer }),
  };
}

const noYield = async () => {};

describe('drainWorkoutElements', () => {
  it('keeps a partial element for the next chunk instead of parsing half of it', () => {
    const out = drainWorkoutElements('<Record a="1"/><Workout duration="30"');
    expect(out.elements).toEqual([]);
    expect(out.rest).toBe('<Workout duration="30"');
  });

  it('does not mistake <WorkoutStatistics> or <WorkoutEvent> for a workout element', () => {
    const out = drainWorkoutElements('<WorkoutStatistics type="x" sum="2"/><WorkoutEvent type="y"/>', true);
    expect(out.elements).toEqual([]);
    expect(out.rest).toBe('');
  });

  it('keeps a 16-character look-ahead so "<Work|out" across a boundary is still found', () => {
    const out = drainWorkoutElements('<Record a="1"/><Work');
    expect(out.rest.endsWith('<Work')).toBe(true);
  });
});

describe('scanAppleWorkouts', () => {
  it('finds every workout and skips every record sample', async () => {
    const res = await scanAppleWorkouts(source(XML), { yieldBetweenChunks: noYield });
    expect(res.workouts).toHaveLength(3);
    expect(res.recordsSkipped).toBe(RECORDS);
    expect(res.errors).toEqual([]);
    expect(res.truncated).toBe(false);
    expect(res.scannedFrom).toBe(0);
    expect(res.workouts.map((w) => w.kind)).toEqual(['cardio', 'strength', 'mobility']);
    expect(res.workouts[0]).toMatchObject({ d: '2026-09-06', start: '07:20', durationMin: 35, source: 'apple' });
    expect(res.workouts[0].cardio?.avgHr).toBe(148);
  });

  it('gives the same answer at every chunk size, including one byte at a time', async () => {
    const whole = await scanAppleWorkouts(source(XML), { yieldBetweenChunks: noYield });
    for (const chunkBytes of [1, 7, 64, 997, 1 << 20]) {
      const res = await scanAppleWorkouts(source(XML), { chunkBytes, yieldBetweenChunks: noYield });
      expect(res.workouts).toEqual(whole.workouts);
      expect(res.recordsSkipped).toBe(RECORDS);
      // The multi-byte "ï" in a sourceName is split by the 1-byte chunking; a
      // non-streaming decode would leave U+FFFD behind and desync the scan.
      expect(res.errors).toEqual([]);
    }
  });

  it('reads the file in chunks rather than in one gulp', async () => {
    const res = await scanAppleWorkouts(source(XML), { chunkBytes: 512, yieldBetweenChunks: noYield });
    expect(res.chunks).toBeGreaterThan(1);
    expect(res.bytesRead).toBe(new TextEncoder().encode(XML).byteLength);
  });

  it('reads the LAST maxBytes of an over-cap file, where Apple keeps the workouts, and says so', async () => {
    const size = new TextEncoder().encode(XML).byteLength;
    // A window big enough for the three workouts at the end but not the samples.
    const maxBytes = 900;
    const res = await scanAppleWorkouts(source(XML), { maxBytes, chunkBytes: 128, yieldBetweenChunks: noYield });
    expect(res.truncated).toBe(true);
    expect(res.scannedFrom).toBe(size - maxBytes);
    expect(res.bytesRead).toBe(maxBytes);
    expect(res.workouts).toHaveLength(3);
    // The window it read is reported rather than hidden behind the count.
    expect(res.errors[0]).toContain('only its last');
    expect(res.errors[0]).toContain('900 B');
    expect(APPLE_MAX_BYTES).toBe(200 * 1024 * 1024);
  });

  it('never scans more than the cap, however big the file claims to be', async () => {
    const res = await scanAppleWorkouts(source(XML, 900 * 1024 * 1024), { maxBytes: 512, chunkBytes: 128, yieldBetweenChunks: noYield });
    expect(res.bytesRead).toBe(512);
    expect(res.errors[0]).toContain('900.00 MB');
  });

  it('reports an unterminated workout element instead of hanging on it', async () => {
    const res = await scanAppleWorkouts(source('<HealthData><Workout duration="30" startDate="2026-09-06 07:00:00 +0100">'), { yieldBetweenChunks: noYield });
    expect(res.workouts).toEqual([]);
    expect(res.skipped).toBe(1);
    expect(res.errors).toHaveLength(1);
  });
});
