import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { CheckoutPage } from './pages/CheckoutPage';
import { ShopPage } from './pages/ShopPage';
import { SuccessPage } from './pages/SuccessPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<ShopPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="success" element={<SuccessPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
