// @vitest-environment jsdom
/**
 * Analysis — the view where the two audit rules are easiest to break.
 *
 * So they are asserted here rather than trusted: the volume grid states every
 * band in words and carries `VOLUME_ADVISORY_NOTE` (a landmark is never a
 * cap), and the load card prints the acute:chronic ratio *below* absolute
 * load with its "descriptive, not a causal injury predictor" note. The rest
 * covers the chart contract — an exercise picker, a hidden data table on every
 * chart, and an honest empty state before anything is logged.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { CoachContext, ISODate, TrainingContext, Workout } from '../../data/types';
import { DEFAULT_LANDMARKS, DEFAULT_SETTINGS } from '../../data/defaults';
import { LOAD_NOTES, VOLUME_ADVISORY_NOTE, weekStartMonday, weeklySetsByMuscle } from '../../engine';
import { addDays } from '../../lib/dates';
import AnalysisView from './AnalysisView';
import MuscleVolumeGrid, { volumeCellStyle } from './MuscleVolumeGrid';
import LoadGauge from './LoadGauge';
import { emptyTraining, type TrainModel } from './useTrainModel';
import { toKgLoad } from './trainUtils';

afterEach(cleanup);

const TODAY: ISODate = '2026-09-06';

/** Twelve bench/row sessions over eight weeks, adding 5 lb every fortnight. */
function history(): Workout[] {
  const out: Workout[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = addDays(TODAY, -i * 5);
    const lb = 135 + (11 - i) * 2.5;
    out.push({
      id: `w${i}`,
      d,
      start: '18:00',
      durationMin: 60,
      kind: 'strength',
      session: 'upper',
      source: 'manual',
      srpe: 7,
      exercises: [
        {
          exerciseId: 'bench-press',
          sets: [
            { w: toKgLoad(lb, 'lb'), r: 8, rpe: 8 },
            { w: toKgLoad(lb, 'lb'), r: 8, rpe: 8 },
            { w: toKgLoad(lb, 'lb'), r: 7, rpe: 9 },
          ],
        },
        {
          exerciseId: 'barbell-row',
          sets: [
            { w: toKgLoad(115, 'lb'), r: 10 },
            { w: toKgLoad(115, 'lb'), r: 10 },
          ],
        },
      ],
    });
  }
  return out;
}

function model(workouts: Workout[]): TrainModel {
  const training = emptyTraining();
  return {
    today: TODAY,
    nowMs: Date.parse('2026-09-06T18:00:00Z'),
    settings: DEFAULT_SETTINGS,
    records: [],
    workouts,
    // AnalysisView reads `training` and the raw workouts, never the full context.
    ctx: {} as CoachContext,
    training: {
      ...training,
      load: { ...training.load, acute7: 412, chronic28: 380, acwr: 1.08, acwrBand: 'sweet', weekOverWeekPct: 8, fitness: 51, fatigue: 43, form: 8, formBand: 'productive', weeklyLoad: 1240, source: 'logged' },
    },
    units: 'lb',
    custom: [],
    landmarks: DEFAULT_LANDMARKS,
    restTimerSec: 90,
  };
}

