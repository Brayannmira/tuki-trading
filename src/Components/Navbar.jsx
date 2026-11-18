import { NavLink } from "react-router-dom";

export default function Navbar() {
  return (
    <header className="navbar">
      <div className="logo-mini"></div>

      <ul className="nav-links">
        <li className="nav-item">
          <NavLink to="/" end>
            Pantalla de inicio
          </NavLink>
        </li>
        <li className="nav-item">
          <NavLink to="/duviri">Inicio</NavLink>
        </li>
        <li className="nav-item">
          <NavLink to="/catalogo">Catálogo</NavLink>
        </li>
        <li className="nav-item">
          <NavLink to="/formulario">Formulario</NavLink>
        </li>
        <li className="nav-item">
          <NavLink to="/consultar-pedido">Consultar pedido</NavLink>
        </li>
      </ul>

      <div className="user-status"></div>
    </header>
  );
}