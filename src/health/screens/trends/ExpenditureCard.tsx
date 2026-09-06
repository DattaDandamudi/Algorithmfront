/**
 * Expenditure (TDEE) card — SPEC §3, engine v3 (§1b).
 *
 * What is drawn is a **posterior**, not a smoothed point estimate: one 1-D
 * Kalman over TDEE that starts at the Mifflin prior and folds in, per 7-day
 * block, a weight-derived observation (`intake − Δlevel·ρ ÷ span`, with the
 * glycogen water removed) and a steps observation. So the line carries a
 * shaded 90% credible band, and a block that missed its gate is not a gap —
 * the posterior held its mean and widened its interval, which is exactly what
 * the band shows and what the copy says.
 *
 * Three things the old card could not say, all of which the user needs to read
 * the number honestly, are on the face of it now: the interval, the coverage
 * ("5 of 7 days logged" — how much of the block was actually recorded) and the
 * energy-density factor ρ in use, which is Forbes/Hall for this user's body
 * composition rather than the folk 3,500 kcal per lb.
 *
 * The displayed TDEE, its validity and the suggestion all come from
 * `ctx.expenditure` — the same evaluation the Today tile and the coach show —
 * and the range toggle only decides how many blocks are plotted (review R2-1).
 */
import { Flame } from 'lucide-react';
import type { CoachContext, Targets } from '../../data/types';
import { COACH_CHIPS, MIN_BLOCK_LOG_DAYS, MIN_BLOCK_WEIGH_INS, minimumIntakeKcalV3 } from '../../engine';
import { formatDateShort } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Button, EmptyState } from '../../ui';
import { TimeSeriesChart } from '../../ui/charts';
import { Note, Readout, TrendCard } from './TrendCard';
import type { RangeWindow } from './series';
import { coverageCaption, intakeSuggestion, tdeeChartRange, v3BlockProgress, weekEndingFormat, type TdeeSeries } from './summaries';

/** How a suggestion earned its size, in the user's terms. */
const TIER_NOTE: Record<'none' | 'fine' | 'coarse', string> = {
  none: 'No change earned yet — one ordinary week inside the band is not evidence of anything.',
  fine: 'A nudge from one block: the rate missed your band on one side with enough confidence to be worth 50–100 kcal, not more.',
  coarse: 'A real move: two blocks in a row missed the band on the same side, so the target follows rather than the noise.',
};

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
  const exp = ctx.expenditure;
  const plotted = tdee.points.length;
  const measured = result.blocks.filter((b) => b.valid).length;
  const nextUpdate = result.nextUpdate ? formatDateShort(result.nextUpdate) : null;
  const coverage = coverageCaption(result.coverage);
  const action = (
    <Button variant="ghost" size="sm" onClick={() => onOpenCoach(COACH_CHIPS[3])}>
      Ask the coach
    </Button>
  );

  // Nothing has closed yet: the posterior is still the prior, so there is a
  // number but no series — say where it came from instead of drawing a dot.
  if (plotted === 0) {
    return (
      <TrendCard
        title="Expenditure"
        caption={nextUpdate ? `Calibrating · first measured block ${nextUpdate}` : 'Estimated weekly from intake and your weight trend'}
        action={action}
        empty={
          <EmptyState
            icon={<Flame />}
            title="Expenditure not measured yet"
            hint={result.reason}
            action={{ label: 'Log weight', onClick: onLogWeight }}
          />
        }
      />
    );
  }

  const block = v3BlockProgress(result, ctx.today);
  const suggestion = intakeSuggestion(ctx);
  const minimum = minimumIntakeKcalV3(targets);
  const weeksLabel = `last ${plotted} weekly block${plotted === 1 ? '' : 's'}`;
  const nextText = nextUpdate ? `Next update ${nextUpdate}` : 'Next update after a full week';
  const density = result.density;

  return (
    <TrendCard
      title="Expenditure"
      caption={`${coverage} in the latest block · ${measured} of ${plotted} blocks measured${nextUpdate ? ` · next ${nextUpdate}` : ''}`}
      action={action}
      meaning={`Your intake minus the calories your trend change represents, folded into a running estimate rather than recomputed from scratch each week. A block needs ${MIN_BLOCK_WEIGH_INS}+ weigh-ins and ${MIN_BLOCK_LOG_DAYS}+ logged days to measure anything; without them the estimate holds and the band widens, which is the honest answer to a week you did not log.`}
    >
      <div className="grid grid-cols-2 gap-3">
        <Readout
          label={exp.valid ? 'Expenditure' : 'Best estimate'}
          value={result.tdee}
          unit="kcal/day"
          sub={`${fmt(result.lo)}–${fmt(result.hi)} kcal (90%)`}
          tone={exp.valid ? undefined : 'yellow'}
        />
        <Readout
          label="This block"
          value={`${block.weighIns}/7`}
          unit="weigh-ins"
          sub={`${nextText} · ${block.intakeDays}/7 logged days so far`}
          tone={block.tone === 'neutral' ? undefined : block.tone}
        />
      </div>

      <TimeSeriesChart
        ariaLabel={`Expenditure posterior with its 90% credible band, ${weeksLabel}`}
        range={tdeeChartRange(win.range)}
        data={tdee.points}
        band={tdee.band}
        connectDots
        annotations={tdee.annotations}
        reference={{ value: targets.kcal, label: 'Intake target' }}
        unit="kcal"
        label="Expenditure"
        bandLabel="90% range"
        dateFormat={weekEndingFormat}
        emptyText={`No block has closed in the ${weeksLabel} yet.`}
      />

      <div className="flex flex-col gap-1.5">
        {!exp.valid && (
          <Note tone="yellow">
            Still settling — the 90% interval is ±{fmt(result.ci)} kcal, too wide to move a calorie target on, so nothing here
            changes your numbers yet.
          </Note>
        )}
        <Note tone={block.tone}>{block.text}</Note>
        {suggestion ? (
          <>
            <Note tone={suggestion.tone}>
              <span className="font-semibold text-hx-text">{suggestion.text}</span>
            </Note>
            <p className="pl-3.5 text-[12px] leading-4 text-hx-text2">{exp.reason}</p>
            <p className="pl-3.5 text-[12px] leading-4 text-hx-muted">{TIER_NOTE[suggestion.tier]}</p>
          </>
        ) : (
          <Note tone="neutral">{exp.reason}</Note>
        )}
        <p className="pl-3.5 text-[12px] leading-4 text-hx-muted">
          Weight change is converted at {density.label} — the Forbes/Hall factor rather than the folk 3,500 kcal per lb, which is
          only right for a much fattier body than most.
          {density.source === 'assumed'
            ? ' Body fat is a population estimate here; add your height or a body-fat percentage in Settings and this becomes yours.'
            : ''}{' '}
          Suggestions never push fat under the {fmt(targets.fatFloor)} g floor: {fmt(minimum)} kcal is the lowest intake that
          still fits {fmt(targets.protein)} g protein.
        </p>
      </div>
    </TrendCard>
  );
}
