/** Drive the add → compare flow and screenshot each stage. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = new URL('../shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

await page.goto(`${BASE}/restaurant/patty-theory`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const addButtons = page.getByRole('button', { name: /^Add .* to cart$/ });
await addButtons.nth(0).click();
await page.waitForTimeout(300);
await addButtons.nth(1).click();
await page.waitForTimeout(300);
await addButtons.nth(2).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}flow-1-added.png` });
console.log('✓ added items');

await page.getByRole('button', { name: 'Compare checkouts' }).click();
await page.waitForTimeout(2600); // staggered quotes settle
await page.screenshot({ path: `${OUT}flow-2-compare.png`, fullPage: true });
console.log('✓ compare settled');

await page.getByRole('button', { name: 'Fees, taxes & tip' }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}flow-3-breakdown.png` });
console.log('✓ breakdown open');

const memberToggle = page.getByRole('switch').first();
await memberToggle.click();
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}flow-4-membership.png` });
console.log('✓ membership re-quote');

await browser.close();
console.log(`Shots in ${OUT}`);
