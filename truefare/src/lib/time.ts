export type MealPeriod = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'latenight';

/** Daypart buckets: 6–10:30 / 10:30–14 / 14–17 / 17–21:30 / 21:30–6. */
export function daypartOf(date: Date): MealPeriod {
  const mins = date.getHours() * 60 + date.getMinutes();
  if (mins >= 360 && mins < 630) return 'breakfast';
  if (mins >= 630 && mins < 840) return 'lunch';
  if (mins >= 840 && mins < 1020) return 'snack';
  if (mins >= 1020 && mins < 1290) return 'dinner';
  return 'latenight';
}

export function currentDaypart(): MealPeriod {
  return daypartOf(new Date());
}

export const DAYPART_LABEL: Record<MealPeriod, string> = {
  breakfast: 'morning',
  lunch: 'lunchtime',
  snack: 'afternoon',
  dinner: 'evening',
  latenight: 'late night',
};

/** Adjacency for time-of-day fit scoring. */
const ORDER: MealPeriod[] = ['breakfast', 'lunch', 'snack', 'dinner', 'latenight'];

export function daypartDistance(a: MealPeriod, b: MealPeriod): number {
  const ia = ORDER.indexOf(a);
  const ib = ORDER.indexOf(b);
  const d = Math.abs(ia - ib);
  return Math.min(d, ORDER.length - d); // circular
}
