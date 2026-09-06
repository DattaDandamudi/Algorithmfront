// @vitest-environment jsdom
/**
 * Workout import render tests (Phase 2e).
 *
 * The count line is the contract: an import must say what it read, what it
 * added and what it recognised as already here. The re-import case is the one
 * that has to be honest — the store dedupes by `externalId`, so choosing the
 * same export twice must report "0 added · N already here" rather than
 * claiming a second successful import.
 */
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStorageCache } from '../../data/storage';
import { HealthStoreProvider } from '../../data/store';
import ImportsSection from './ImportsSection';

const NOW = Date.UTC(2026, 8, 6, 12, 0, 0);

const WHOOP_CSV = [
  '"Workout start time","Workout end time","Duration (min)","Activity name","Activity Strain","Energy burned (cal)","Max HR (bpm)","Average HR (bpm)","Distance (meters)","Altitude Gain (meters)","HR Zone 1 %","HR Zone 2 %","HR Zone 3 %","HR Zone 4 %","HR Zone 5 %","HR Zone 6 %"',
  '2026-09-05 18:10:00,2026-09-05 19:12:00,62,Weightlifting,11.4,420,152,118,,,20,35,30,10,5,0',
  '2026-09-06 07:20:00,2026-09-06 07:55:00,35,Running,13.2,410,171,148,6200,40,5,15,40,30,10,0',
].join('\n');

const STRAVA_CSV = [
  '"Activity ID","Activity Date","Activity Name","Activity Type","Elapsed Time","Distance","Moving Time","Max Heart Rate","Elevation Gain","Average Heart Rate","Calories","Relative Effort","Perceived Exertion"',
  '9911223344,"Sep 7, 2026, 7:20:03 AM","Morning Run","Run",2400,6200,2100,171,40,148,410,62,7',
].join('\n');

const APPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_GB">
 <Record type="HKQuantityTypeIdentifierStepCount" value="812" startDate="2026-09-08 08:00:00 +0100"/>
 <Record type="HKQuantityTypeIdentifierHeartRate" value="61" startDate="2026-09-08 08:01:00 +0100"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeYoga" duration="20" durationUnit="min" startDate="2026-09-08 21:00:00 +0100"/>
</HealthData>`;

function mount(ui: ReactNode) {
  return render(<HealthStoreProvider>{ui}</HealthStoreProvider>);
}

/** The three hidden inputs, in render order: WHOOP, Strava, Apple. */
const fileInputs = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));

async function choose(input: HTMLInputElement, name: string, text: string, type = 'text/csv') {
  const file = new File([text], name, { type });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  // The banner is role=status when everything landed and role=alert when
  // something was skipped, so wait on the count line rather than on a role.
  await waitFor(() => expect(screen.getByText(/sessions? read ·/)).toBeTruthy());
}

/** "2 sessions read · 2 added · 0 already here" */
const countLine = () => screen.getByText(/sessions? read ·/).textContent ?? '';

beforeEach(() => {
  window.localStorage.clear();
  resetStorageCache();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetStorageCache();
});

describe('ImportsSection', () => {
  it('offers one hidden file input per source, each named by its real file', () => {
    const { container } = mount(<ImportsSection now={NOW} />);
    expect(fileInputs(container)).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Choose workouts.csv' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose activities.csv' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose export.xml' })).toBeTruthy();
    expect(screen.getAllByText('never')).toHaveLength(3);
    expect(screen.getByText(/Read in 4 MB chunks; the heart-rate samples are skipped/)).toBeTruthy();
    expect(screen.getByText(/Over 200 MB only the last 200 MB are read/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Export workouts CSV' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports what it read, added and skipped — and reports everything skipped on a re-import', async () => {
    const { container } = mount(<ImportsSection now={NOW} />);
    const whoop = fileInputs(container)[0];

    await choose(whoop, 'workouts.csv', WHOOP_CSV);
    expect(countLine()).toBe('2 sessions read · 2 added · 0 already here');
    expect(screen.getByText('workouts.csv · whoop')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy(); // Sessions stored

    // The same export again: the store recognises both by their externalId.
    await choose(whoop, 'workouts.csv', WHOOP_CSV);
    expect(countLine()).toBe('2 sessions read · 0 added · 2 already here');
    expect(screen.getByText('2 whoop')).toBeTruthy();
  });

  it('keeps counting honestly across sources', async () => {
    const { container } = mount(<ImportsSection now={NOW} />);
    await choose(fileInputs(container)[0], 'workouts.csv', WHOOP_CSV);
    await choose(fileInputs(container)[1], 'activities.csv', STRAVA_CSV);
    expect(countLine()).toBe('1 session read · 1 added · 0 already here');
    expect(screen.getByText('1 strava · 2 whoop')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Export workouts CSV' }) as HTMLButtonElement).disabled).toBe(false);

    // Strava dedupes on its own Activity ID, so a second pass adds nothing.
    await choose(fileInputs(container)[1], 'activities.csv', STRAVA_CSV);
    expect(countLine()).toBe('1 session read · 0 added · 1 already here');
    expect(screen.getByText('3')).toBeTruthy(); // still three sessions stored
  });

  it('streams the Apple export, skipping the record samples', async () => {
    const { container } = mount(<ImportsSection now={NOW} />);
    await choose(fileInputs(container)[2], 'export.xml', APPLE_XML, 'text/xml');
    expect(countLine()).toBe('1 session read · 1 added · 0 already here');
    expect(screen.getByText(/2 record samples skipped/)).toBeTruthy();
    expect(screen.getByText(/in 1 chunk/)).toBeTruthy();

    await choose(fileInputs(container)[2], 'export.xml', APPLE_XML, 'text/xml');
    expect(countLine()).toBe('1 session read · 0 added · 1 already here');
  });

  it('says a file is not what it claims instead of importing nothing quietly', async () => {
    const { container } = mount(<ImportsSection now={NOW} />);
    await choose(fileInputs(container)[0], 'notes.txt', 'dear diary\n', 'text/plain');
    expect(countLine()).toBe('0 sessions read · 0 added · 0 already here');
    expect(screen.getByText(/Could not tell what "notes.txt" is/)).toBeTruthy();
  });

  it('counts rows it could not read separately from duplicates', async () => {
    const { container } = mount(<ImportsSection now={NOW} />);
    const csv = ['Workout start time,Duration (min),Activity name', 'nope,60,Running', '2026-09-05 10:00:00,30,Running'].join('\n');
    await choose(fileInputs(container)[0], 'workouts.csv', csv);
    expect(countLine()).toBe('1 session read · 1 added · 0 already here · 1 unreadable');
    expect(screen.getByText(/Row 2: unreadable start time/)).toBeTruthy();
  });
});
