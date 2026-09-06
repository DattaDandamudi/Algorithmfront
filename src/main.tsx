import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// The health/fitness app lives at /health (or #/health) and is code-split so the
// Algoritm landing/studio bundle stays untouched.
const isHealthRoute =
  window.location.pathname === '/health' ||
  window.location.pathname.startsWith('/health/') ||
  window.location.hash.startsWith('#/health');

const App = lazy(() => import('./App.tsx'));
const HealthApp = lazy(() => import('./health/HealthApp.tsx'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{isHealthRoute ? <HealthApp /> : <App />}</Suspense>
  </StrictMode>
);