describe('AnalysisView', () => {
  it('says there is nothing to analyse before anything is logged', () => {
    render(<AnalysisView model={model([])} onStart={() => {}} />);
    expect(screen.getByText('Nothing to analyse yet')).toBeTruthy();
    expect(screen.queryByText('Estimated 1RM')).toBeNull();
  });

  it('draws the estimated-max chart with a picker and a hidden data table', () => {
    render(<AnalysisView model={model(history())} onStart={() => {}} />);

    // Both lifts have 12 sessions, so the picker falls back to name order.
    const picker = screen.getByRole('combobox', { name: 'Exercise' }) as HTMLSelectElement;
    expect(picker.value).toBe('barbell-row');
    expect(within(picker).getByRole('option', { name: /Bench Press · 12 sessions/ })).toBeTruthy();
    expect(within(picker).getByRole('option', { name: /Barbell Row · 12 sessions/ })).toBeTruthy();

    // The chart itself, and its table view twin.
    expect(screen.getByRole('img', { name: /Barbell Row estimated one-rep max/ })).toBeTruthy();
    const table = screen.getByRole('table', { name: /Barbell Row estimated one-rep max/ });
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);

    // Loads in the user's units, on the chart and in its table.
    expect(within(table).getAllByRole('cell').some((c) => /lb/.test(c.textContent ?? ''))).toBe(true);
  });

  it('switches the chart when another exercise is picked', () => {
    render(<AnalysisView model={model(history())} onStart={() => {}} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Exercise' }), { target: { value: 'bench-press' } });
    expect(screen.getByRole('img', { name: /Bench Press estimated one-rep max/ })).toBeTruthy();
  });

  it('states every volume band in words and never as a cap', () => {
    render(<AnalysisView model={model(history())} onStart={() => {}} />);

    expect(screen.getByText('Weekly sets per muscle')).toBeTruthy();
    // The advisory note travels with the grid.
    expect(screen.getByText(VOLUME_ADVISORY_NOTE)).toBeTruthy();
    // A word beside every colour: the legend plus a per-row status.
    expect(screen.getAllByText('productive').length).toBeGreaterThan(0);
    expect(screen.getAllByText('below MEV').length).toBeGreaterThan(0);

    const grid = screen.getByRole('img', { name: /Weekly sets per muscle/ });
    expect(within(grid).getByText('Chest')).toBeTruthy();
    expect(within(grid).getByText('Hamstrings')).toBeTruthy();
  });

  it('leads on absolute load and only then describes the acute:chronic ratio', () => {
    render(<AnalysisView model={model(history())} onStart={() => {}} />);

    expect(screen.getAllByText('Acute load (7-day)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('vs last week').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+8%').length).toBeGreaterThan(0);

    // The ratio is present, banded in words, and hedged verbatim.
    expect(screen.getAllByText('1.08').length).toBeGreaterThan(0);
    expect(screen.getAllByText('near your usual').length).toBeGreaterThan(0);
    expect(screen.getAllByText(LOAD_NOTES.acwrDescriptive).length).toBeGreaterThan(0);

    // Fitness / fatigue / form are named, not just coloured.
    expect(screen.getAllByText('Fitness').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fatigue').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Productive').length).toBeGreaterThan(0);
    expect(screen.getByRole('table', { name: 'Training load by day' })).toBeTruthy();
  });

  it('lists PRs and declines to schedule a deload, citing why', () => {
    render(<AnalysisView model={model(history())} onStart={() => {}} />);
    expect(screen.getByText('Personal records')).toBeTruthy();
    expect(screen.getByText('Deload')).toBeTruthy();
    expect(screen.getByText(/Coleman/)).toBeTruthy();
    expect(screen.getByText('Push / pull balance')).toBeTruthy();
  });
});

