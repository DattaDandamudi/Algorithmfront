/** Screenshot the search page states + command palette. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = new URL('../shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

await page.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
await page.screenshot({ path: `${OUT}search-1-zero.png`, fullPage: true });
console.log('✓ zero state');

await page.getByLabel('Search dishes and restaurants').fill('spicy noodles');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}search-2-results.png`, fullPage: true });
console.log('✓ results');

await page.getByLabel('Search dishes and restaurants').fill('xylophone');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}search-3-noresults.png` });
console.log('✓ zero results');

await page.keyboard.press('Control+k');
await page.waitForTimeout(600);
await page.keyboard.type('burg');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}search-4-palette.png` });
console.log('✓ palette');

await browser.close();
console.log(`Shots in ${OUT}`);
