import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import AppShell from './layout/AppShell';
import DiscoverPage from './features/discover/DiscoverPage';
import RestaurantPage from './features/catalog/RestaurantPage';
import ComparePage from './features/compare/ComparePage';
import SearchPage from './features/search/SearchPage';
import { AuthProvider } from './features/auth/AuthContext';
import { MergeModal } from './features/auth/MergeModal';

// Off the critical path — split so the discover/compare core loads lean.
const CheckoutPage = lazy(() => import('./features/checkout/CheckoutPage'));
const OrdersPage = lazy(() => import('./features/orders/OrdersPage'));
const OrderTrackingPage = lazy(() => import('./features/orders/OrderTrackingPage'));
const ProfilePage = lazy(() => import('./features/profile/ProfilePage'));
const AuthPage = lazy(() => import('./features/auth/AuthPage'));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="blob blob-breathe h-16 w-16 bg-blush" />
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="blob blob-breathe h-20 w-20 bg-blush" />
      <h1 className="text-4xl font-semibold">{title}</h1>
      <p className="max-w-sm text-muted">
        This part of TrueFare is being cooked. Check back in a moment.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DiscoverPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="restaurant/:id" element={<RestaurantPage />} />
            <Route path="compare" element={<ComparePage />} />
            <Route path="checkout/:platform" element={<CheckoutPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderTrackingPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="auth" element={<AuthPage />} />
            <Route path="*" element={<Placeholder title="Lost in the kitchen" />} />
          </Route>
        </Routes>
      </Suspense>
      <MergeModal />
    </AuthProvider>
  );
}
