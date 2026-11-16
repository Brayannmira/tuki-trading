import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../Services/Hero.css";


function Hero() {
  const navigate = useNavigate();
  const [saliendo, setSaliendo] = useState(false);

  const moverMouse = (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    e.currentTarget.style.setProperty("--x", x);
    e.currentTarget.style.setProperty("--y", y);
  };

  const explorar = () => {
    setSaliendo(true);
    setTimeout(() => navigate("/duviri"), 800);
  };

  return (
    <section
      className={saliendo ? "inicio-container saliendo" : "inicio-container"}
      onMouseMove={moverMouse}
    >
      <div className="fondo-guerra"></div>
      <div className="contenido-centro">
        
        <button className="btn-catalogo" onClick={explorar}>
          EXPLORAR 
        </button>
      </div>
    </section>
  );
}

export default Hero;