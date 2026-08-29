import { Routes, Route } from 'react-router-dom';
import AppShell from './layout/AppShell';
import DiscoverPage from './features/discover/DiscoverPage';
import RestaurantPage from './features/catalog/RestaurantPage';
import ComparePage from './features/compare/ComparePage';
import SearchPage from './features/search/SearchPage';
import CheckoutPage from './features/checkout/CheckoutPage';
import OrdersPage from './features/orders/OrdersPage';
import OrderTrackingPage from './features/orders/OrderTrackingPage';
import ProfilePage from './features/profile/ProfilePage';
import AuthPage from './features/auth/AuthPage';
import { AuthProvider } from './features/auth/AuthContext';
import { MergeModal } from './features/auth/MergeModal';

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
      <MergeModal />
    </AuthProvider>
  );
}
