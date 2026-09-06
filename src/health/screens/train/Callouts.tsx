/**
 * The three findings the Analysis view is willing to state outright: a
 * plateau, a deload, and a push/pull or squat/hinge imbalance.
 *
 * Each one is deliberately bounded:
 * - a **plateau** is "trained ≥ 4× in 21 days, estimated max up ≤ 1% while
 *   mean RPE rose ≥ 0.5" — working harder for the same result — and the card
 *   shows those numbers rather than the word alone;
 * - a **deload** is only ever reactive. Coleman et al. (2024, PeerJ) found a
 *   scheduled mid-program deload gave no hypertrophy benefit, so when nothing
 *   is triggering one the card says why it is not putting one on the calendar
 *   (`DELOAD_SCHEDULE_NOTE`);
 * - **balance** is a ratio of logged sets over 28 days, flagged outside
 *   0.67–1.5 and reported as "you are doing more of X than Y", never as an
 *   injury prediction.
 *
 * No callout is derived from a volume landmark or from the acute:chronic
 * ratio, which are the two numbers this release is not allowed to act on.
 */
import { AlertTriangle, Scale, TrendingDown } from 'lucide-react';
import type { TrainingContext } from '../../data/types';
import {
  BALANCE_MAX,
  BALANCE_MIN,
  DELOAD_LOAD_CUT_PCT,
  DELOAD_SCHEDULE_NOTE,
  DELOAD_SET_CUT_PCT,
  isBalancedRatio,
} from '../../engine';
import { fmt } from '../../lib/format';
import { Note, TrainCard } from './TrainCard';

export interface CalloutsProps {
  training: TrainingContext;
}

export default function Callouts({ training }: CalloutsProps) {
  const { plateaus, deload, balance } = training;
  const pushPullOff = !isBalancedRatio(balance.pushPull);
  const squatHingeOff = !isBalancedRatio(balance.squatHinge);

  return (
    <div className="flex flex-col gap-5">
      <TrainCard title="Stalled lifts" caption={plateaus.length ? `${plateaus.length} flagged` : 'None flagged'}>
        {plateaus.length === 0 ? (
          <Note>
            Nothing has stalled: no lift you have trained at least four times in the last three weeks is holding its
            estimated max while its RPE climbs.
          </Note>
        ) : (
          <ul className="flex flex-col gap-3">
            {plateaus.map((p) => (
              <li key={p.exerciseId} className="flex gap-2">
                <TrendingDown className="w-4 h-4 mt-0.5 shrink-0 text-hx-yellow" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[14px] leading-5 text-hx-text">{p.name} has stalled</p>
                  <p className="text-[12px] leading-4 text-hx-text2">
                    {p.sessions} sessions in three weeks · estimated max {fmt(p.gainPct, 1)}% · mean RPE{' '}
                    {p.rpeTrend >= 0 ? '+' : '−'}
                    {fmt(Math.abs(p.rpeTrend), 1)} across the window.
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </TrainCard>

      <TrainCard title="Deload" caption={deload.recommended ? 'Recommended' : 'Not right now'}>
        {deload.recommended ? (
          <div className="flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-hx-yellow" aria-hidden />
            <div className="min-w-0">
              <p className="text-[14px] leading-5 text-hx-text">
                Two or more things are pointing the same way. A week at −{DELOAD_SET_CUT_PCT}% sets and −
                {DELOAD_LOAD_CUT_PCT}% load is the usual answer.
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {deload.reasons.map((r) => (
                  <li key={r} className="text-[12px] leading-4 text-hx-text2">
                    · {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <Note>{DELOAD_SCHEDULE_NOTE}</Note>
        )}
      </TrainCard>

      <TrainCard title="Push / pull balance" caption="Sets over the last 28 days">
        <ul className="flex flex-col gap-2">
          <BalanceRow label="Push : pull" ratio={balance.pushPull} off={pushPullOff} more="pushing" less="pulling" />
          <BalanceRow label="Squat : hinge" ratio={balance.squatHinge} off={squatHingeOff} more="squatting" less="hinging" />
        </ul>
        <Note>
          Balanced is {fmt(BALANCE_MIN, 2)}–{fmt(BALANCE_MAX, 2)}. A ratio needs sets on both sides to mean anything, so
          one-sided weeks report nothing rather than a large number.
        </Note>
      </TrainCard>
    </div>
  );
}

function BalanceRow({
  label,
  ratio,
  off,
  more,
  less,
}: {
  label: string;
  ratio: number | null;
  off: boolean;
  more: string;
  less: string;
}) {
  const word = ratio === null ? 'not enough sets on both sides' : off ? (ratio > BALANCE_MAX ? `more ${more}` : `more ${less}`) : 'balanced';
  return (
    <li className="flex items-center gap-2">
      <Scale className="w-4 h-4 shrink-0 text-hx-muted" aria-hidden />
      <span className="text-[13px] leading-5 text-hx-text">{label}</span>
      <span className="ml-auto text-[13px] leading-5 text-hx-text tabular-nums">{ratio === null ? '—' : fmt(ratio, 2)}</span>
      <span className={`text-[12px] leading-4 w-28 text-right ${off ? 'text-hx-yellow' : 'text-hx-text2'}`}>{word}</span>
    </li>
  );
}