describe('MuscleVolumeGrid', () => {
  const weeks = [0, 1, 2].map((i) => {
    const weekStart = addDays(weekStartMonday(TODAY), -7 * (2 - i));
    return { weekStart, muscles: weeklySetsByMuscle(history(), TODAY, DEFAULT_LANDMARKS, { weekStart }) };
  });

  it('puts the status word in every cell title, not just in the colour', () => {
    const { container } = render(<MuscleVolumeGrid weeks={weeks} />);
    const titled = Array.from(container.querySelectorAll('[title]'));
    expect(titled.length).toBe(15 * weeks.length);
    for (const cell of titled) {
      const title = cell.getAttribute('title') ?? '';
      expect(title).toMatch(/week of .+: .+ sets — .+/);
    }
    // Every row also ends in a readable band, so the word is on screen too.
    expect(screen.getAllByText(/^\d+(\.\d)? · (below MEV|building|productive|high)$/).length).toBe(15);
  });

  it('carries its own hidden table with the landmarks spelled out', () => {
    render(<MuscleVolumeGrid weeks={weeks} />);
    const table = screen.getByRole('table', { name: /Weekly sets per muscle/ });
    expect(within(table).getAllByRole('row')).toHaveLength(16); // header + 15 muscles
    expect(within(table).getAllByRole('cell').some((c) => /MEV \d+, MAV \d+, MRV \d+/.test(c.textContent ?? ''))).toBe(true);
  });

  it('names the band of every week in the table, not only the current one', () => {
    render(<MuscleVolumeGrid weeks={weeks} />);
    const table = screen.getByRole('table', { name: /Weekly sets per muscle/ });
    const cells = within(table).getAllByRole('cell');
    // 15 muscles × (3 past weeks + the "this week" summary column).
    expect(cells).toHaveLength(15 * (weeks.length + 1));
    cells.forEach((cell, i) => {
      const text = cell.textContent ?? '';
      // The last column of each row is the current week's fuller summary; every
      // other column is a past week, and used to be a bare set count.
      if (i % (weeks.length + 1) < weeks.length) {
        expect(text).toMatch(/^\d+(\.\d)? sets — (below MEV|building|productive|high)$/);
      } else {
        expect(text).toMatch(/^\d+(\.\d)? sets — .+ \(MEV \d+, MAV \d+, MRV \d+\)$/);
      }
    });
    // The grid it describes is one role="img", so nothing inside it is
    // announced — the table is the only place a screen reader gets the bands.
    expect(within(screen.getByRole('img', { name: /Weekly sets per muscle/ })).queryAllByRole('cell')).toHaveLength(0);
  });

  it('separates the bands by fill pattern, not by hue alone', () => {
    // Yellow "below MEV" against green "productive" is the deuteranopia pair,
    // so the four bands must differ in something other than colour.
    const fill = (s: Parameters<typeof volumeCellStyle>[0]) => (volumeCellStyle(s).backgroundImage ?? 'solid').replace(/\s+/g, '');
    const fills = (['below-mev', 'building', 'productive', 'high'] as const).map(fill);
    expect(new Set(fills).size).toBe(4);

    const { container } = render(<MuscleVolumeGrid weeks={weeks} />);
    const filled = Array.from(container.querySelectorAll('[title]')).filter((el) => (el as HTMLElement).style.backgroundColor);
    expect(filled.length).toBeGreaterThan(0);
    for (const cell of filled) {
      const el = cell as HTMLElement;
      const band = /— (.+)$/.exec(el.getAttribute('title') ?? '')?.[1];
      // "below the volume most people need to grow" is the below-MEV phrase.
      const status = band?.startsWith('below the volume') ? 'below-mev' : band === 'productive' ? 'productive' : band === 'building' ? 'building' : 'high';
      expect((el.style.backgroundImage || 'solid').replace(/\s+/g, '')).toBe(fill(status));
    }
  });

  it('renders an honest line rather than an empty grid with no weeks', () => {
    render(<MuscleVolumeGrid weeks={[]} />);
    expect(screen.getByText(/No sets logged yet/)).toBeTruthy();
  });
});

describe('LoadGauge — where the load came from', () => {
  const load = (patch: Partial<TrainingContext['load']>): TrainingContext['load'] => ({
    ...emptyTraining().load,
    acute7: 412,
    chronic28: 380,
    acwr: 1.08,
    acwrBand: 'sweet',
    weekOverWeekPct: 8,
    fitness: 51,
    fatigue: 43,
    form: 8,
    formBand: 'productive',
    weeklyLoad: 1240,
    tauIsPrior: false,
    ...patch,
  });

  it('hedges a WHOOP-derived series while the strain conversion is still the prior', () => {
    render(<LoadGauge load={load({ source: 'whoop', whoopIsPrior: true })} />);
    expect(screen.getByText(LOAD_NOTES.whoopPrior)).toBeTruthy();
    // A mixed week rests on the same conversion for its WHOOP half.
    cleanup();
    render(<LoadGauge load={load({ source: 'mixed', whoopIsPrior: true })} />);
    expect(screen.getByText(LOAD_NOTES.whoopPrior)).toBeTruthy();
  });

  it('drops the hedge once the conversion is fitted to the user', () => {
    render(<LoadGauge load={load({ source: 'whoop', whoopIsPrior: false })} />);
    expect(screen.queryByText(LOAD_NOTES.whoopPrior)).toBeNull();
  });

  it('says nothing about a conversion that never ran', () => {
    // Logged sessions carry their own sRPE load; there is no strain to convert.
    render(<LoadGauge load={load({ source: 'logged', whoopIsPrior: true })} />);
    expect(screen.queryByText(LOAD_NOTES.whoopPrior)).toBeNull();
    cleanup();
    // An older/hand-built context that never carried the flag says nothing either.
    render(<LoadGauge load={load({ source: 'whoop' })} />);
    expect(screen.queryByText(LOAD_NOTES.whoopPrior)).toBeNull();
  });

  it('still carries the τ-prior note independently', () => {
    render(<LoadGauge load={load({ source: 'whoop', whoopIsPrior: true, tauIsPrior: true })} />);
    expect(screen.getByText(LOAD_NOTES.whoopPrior)).toBeTruthy();
    expect(screen.getByText(LOAD_NOTES.tauPrior)).toBeTruthy();
  });
});
