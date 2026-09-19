/**
 * The three findings the Analysis view is willing to state outright: a
 * plateau, a deload, and a push/pull or squat/hinge imbalance, each under its
 * own running head (no rule; the section's three rules are spent above) as a
 * note in its tone or a ledger.
 *
 * Each one is deliberately bounded:
 * - a **plateau** is "trained ≥ 4× in 21 days, estimated max up ≤ 1% while
 *   mean RPE rose ≥ 0.5" — working harder for the same result — and the note
 *   shows those numbers rather than the word alone;
 * - a **deload** is only ever reactive. Coleman et al. (2024, PeerJ) found a
 *   scheduled mid-program deload gave no hypertrophy benefit, so when nothing
 *   is triggering one the section says why it is not putting one on the
 *   calendar (`DELOAD_SCHEDULE_NOTE`);
 * - **balance** is a ratio of logged sets over 28 days, flagged outside
 *   0.67–1.5 and reported as "you are doing more of X than Y", never as an
 *   injury prediction.
 *
 * No callout is derived from a volume landmark or from the acute:chronic
 * ratio, which are the two numbers this release is not allowed to act on.
 */
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
  className?: string;
}

export default function Callouts({ training, className = '' }: CalloutsProps) {
  const { plateaus, deload, balance } = training;
  const pushPullOff = !isBalancedRatio(balance.pushPull);
  const squatHingeOff = !isBalancedRatio(balance.squatHinge);

  return (
    <>
      <TrainCard title="Stalled lifts" caption={plateaus.length ? `${plateaus.length} flagged` : 'None flagged'} className={className}>
        {plateaus.length === 0 ? (
          <p className="hx-body text-hx-text2">
            Nothing has stalled: no lift you have trained at least four times in the last three weeks is holding its
            estimated max while its RPE climbs.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {plateaus.map((p) => (
              <li key={p.exerciseId} className="hx-note border-hx-yellow flex flex-col">
                <p className="hx-body">
                  <span className="hx-label text-hx-yellow">
                    <span className="hx-tone mr-1.5" aria-hidden />
                    Stalled
                  </span>{' '}
                  {p.name} has stalled.
                </p>
                <p className="hx-cap mt-1">
                  {p.sessions} sessions in three weeks, estimated max {fmt(p.gainPct, 1)}%, mean RPE {p.rpeTrend >= 0 ? '+' : '−'}
                  {fmt(Math.abs(p.rpeTrend), 1)} across the window.
                </p>
              </li>
            ))}
          </ul>
        )}
      </TrainCard>

      <TrainCard title="Deload" caption={deload.recommended ? 'Recommended' : 'Not right now'} className="mt-10">
        {deload.recommended ? (
          <div className="hx-note border-hx-yellow flex flex-col">
            <p className="hx-body">
              <span className="hx-label text-hx-yellow">
                <span className="hx-tone mr-1.5" aria-hidden />
                Caution
              </span>{' '}
              Two or more things are pointing the same way. A week at −{DELOAD_SET_CUT_PCT}% sets and −{DELOAD_LOAD_CUT_PCT}% load is
              the usual answer.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {deload.reasons.map((r) => (
                <li key={r} className="hx-cap">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="hx-body text-hx-text2">{DELOAD_SCHEDULE_NOTE}</p>
        )}
      </TrainCard>

      <TrainCard title="Push / pull balance" caption="Sets over the last 28 days" className="mt-10">
        <ul className="hx-ledger -mt-3">
          <BalanceRow label="Push : pull" ratio={balance.pushPull} off={pushPullOff} more="pushing" less="pulling" />
          <BalanceRow label="Squat : hinge" ratio={balance.squatHinge} off={squatHingeOff} more="squatting" less="hinging" />
        </ul>
        <Note className="mt-3">
          Balanced is {fmt(BALANCE_MIN, 2)}–{fmt(BALANCE_MAX, 2)}. A ratio needs sets on both sides to mean anything, so
          one-sided weeks report nothing rather than a large number.
        </Note>
      </TrainCard>
    </>
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
  const flagged = off && ratio !== null;
  return (
    <li className="hx-row">
      <div className="flex items-baseline justify-between gap-3">
        <span className="hx-body">{label}</span>
        <span className="hx-fig-sm text-hx-text shrink-0">{ratio === null ? '—' : fmt(ratio, 2)}</span>
      </div>
      <span className={`hx-label mt-0.5 ${flagged ? 'text-hx-yellow' : ''}`}>
        {flagged && <span className="hx-tone mr-1.5" aria-hidden />}
        {word}
      </span>
    </li>
  );
}
