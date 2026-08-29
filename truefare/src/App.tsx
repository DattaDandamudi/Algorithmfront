import { Routes, Route } from 'react-router-dom';
import AppShell from './layout/AppShell';
import DiscoverPage from './features/discover/DiscoverPage';
import RestaurantPage from './features/catalog/RestaurantPage';
import ComparePage from './features/compare/ComparePage';

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
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DiscoverPage />} />
        <Route path="search" element={<Placeholder title="Search" />} />
        <Route path="restaurant/:id" element={<RestaurantPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="checkout/:platform" element={<Placeholder title="Checkout" />} />
        <Route path="orders" element={<Placeholder title="Orders" />} />
        <Route path="orders/:id" element={<Placeholder title="Order tracking" />} />
        <Route path="profile" element={<Placeholder title="Profile" />} />
        <Route path="auth" element={<Placeholder title="Sign in" />} />
        <Route path="*" element={<Placeholder title="Lost in the kitchen" />} />
      </Route>
    </Routes>
  );
}
