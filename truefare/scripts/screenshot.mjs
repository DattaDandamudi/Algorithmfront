/**
 * Screenshot every route in light + dark at desktop + mobile sizes.
 * Requires the dev server (or pass BASE_URL). Uses the preinstalled
 * Chromium at /opt/pw-browsers/chromium — never downloads a browser.
 *
 * Usage: node scripts/screenshot.mjs [route ...]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = new URL('../shots/', import.meta.url).pathname;
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

const DEFAULT_ROUTES = ['/', '/search', '/compare', '/orders', '/profile'];
const routes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROUTES;

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const THEMES = ['light', 'dark'];

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let devServer = null;
if (!(await waitForServer(BASE, 2_000))) {
  console.log('Dev server not running — starting one…');
  devServer = spawn('npx', ['vite', '--port', new URL(BASE).port || '5173'], {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'ignore',
    detached: false,
  });
  if (!(await waitForServer(BASE))) {
    console.error('Dev server failed to start');
    process.exit(1);
  }
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXECUTABLE });

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: theme,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    for (const route of routes) {
      const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/[/?=]/g, '-');
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1800); // let entrance animations settle
      await page.screenshot({
        path: `${OUT}${slug}--${vp.name}-${theme}.png`,
        fullPage: route !== '/compare',
      });
      console.log(`✓ ${slug} (${vp.name}, ${theme})`);
    }
    await context.close();
  }
}

await browser.close();
if (devServer) devServer.kill();
console.log(`\nScreenshots in ${OUT}`);
