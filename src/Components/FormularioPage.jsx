import "../Services/Hero.css";
import Formulario from "./Formulario.jsx";
import Navbar from "./Navbar.jsx";

function FormularioPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundImage:
          'linear-gradient(rgba(11, 15, 25, 0.65), rgba(11, 15, 25, 0.8)), url("/Pagina-informacion.jpg")',
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <Navbar />
      <div className="content-container">
        <Formulario />
      </div>
    </main>
  );
}

export default FormularioPage;
