/**
 * Heatmap — GitHub-style calendar for adherence (SPEC §3: protein-hit days,
 * calorie-hit days, logging streak).
 *
 * 7 rows (Mon → Sun) × N week columns with 2 px surface gaps, a single-hue
 * sequential ramp (opacity 0.18 / 0.45 / 0.72 / 1 of `color`) for levels
 * 0–3, and an outlined empty cell for `null` (nothing logged). Month labels
 * on top, M / W / F on the left. Every past cell is focusable and carries a
 * <title>; arrow keys move between cells and the tooltip mirrors the title.
 * The hidden table lists every day, so nothing is gated behind hover.
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ISODate } from '../../data/types';
import { MONTH_SHORT, addDays, formatDateShort, parseISODate } from '../../lib/dates';
import { bucketStart } from './chartUtils';
import { ChartTooltip, FONT, HiddenTable, SVG_CLASS, TOKEN, useMeasuredWidth } from './shared';

export type HeatLevel = 0 | 1 | 2 | 3;

export interface HeatmapDay {
  d: ISODate;
  /** 0 = logged but missed … 3 = best; null = nothing logged (outlined cell). */
  level: HeatLevel | null;
  /** Tooltip / title text, e.g. "Protein 182 g — hit". */
  title: string;
}

export interface HeatmapProps {
  days: HeatmapDay[];
  /** Number of week columns. Default 12. */
  weeks?: number;
  /** Ramp hue. Default var(--hx-green). */
  color?: string;
  /** Labels for levels 0–3, drawn under the grid with their swatches. */
  legend?: string[];
  ariaLabel: string;
  /** Last day shown (defaults to the latest `days` entry). Pass today so the grid ends on today. */
  end?: ISODate;
}

/** Opacity per level — single-hue sequential steps that stay legible on the dark card. */
export const LEVEL_OPACITY: Record<HeatLevel, number> = { 0: 0.18, 1: 0.45, 2: 0.72, 3: 1 };

const LEFT = 20; // weekday labels
const TOP = 16; // month labels
const GAP = 2; // surface gap
const WEEKDAY_ROWS: Array<[number, string]> = [
  [0, 'M'],
  [2, 'W'],
  [4, 'F'],
];

