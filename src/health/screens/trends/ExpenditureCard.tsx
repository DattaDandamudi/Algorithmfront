/**
 * Expenditure (TDEE) card — SPEC §3 / §6.2 (MacroFactor pattern).
 *
 * Weekly smoothed TDEE points — reverse-calc `intake − Δtrend × 3,500 kcal/lb
 * ÷ 7`, gated on ≥5 weigh-ins AND ≥5 intake days, then EWMA-smoothed so one
 * week's fluid swing can't over-correct — with ▼ markers on the weeks the
 * estimate updated and the intake target as a hairline. Readouts: the current
 * (or last calibrated) TDEE, this week's counts against the gate, and the
 * `recommendIntake` verdict ("Hold 1,950 kcal" / "Adjust to 1,850 kcal — …")
 * with the fat-floor note. No calibrated week ever → the §1 empty state.
 *
 * The displayed TDEE, its validity and the suggestion all come from
 * `ctx.expenditure` — the same evaluation the Today tile and the coach show —
 * and the range toggle only decides how many weekly points are plotted
 * (review R2-1); the caption counts those weekly estimates, not calendar days
 * (R2-8), because 7D still plots four weekly updates.
 */
import { Flame } from 'lucide-react';
import type { CoachContext, Targets } from '../../data/types';
import { COACH_CHIPS, minimumIntakeKcal } from '../../engine';
import { fmt } from '../../lib/format';
import { Button, EmptyState } from '../../ui';
import { TimeSeriesChart } from '../../ui/charts';
import { Note, Readout, TrendCard } from './TrendCard';
import type { RangeWindow } from './series';
import { intakeSuggestion, tdeeChartRange, weekEndingFormat, type TdeeSeries } from './summaries';

/** §6.2: a week needs at least this many weigh-ins and intake days to update the estimate. */
export const GATE_DAYS = 5;

export interface ExpenditureCardProps {
  ctx: CoachContext;
  tdee: TdeeSeries;
  win: RangeWindow;
  targets: Targets;
  onLogWeight: () => void;
  onOpenCoach: (prompt: string) => void;
}

export default function ExpenditureCard({ ctx, tdee, win, targets, onLogWeight, onOpenCoach }: ExpenditureCardProps) {
  const { result } = tdee;
  const plotted = tdee.points.length;
  const updates = tdee.points.filter((p) => p.value !== null).length;
  const action = (
    <Button variant="ghost" size="sm" onClick={() => onOpenCoach(COACH_CHIPS[3])}>
      Ask the coach
    </Button>
  );

  // Empty only when nothing has ever calibrated — neither today's window nor any plotted week.
  if (result.smoothedTdee === null && updates === 0) {
    return (
      <TrendCard
        title="Expenditure"
        caption="Reverse-calculated weekly from intake and trend"
        action={action}
        empty={<EmptyState icon={<Flame />} title="Expenditure not calibrated yet" hint={result.reason} action={{ label: 'Log weight', onClick: onLogWeight }} />}
      />
    );
  }

  const exp = ctx.expenditure;
  const gateOk = result.weighInsThisWeek >= GATE_DAYS && result.intakeDaysThisWeek >= GATE_DAYS;
  const suggestion = intakeSuggestion(ctx);
  const minimum = minimumIntakeKcal(targets);
  const weeksLabel = `last ${plotted} weekly estimate${plotted === 1 ? '' : 's'}`;

  return (
    <TrendCard
      title="Expenditure"
      caption={`${updates} calibrated of ${plotted} weekly estimates · updates weekly`}
      action={action}
      meaning={`Estimated each week from what you ate minus the calories your trend change represents (3,500 kcal per lb). It only updates on weeks with ${GATE_DAYS}+ weigh-ins, and suggestions never push fat under the ${fmt(targets.fatFloor)} g floor.`}
    >
      <div className="grid grid-cols-2 gap-3">
        <Readout
          label={exp.valid ? 'Expenditure' : 'Last calibrated'}
          value={exp.tdee ?? result.smoothedTdee}
          unit="kcal/day"
          sub={exp.valid ? `Intake target ${fmt(targets.kcal)} kcal` : result.smoothedTdee === null ? 'No calibrated week recently' : 'This week missed the gate'}
          tone={exp.valid ? undefined : 'yellow'}
        />
        <Readout
          label="This week"
          value={`${result.weighInsThisWeek}/7`}
          unit="weigh-ins"
          sub={`${result.intakeDaysThisWeek}/7 intake days · needs ${GATE_DAYS}+ of each`}
          tone={gateOk ? 'green' : 'yellow'}
        />
      </div>

      <TimeSeriesChart
        ariaLabel={`Expenditure, ${weeksLabel}`}
        range={tdeeChartRange(win.range)}
        data={tdee.points}
        connectDots
        annotations={tdee.annotations}
        reference={{ value: targets.kcal, label: 'Intake target' }}
        unit="kcal"
        label="Expenditure"
        dateFormat={weekEndingFormat}
        emptyText={`No calibrated week in the ${weeksLabel} yet.`}
      />

      <div className="flex flex-col gap-1.5">
        {suggestion ? (
          <>
            <Note tone={suggestion.tone}>
              <span className="font-semibold text-hx-text">{suggestion.text}</span>
            </Note>
            <p className="pl-3.5 text-[12px] leading-4 text-hx-text2">{exp.reason}</p>
          </>
        ) : (
          <Note tone="neutral">{exp.reason}</Note>
        )}
        <p className="pl-3.5 text-[12px] leading-4 text-hx-muted">
          Never below the {fmt(targets.fatFloor)} g fat floor — {fmt(minimum)} kcal is the lowest intake that still fits {fmt(targets.protein)} g protein.
        </p>
      </div>
    </TrendCard>
  );
}
