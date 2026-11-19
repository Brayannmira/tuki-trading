import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import "./App.css";
import SelectionProvider from "./Components/SelectionProvider.jsx";

const Duviri = lazy(() => import("./Components/Duvirin.jsx"));
const Inicio = lazy(() => import("./Components/Inicio.jsx"));
const Catalogo = lazy(() => import("./Components/Catalogo.jsx"));
const FormularioPage = lazy(() => import("./Components/FormularioPage.jsx"));
const AdminPage = lazy(() => import("./Components/AdminPage.jsx"));
const OrderStatusPage = lazy(() => import("./Components/OrderStatusPage.jsx"));

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
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </Suspense>
    </SelectionProvider>
  );
}

export default App; // <-- ¡Esta línea es la que le indica a React qué exportar!