export default function Heatmap({ days, weeks = 12, color = TOKEN.green, legend, ariaLabel, end }: HeatmapProps) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<string | null>(null);
  const cellRefs = useRef<Record<string, SVGRectElement | null>>({});

  const byDate = new Map(days.map((x) => [x.d, x]));
  const latest = end ?? days.reduce<ISODate | null>((m, x) => (m === null || x.d > m ? x.d : m), null);
  const cols = Math.max(1, Math.round(weeks));

  if (!latest) {
    return (
      <div role="img" aria-label={ariaLabel} className="text-[13px] text-hx-text2 py-6 text-center">
        Nothing logged yet.
      </div>
    );
  }

  // Columns are Monday-start weeks ending with the week containing `latest`.
  const lastMonday = bucketStart(latest, 'week');
  const firstMonday = addDays(lastMonday, -(cols - 1) * 7);
  const cell = Math.min(24, Math.max(10, Math.floor((width - LEFT - GAP * (cols - 1)) / cols)));
  const pitch = cell + GAP;
  const svgW = LEFT + cols * pitch - GAP;
  const svgH = TOP + 7 * pitch - GAP;

  // Month labels where the column's Monday changes month; drop a label if the
  // next one lands within 2 columns so short partial months don't collide.
  const monthLabels: Array<{ col: number; text: string }> = [];
  let prevMonth = -1;
  for (let c = 0; c < cols; c++) {
    const m = parseISODate(addDays(firstMonday, c * 7)).getMonth();
    if (m !== prevMonth) {
      const prev = monthLabels[monthLabels.length - 1];
      if (prev && c - prev.col < 3) monthLabels.pop();
      monthLabels.push({ col: c, text: MONTH_SHORT[m] });
      prevMonth = m;
    }
  }

  const dateAt = (col: number, row: number) => addDays(firstMonday, col * 7 + row);
  const cellsInOrder: ISODate[] = [];
  for (let c = 0; c < cols; c++) for (let r = 0; r < 7; r++) {
    const d = dateAt(c, r);
    if (d <= latest) cellsInOrder.push(d);
  }

  const focusCell = (d: ISODate) => {
    setActive(d);
    cellRefs.current[d]?.focus();
  };

  const setFromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left - LEFT) / pitch);
    const row = Math.floor((e.clientY - rect.top - TOP) / pitch);
    if (col < 0 || col >= cols || row < 0 || row >= 7) return setActive(null);
    const d = dateAt(col, row);
    setActive(d <= latest ? d : null);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const cur = active ?? cellsInOrder[cellsInOrder.length - 1];
    let next: ISODate | null = cur;
    switch (e.key) {
      case 'ArrowLeft':
        next = addDays(cur, -7);
        break;
      case 'ArrowRight':
        next = addDays(cur, 7);
        break;
      case 'ArrowUp':
        next = addDays(cur, -1);
        break;
      case 'ArrowDown':
        next = addDays(cur, 1);
        break;
      case 'Home':
        next = cellsInOrder[0];
        break;
      case 'End':
        next = cellsInOrder[cellsInOrder.length - 1];
        break;
      case 'Escape':
        e.preventDefault();
        setActive(null);
        return;
      default:
        return;
    }
    e.preventDefault();
    if (next >= firstMonday && next <= latest) focusCell(next);
  };

  const activeEntry = active ? byDate.get(active) : undefined;
  const activeCol = active ? Math.floor((parseISODate(active).getTime() - parseISODate(firstMonday).getTime()) / (7 * 86_400_000)) : 0;

  return (
    <div ref={ref} className="relative w-full">
      <div className={svgW > width ? 'overflow-x-auto hx-no-scrollbar' : ''}>
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          role="group"
          aria-label={ariaLabel}
          className={SVG_CLASS}
          style={{ touchAction: 'pan-y' }}
          onPointerMove={setFromPointer}
          onPointerDown={setFromPointer}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKeyDown}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(null);
          }}
        >
          {monthLabels.map((m) => (
            <text key={m.col} x={LEFT + m.col * pitch} y={FONT.small} fontSize={FONT.small} fill={TOKEN.muted}>
              {m.text}
            </text>
          ))}
          {WEEKDAY_ROWS.map(([row, t]) => (
            <text key={t} x={LEFT - 6} y={TOP + row * pitch + cell / 2} textAnchor="end" dominantBaseline="middle" fontSize={FONT.small} fill={TOKEN.muted}>
              {t}
            </text>
          ))}
          {cellsInOrder.map((d) => {
            const idx = Math.round((parseISODate(d).getTime() - parseISODate(firstMonday).getTime()) / 86_400_000);
            const col = Math.floor(idx / 7);
            const row = idx % 7;
            const entry = byDate.get(d);
            const level = entry && entry.level !== null ? entry.level : null;
            const x = LEFT + col * pitch;
            const yy = TOP + row * pitch;
            const isActive = active === d;
            const title = entry ? entry.title : 'No data';
            return (
              <rect
                key={d}
                ref={(el) => {
                  cellRefs.current[d] = el;
                }}
                x={level === null ? x + 0.5 : x}
                y={level === null ? yy + 0.5 : yy}
                width={level === null ? cell - 1 : cell}
                height={level === null ? cell - 1 : cell}
                rx={2}
                fill={level === null ? 'none' : color}
                fillOpacity={level === null ? 1 : LEVEL_OPACITY[level]}
                stroke={isActive ? TOKEN.text2 : level === null ? TOKEN.border : 'none'}
                strokeWidth={1}
                tabIndex={0}
                role="img"
                aria-label={`${formatDateShort(d)}: ${title}`}
                className="outline-none"
                onFocus={() => setActive(d)}
              >
                <title>{`${formatDateShort(d)}: ${title}`}</title>
              </rect>
            );
          })}
        </svg>
      </div>

      {active ? (
        <ChartTooltip
          x={LEFT + activeCol * pitch + cell / 2}
          width={Math.min(width, svgW)}
          rows={[
            {
              value: activeEntry ? activeEntry.title : 'No data',
              label: formatDateShort(active),
              color,
              kind: 'rect',
              opacity: activeEntry && activeEntry.level !== null ? LEVEL_OPACITY[activeEntry.level] : 0.1,
            },
          ]}
        />
      ) : null}

      <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-hx-muted" aria-hidden>
        <li className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-[2px] border border-hx-border" />
          <span>Not logged</span>
        </li>
        {([0, 1, 2, 3] as HeatLevel[]).map((lv) => (
          <li key={lv} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: color, opacity: LEVEL_OPACITY[lv] }} />
            {legend?.[lv] ? <span>{legend[lv]}</span> : null}
          </li>
        ))}
      </ul>

      <HiddenTable
        caption={ariaLabel}
        head={['Date', 'Status']}
        rows={cellsInOrder.map((d) => [d, byDate.get(d)?.title ?? 'No data'])}
      />
    </div>
  );
}
