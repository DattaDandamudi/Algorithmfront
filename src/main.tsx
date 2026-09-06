import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// The health/fitness app lives at /health (or #/health) and is code-split so the
// Algoritm landing/studio bundle stays untouched.
const isHealthRoute =
  window.location.pathname === '/health' ||
  window.location.pathname.startsWith('/health/') ||
  window.location.hash.startsWith('#/health');

if (isHealthRoute) {
  // Paint the dark ground before the lazy chunk mounts so a cold load never flashes the light page,
  // and tint mobile browser chrome to match (theme-color is set here, not in index.html, so the
  // light Algoritm app keeps its own).
  document.documentElement.style.background = '#0B0D0F';
  document.body.style.background = '#0B0D0F';
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#0B0D0F';
  document.head.appendChild(meta);
}

const App = lazy(() => import('./App.tsx'));
const HealthApp = lazy(() => import('./health/HealthApp.tsx'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{isHealthRoute ? <HealthApp /> : <App />}</Suspense>
  </StrictMode>
);
