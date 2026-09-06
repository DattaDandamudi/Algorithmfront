/** Public surface of the Trends charts. Import from '../ui/charts'. */
export { default as TimeSeriesChart } from './TimeSeriesChart';
export type { TimeSeriesChartProps, TimeSeriesPoint, TimeSeriesBandPoint, TimeSeriesAnnotation } from './TimeSeriesChart';

export { default as BarSeries, barPath } from './BarSeries';
export type { BarSeriesProps, BarDatum } from './BarSeries';

export { default as Heatmap, LEVEL_OPACITY } from './Heatmap';
export type { HeatmapProps, HeatmapDay, HeatLevel } from './Heatmap';

export { useMeasuredWidth, ChartTooltip, HiddenTable, EmptyFrame, DEFAULT_CHART_WIDTH, TOKEN } from './shared';
export type { TooltipRow } from './shared';

export {
  RANGE_DAYS,
  bucketForRange,
  niceStep,
  niceTicks,
  tickDecimals,
  formatTick,
  extent,
  scaleLinear,
  xPositions,
  sparseIndices,
  xLabelIndices,
  formatTickDate,
  nearestIndex,
  buildPath,
  buildAreaBetween,
  bucketStart,
  aggregateByBucket,
  fillDaily,
  lastDefined,
  definedIndices,
  textWidth,
  autoDecimals,
} from './chartUtils';
export type { ChartRange, Bucket, Aggregation, Pt, DatedValue, LinearScale } from './chartUtils';
