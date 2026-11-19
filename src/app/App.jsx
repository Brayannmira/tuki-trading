import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import "@/app/App.css";
import SelectionProvider from "@/shared/state/selection/SelectionProvider.jsx";

const Duviri = lazy(() => import("@/features/duviri/Duvirin.jsx"));
const Inicio = lazy(() => import("@/features/home/Inicio.jsx"));
const Catalogo = lazy(() => import("@/features/catalog/Catalogo.jsx"));
const FormularioPage = lazy(() => import("@/features/checkout/FormularioPage.jsx"));
const AdminPage = lazy(() => import("@/features/admin/AdminPage.jsx"));
const OrderStatusPage = lazy(() => import("@/features/orders/OrderStatusPage.jsx"));
const CustomerAccountPage = lazy(() => import("@/features/account/CustomerAccountPage.jsx"));

function App() {
  return (
    <SelectionProvider>
      <Suspense fallback={<main className="page-loading" role="status">Cargando página…</main>}>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/duviri" element={<Duviri />} />
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="/formulario" element={<FormularioPage />} />
          <Route path="/consultar-pedido" element={<OrderStatusPage />} />
          <Route path="/mi-cuenta" element={<CustomerAccountPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </Suspense>
    </SelectionProvider>
  );
}

export default App; // <-- ¡Esta línea es la que le indica a React qué exportar!