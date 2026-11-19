import "@/shared/styles/Hero.css";
import Formulario from "@/features/checkout/Formulario.jsx";
import Navbar from "@/shared/components/Navbar.jsx";

function FormularioPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundImage:
          'linear-gradient(rgba(11, 15, 25, 0.65), rgba(11, 15, 25, 0.8)), url("/Pagina-informacion.webp")',
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
