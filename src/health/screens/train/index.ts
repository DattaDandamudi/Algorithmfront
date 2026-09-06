/**
 * Public surface of the Train tab (plan §2a).
 *
 * `MuscleVolumeGrid` is exported for the Trends screen (§2c), which draws the
 * same 15 × 12 grid inside its own volume card. It carries its own legend,
 * its hidden table and `VOLUME_ADVISORY_NOTE`, so the "advisory, never a cap"
 * promise travels with the component rather than depending on each caller to
 * remember it.
 *
 * Everything else here is exported for tests and for the Train screen itself;
 * no other tab reads it.
 */
export { default as MuscleVolumeGrid } from './MuscleVolumeGrid';
export type { MuscleVolumeGridProps, VolumeGridWeek } from './MuscleVolumeGrid';

export { default as TodayView } from './TodayView';
export type { TodayViewProps } from './TodayView';
export { default as SessionLogger } from './SessionLogger';
export type { SessionLoggerProps } from './SessionLogger';
export { default as CardioForm } from './CardioForm';
export type { CardioFormProps } from './CardioForm';
export { default as HistoryView } from './HistoryView';
export type { HistoryViewProps } from './HistoryView';
export { default as AnalysisView } from './AnalysisView';
export type { AnalysisViewProps } from './AnalysisView';
export { default as ExercisePicker } from './ExercisePicker';
export type { ExercisePickerProps } from './ExercisePicker';
export { default as FinishSheet } from './FinishSheet';
export type { FinishSheetProps } from './FinishSheet';
export { default as SessionDetail } from './SessionDetail';
export type { SessionDetailProps } from './SessionDetail';
export { default as RestTimer } from './RestTimer';
export type { RestTimerProps } from './RestTimer';
export { default as LoadGauge } from './LoadGauge';
export type { LoadGaugeProps } from './LoadGauge';
export { default as LoadCard } from './LoadCard';
export type { LoadCardProps } from './LoadCard';
export { default as E1rmCard } from './E1rmCard';
export type { E1rmCardProps } from './E1rmCard';
export { default as PrList } from './PrList';
export type { PrListProps } from './PrList';
export { default as Callouts } from './Callouts';
export type { CalloutsProps } from './Callouts';

export { TrainCard, Stat, Note } from './TrainCard';
export type { TrainCardProps, StatProps } from './TrainCard';

export {
  PR_LIST_DAYS,
  VOLUME_WEEKS,
  emptyTraining,
  useAnalysisModel,
  useTrainModel,
} from './useTrainModel';
export type { AnalysisModel, ExerciseOption, TrainModel, VolumeWeek } from './useTrainModel';

export * from './trainUtils';
export * from './draft';
