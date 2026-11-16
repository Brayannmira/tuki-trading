import { Routes, Route } from "react-router-dom";
import "./App.css";
import Duviri from "./Components/Duvirin.jsx";
import Inicio from "./Components/Inicio.jsx";
import Catalogo from "./Components/Catalogo.jsx";
import FormularioPage from "./Components/FormularioPage.jsx";
import AdminPage from "./Components/AdminPage.jsx";
import OrderStatusPage from "./Components/OrderStatusPage.jsx";
import SelectionProvider from "./Components/SelectionProvider.jsx";


function App() {
  return (
    <SelectionProvider>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/duviri" element={<Duviri />} />
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/formulario" element={<FormularioPage />} />
        <Route path="/consultar-pedido" element={<OrderStatusPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </SelectionProvider>
  );
}

export default App; // <-- ¡Esta línea es la que le indica a React qué exportar!