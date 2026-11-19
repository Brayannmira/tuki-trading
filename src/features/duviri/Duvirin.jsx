import "@/shared/styles/Hero.css";
import Navbar from "@/shared/components/Navbar.jsx";

function Duviri() {
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
        <section className="category-section card-left">
          <h2>¿Qué puedes encontrar en este sitio?</h2>
          <p>
            En este sitio encontrarás toda la información sobre el sistema de
            trading de Warframe. Aquí podrás seleccionar una gran variedad de
            objetos —incluyendo Warframes, armas y componentes— para evitar
            largas horas de farmeo y conseguirlos de manera rápida, segura y
            efectiva.
          </p>
        </section>

        <section id="paquetes" className="category-section card-right">
          <h2>Paquetes de platinos</h2>
          <p>
            ¡Este es tu lugar! Aquí podrás encontrar ofertas únicas de platino
            a excelentes precios para conseguir objetos exclusivos de manera
            rápida y segura, evitando largas horas de farmeo. Cuando estés
            listo, tendrás todo lo necesario para personalizar y destacar con
            tu Warframe al máximo.
          </p>
          
        </section>

      </div>
    </main>
  );
}

export default Duviri;