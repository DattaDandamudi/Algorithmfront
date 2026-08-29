/** Drive add → compare → checkout → place order → tracking. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = new URL('../shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

await page.goto(`${BASE}/restaurant/kaiyo-sushi`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const addButtons = page.getByRole('button', { name: /^Add .* to cart$/ });
await addButtons.nth(0).click();
await addButtons.nth(1).click();
await addButtons.nth(2).click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Compare checkouts' }).click();
await page.waitForTimeout(2500);

await page.getByRole('button', { name: /^Checkout with / }).first().click();
await page.waitForTimeout(1600);
await page.getByLabel('Street address').fill('482 Fern Canyon Way');
await page.getByLabel('City').fill('San Francisco');
await page.getByLabel('Card number').fill('4242424242424242');
await page.getByLabel('Expiry').fill('1128');
await page.getByLabel('CVC').fill('314');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}flow-5-checkout.png`, fullPage: true });
console.log('✓ checkout form');

await page.getByRole('button', { name: /^Place order/ }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}flow-6-celebration.png` });
console.log('✓ celebration');

await page.waitForTimeout(2200); // auto-navigate to tracking
await page.screenshot({ path: `${OUT}flow-7-tracking.png`, fullPage: true });
console.log('✓ tracking');

await page.waitForTimeout(35000); // let the delivery progress a few stages
await page.screenshot({ path: `${OUT}flow-8-tracking-later.png`, fullPage: true });
console.log('✓ tracking progressed');

await page.goto(`${BASE}/orders`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}flow-9-orders.png`, fullPage: true });
console.log('✓ orders page');

await browser.close();
console.log(`Shots in ${OUT}`);
