import { describe, expect, it } from 'vitest';
import {
  classifyActivity,
  detectWorkoutSource,
  parseAppleWorkouts,
  parseStravaActivities,
  parseStravaDate,
  parseWhoopWorkouts,
  parseWorkoutFile,
} from './workoutImport';

// ---------------------------------------------------------------------------
// Fixtures — column names taken from real exports
// ---------------------------------------------------------------------------

const WHOOP_CSV = [
  '"Workout start time","Workout end time","Duration (min)","Activity name","Activity Strain","Energy burned (cal)","Max HR (bpm)","Average HR (bpm)","Distance (meters)","Altitude Gain (meters)","HR Zone 1 %","HR Zone 2 %","HR Zone 3 %","HR Zone 4 %","HR Zone 5 %","HR Zone 6 %"',
  '2026-09-05 18:10:00,2026-09-05 19:12:00,62,Weightlifting,11.4,420,152,118,,,20,35,30,10,5,0',
  '2026-09-06 07:20:00,2026-09-06 07:55:00,35,Running,13.2,410,171,148,6200,40,5,15,40,30,10,0',
].join('\n');

const STRAVA_CSV = [
  '"Activity ID","Activity Date","Activity Name","Activity Type","Elapsed Time","Distance","Moving Time","Max Heart Rate","Elevation Gain","Average Heart Rate","Calories","Relative Effort","Perceived Exertion"',
  '9911223344,"Sep 6, 2026, 7:20:03 AM","Morning Run","Run",2400,6200,2100,171,40,148,410,62,7',
  '9911223355,"Sep 7, 2026, 6:05:00 PM","Evening Ride","Ride",3600,24000,3300,165,180,132,700,80,',
].join('\n');

const APPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_GB">
 <Record type="HKQuantityTypeIdentifierStepCount" value="812" startDate="2026-09-06 08:00:00 +0100"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="35.4" durationUnit="min" startDate="2026-09-06 07:20:00 +0100" endDate="2026-09-06 07:55:24 +0100">
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="148.2" maximum="171" unit="count/min"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="6.2" unit="km"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="409.6" unit="kcal"/>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" duration="3720" durationUnit="s" startDate="2026-09-05 18:10:00 +0100" endDate="2026-09-05 19:12:00 +0100"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeYoga" duration="20" durationUnit="min" startDate="2026-09-04 21:00:00 +0100"/>
</HealthData>`;

// ---------------------------------------------------------------------------

describe('classifyActivity', () => {
  it('routes lifting, cardio, mobility and sport to the right kind', () => {
    expect(classifyActivity('Weightlifting')).toBe('strength');
    expect(classifyActivity('Functional Fitness')).toBe('strength');
    expect(classifyActivity('Running')).toBe('cardio');
    expect(classifyActivity('Cycling')).toBe('cardio');
    expect(classifyActivity('Yoga')).toBe('mobility');
    expect(classifyActivity('Football')).toBe('sport');
  });

  it('defaults an unknown activity to cardio, never to strength', () => {
    // Mis-labelling a kickabout as lifting would invent sets that never happened.
    expect(classifyActivity('Kabaddi')).toBe('cardio');
    expect(classifyActivity(undefined)).toBe('cardio');
    expect(classifyActivity('')).toBe('cardio');
  });
});

describe('parseWhoopWorkouts', () => {
  const res = parseWhoopWorkouts(WHOOP_CSV);

  it('reads both sessions with no errors', () => {
    expect(res.errors).toEqual([]);
    expect(res.skipped).toBe(0);
    expect(res.workouts).toHaveLength(2);
  });

  it('maps a lifting session without inventing cardio detail', () => {
    const lift = res.workouts[0];
    expect(lift).toMatchObject({ d: '2026-09-05', start: '18:10', durationMin: 62, kind: 'strength', title: 'Weightlifting', source: 'whoop' });
    expect(lift.cardio).toBeUndefined();
    expect(lift.externalId).toBe('whoop:2026-09-05T18:10');
  });

  it('converts strain to a session RPE in the 1-10 Foster range', () => {
    expect(res.workouts[0].srpe).toBe(5.7); // strain 11.4 / 2
    expect(res.workouts[1].srpe).toBe(6.6); // strain 13.2 / 2
  });

  it('turns HR zone percentages into minutes and metres into kilometres', () => {
    const run = res.workouts[1];
    expect(run.cardio?.distanceKm).toBe(6.2);
    expect(run.cardio?.avgHr).toBe(148);
    expect(run.cardio?.maxHr).toBe(171);
    expect(run.cardio?.elevM).toBe(40);
    // 35 min split 5/15/40/30/10/0 %
    expect(run.cardio?.zoneMin).toEqual([1.8, 5.3, 14, 10.5, 3.5, 0]);
    const total = (run.cardio?.zoneMin ?? []).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(35, 0);
  });

  it('derives the duration from start and end when there is no duration column', () => {
    const csv = ['Workout start time,Workout end time,Activity name', '2026-09-05 23:40:00,2026-09-06 00:25:00,Running'].join('\n');
    expect(parseWhoopWorkouts(csv).workouts[0]).toMatchObject({ d: '2026-09-05', durationMin: 45 }); // wraps past midnight
  });

  it('reports a file that is not workouts.csv instead of guessing', () => {
    const bad = parseWhoopWorkouts('Cycle start time,Recovery score %\n2026-09-05 23:00:00,71\n');
    expect(bad.workouts).toEqual([]);
    expect(bad.errors[0]).toMatch(/workouts\.csv/);
    expect(parseWhoopWorkouts('').errors).toEqual(['File is empty.']);
  });

  it('skips a row with an unreadable start or no duration and says which', () => {
    const csv = ['Workout start time,Duration (min),Activity name', 'nope,60,Running', '2026-09-05 10:00:00,,Running', '2026-09-05 11:00:00,30,Running'].join('\n');
    const out = parseWhoopWorkouts(csv);
    expect(out.workouts).toHaveLength(1);
    expect(out.skipped).toBe(2);
    expect(out.errors[0]).toMatch(/Row 2/);
    expect(out.errors[1]).toMatch(/Row 3/);
  });
});

describe('parseStravaDate', () => {
  it('reads both the ISO and the month-name formats Strava writes', () => {
    expect(parseStravaDate('2026-09-06 07:20:03')).toEqual({ date: '2026-09-06', time: '07:20' });
    expect(parseStravaDate('Sep 6, 2026, 7:20:03 AM')).toEqual({ date: '2026-09-06', time: '07:20' });
    expect(parseStravaDate('Sep 7, 2026, 6:05:00 PM')).toEqual({ date: '2026-09-07', time: '18:05' });
    expect(parseStravaDate('Jan 1, 2026, 12:30:00 AM')).toEqual({ date: '2026-01-01', time: '00:30' });
    expect(parseStravaDate('Dec 31, 2026, 12:15:00 PM')).toEqual({ date: '2026-12-31', time: '12:15' });
  });

  it('rejects nonsense rather than inventing a date', () => {
    expect(parseStravaDate('last tuesday')).toBeNull();
    expect(parseStravaDate('Xyz 6, 2026, 7:20:03 AM')).toBeNull();
    expect(parseStravaDate('')).toBeNull();
    expect(parseStravaDate(undefined)).toBeNull();
  });
});

describe('parseStravaActivities', () => {
  const res = parseStravaActivities(STRAVA_CSV);

  it('reads both activities and prefers moving time over elapsed', () => {
    expect(res.errors).toEqual([]);
    expect(res.workouts).toHaveLength(2);
    expect(res.workouts[0]).toMatchObject({ d: '2026-09-06', start: '07:20', durationMin: 35, kind: 'cardio', title: 'Morning Run' });
    expect(res.workouts[1].durationMin).toBe(55);
  });

  it('uses the activity id for dedupe and converts metres to kilometres', () => {
    expect(res.workouts[0].externalId).toBe('strava:9911223344');
    expect(res.workouts[0].cardio?.distanceKm).toBe(6.2);
    expect(res.workouts[1].cardio?.distanceKm).toBe(24);
  });

  it('takes session RPE only from Perceived Exertion, never from Relative Effort', () => {
    // Relative Effort is Strava's own load number, not a 1-10 rating.
    expect(res.workouts[0].srpe).toBe(7);
    expect(res.workouts[1].srpe).toBeUndefined();
  });

  it('falls back to a date-based external id when the id column is missing', () => {
    const csv = ['Activity Date,Activity Type,Moving Time', '"Sep 6, 2026, 7:20:03 AM",Run,2100'].join('\n');
    expect(parseStravaActivities(csv).workouts[0].externalId).toBe('strava:2026-09-06T07:20');
  });

  it('reports a file that is not activities.csv', () => {
    const bad = parseStravaActivities('Workout start time,Duration (min)\n2026-09-05 18:00:00,60\n');
    expect(bad.workouts).toEqual([]);
    expect(bad.errors[0]).toMatch(/activities\.csv/);
  });
});

describe('parseAppleWorkouts', () => {
  const res = parseAppleWorkouts(APPLE_XML);

  it('finds only the Workout elements and ignores the Record samples', () => {
    expect(res.workouts).toHaveLength(3);
    expect(res.errors).toEqual([]);
  });

  it('maps activity types to kinds and both duration units to minutes', () => {
    expect(res.workouts[0]).toMatchObject({ d: '2026-09-06', start: '07:20', durationMin: 35, kind: 'cardio', title: 'Running' });
    expect(res.workouts[1]).toMatchObject({ d: '2026-09-05', durationMin: 62, kind: 'strength' }); // 3720 s
    expect(res.workouts[2]).toMatchObject({ kind: 'mobility', durationMin: 20 });
  });

  it('reads heart-rate, distance and energy statistics from the element body', () => {
    expect(res.workouts[0].cardio).toMatchObject({ avgHr: 148, maxHr: 171, distanceKm: 6.2, kcal: 410 });
  });

  it('gives a self-closing strength workout no cardio block', () => {
    expect(res.workouts[1].cardio).toBeUndefined();
  });

  it('skips a workout with no readable start date and says so', () => {
    const out = parseAppleWorkouts('<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" startDate="soon"/>');
    expect(out.workouts).toEqual([]);
    expect(out.skipped).toBe(1);
    expect(out.errors[0]).toMatch(/startDate/);
  });

  it('converts a miles distance to kilometres', () => {
    const xml =
      '<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" startDate="2026-09-06 07:20:00 +0100">' +
      '<WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="3.1" unit="mi"/></Workout>';
    expect(parseAppleWorkouts(xml).workouts[0].cardio?.distanceKm).toBe(4.99);
  });
});

describe('detectWorkoutSource / parseWorkoutFile', () => {
  it('recognises each export by name or by content', () => {
    expect(detectWorkoutSource('workouts.csv', WHOOP_CSV)).toBe('whoop');
    expect(detectWorkoutSource('activities.csv', STRAVA_CSV)).toBe('strava');
    expect(detectWorkoutSource('export.xml', APPLE_XML)).toBe('apple');
    // Renamed files still resolve from their headers.
    expect(detectWorkoutSource('my-export-2026.csv', STRAVA_CSV)).toBe('strava');
    expect(detectWorkoutSource('whoop-dump.csv', WHOOP_CSV)).toBe('whoop');
    expect(detectWorkoutSource('notes.txt', 'hello')).toBeNull();
  });

  it('parses through the detected source and names the file it could not read', () => {
    expect(parseWorkoutFile('workouts.csv', WHOOP_CSV).workouts).toHaveLength(2);
    expect(parseWorkoutFile('activities.csv', STRAVA_CSV).source).toBe('strava');
    const bad = parseWorkoutFile('notes.txt', 'hello');
    expect(bad.source).toBeNull();
    expect(bad.errors[0]).toMatch(/notes\.txt/);
  });

  it('never writes an undefined key into an imported session', () => {
    for (const w of parseWorkoutFile('workouts.csv', WHOOP_CSV).workouts) {
      for (const [k, v] of Object.entries(w)) expect(v, k).not.toBeUndefined();
      if (w.cardio) for (const [k, v] of Object.entries(w.cardio)) expect(v, k).not.toBeUndefined();
    }
  });
});
