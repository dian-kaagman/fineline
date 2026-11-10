import { Navigate, Route, Routes } from "react-router";
import { AdminLayout } from "./admin/AdminLayout";
import { EditFramePage } from "./admin/EditFramePage";
import { FramesPage } from "./admin/FramesPage";
import { LoginPage } from "./admin/LoginPage";
import { NewFramePage } from "./admin/NewFramePage";
import { OrderDetailPage } from "./admin/OrderDetailPage";
import { OrdersPage } from "./admin/OrdersPage";
import { SettingsPage } from "./admin/SettingsPage";
import { NotFoundPage } from "./NotFoundPage";
import { ShopPage } from "./shop/ShopPage";
import { ShopLayout } from "./shop/ShopLayout";

/** One SPA: the customer shop at `/` and the admin tool at `/admin/*` (docs/ux/screens.md "Routes"). */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<ShopPage />} />
      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/orders" replace />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:orderId" element={<OrderDetailPage />} />
        <Route path="frames" element={<FramesPage />} />
        <Route path="frames/new" element={<NewFramePage />} />
        <Route path="frames/:frameId" element={<EditFramePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage area="admin" />} />
      </Route>
      <Route
        path="*"
        element={
          <ShopLayout>
            <NotFoundPage area="shop" />
          </ShopLayout>
        }
      />
    </Routes>
  );
}
