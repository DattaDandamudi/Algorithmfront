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
  const action = (
    <Button variant="ghost" size="sm" onClick={() => onOpenCoach(COACH_CHIPS[3])}>
      Ask the coach
    </Button>
  );

  if (result.smoothedTdee === null) {
    return (
      <TrendCard
        title="Expenditure"
        caption="Reverse-calculated weekly from intake and trend"
        action={action}
        empty={<EmptyState icon={<Flame />} title="Expenditure not calibrated yet" hint={result.reason} action={{ label: 'Log weight', onClick: onLogWeight }} />}
      />
    );
  }

  const updates = tdee.annotations.length;
  const gateOk = result.weighInsThisWeek >= GATE_DAYS && result.intakeDaysThisWeek >= GATE_DAYS;
  const suggestion = intakeSuggestion(ctx);
  const minimum = minimumIntakeKcal(targets);

  return (
    <TrendCard
      title="Expenditure"
      caption={`${updates} calibrated week${updates === 1 ? '' : 's'} of ${result.weeks.length} · ${win.label}`}
      action={action}
      meaning={`Estimated each week from what you ate minus the calories your trend change represents (3,500 kcal per lb). It only updates on weeks with ${GATE_DAYS}+ weigh-ins, and suggestions never push fat under the ${fmt(targets.fatFloor)} g floor.`}
    >
      <div className="grid grid-cols-2 gap-3">
        <Readout
          label={result.valid ? 'Expenditure' : 'Last calibrated'}
          value={result.tdee ?? result.smoothedTdee}
          unit="kcal/day"
          sub={result.valid ? `Intake target ${fmt(targets.kcal)} kcal` : 'This week missed the gate'}
          tone={result.valid ? undefined : 'yellow'}
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
        ariaLabel={`Expenditure, weekly estimates, ${win.label}`}
        range={tdeeChartRange(win.range)}
        data={tdee.points}
        connectDots
        annotations={tdee.annotations}
        reference={{ value: targets.kcal, label: 'Intake target' }}
        unit="kcal"
        label="Expenditure"
        dateFormat={weekEndingFormat}
        emptyText={`No calibrated week in the ${win.label} yet.`}
      />

      <div className="flex flex-col gap-1.5">
        {suggestion ? (
          <>
            <Note tone={suggestion.tone}>
              <span className="font-semibold text-hx-text">{suggestion.text}</span>
            </Note>
            <p className="pl-3.5 text-[12px] leading-4 text-hx-text2">{ctx.expenditure.reason}</p>
          </>
        ) : (
          <Note tone="neutral">{ctx.expenditure.reason}</Note>
        )}
        <p className="pl-3.5 text-[12px] leading-4 text-hx-muted">
          Never below the {fmt(targets.fatFloor)} g fat floor — {fmt(minimum)} kcal is the lowest intake that still fits {fmt(targets.protein)} g protein.
        </p>
      </div>
    </TrendCard>
  );
}
