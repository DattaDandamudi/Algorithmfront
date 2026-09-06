/**
 * Design-system primitives for the health app (SPEC §0). Screens import from
 * '../ui'. Charts live in ./charts (separate barrel).
 */
export { bandColor, bandText, bandBg, bandSoftBg, bandBorder, bandLabel, bandFromScore, deltaTone } from './bands';
export type { Tone } from './bands';

export { default as Ring } from './Ring';
export type { RingProps } from './Ring';
export { default as ProgressRing } from './ProgressRing';
export type { ProgressRingProps } from './ProgressRing';
export { default as Tile } from './Tile';
export type { TileProps, TileDelta } from './Tile';
export { default as Delta } from './Delta';
export type { DeltaProps } from './Delta';
export { default as Sparkline } from './Sparkline';
export type { SparklineProps } from './Sparkline';
export { default as MacroBar } from './MacroBar';
export type { MacroBarProps } from './MacroBar';
export { default as InsightCard } from './InsightCard';
export type { InsightCardProps } from './InsightCard';
export { default as Chip } from './Chip';
export type { ChipProps } from './Chip';
export { default as Stepper } from './Stepper';
export type { StepperProps } from './Stepper';
export { default as Sheet } from './Sheet';
export type { SheetProps } from './Sheet';
export { default as SegmentedControl } from './SegmentedControl';
export type { SegmentedControlProps, SegmentedOption } from './SegmentedControl';
export { default as EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { default as SectionHeader } from './SectionHeader';
export type { SectionHeaderProps } from './SectionHeader';
export { default as Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { ToastHost, toast } from './Toast';
export type { ToastKind, ToastItem } from './Toast';
export { default as Banner } from './Banner';
export type { BannerProps, BannerKind } from './Banner';
