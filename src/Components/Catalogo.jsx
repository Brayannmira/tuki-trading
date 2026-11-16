import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SearchBar from "./SearchBar";
import ItemList from "./ItemList";
import warframes from "../Services/Warframes.js";
import primarias from "../Services/Primarias.js";
import secundarias from "../Services/secundarias.js";
import meles from "../Services/mele.js";
import platinumOfferImage from "../../imagenes-warframe/Oferta platinum.jpg";
import package1Image from "../../imagenes-warframe/Paquete 1.jpg";
import package2Image from "../../imagenes-warframe/Paquete 2.jpg";
import package3Image from "../../imagenes-warframe/paquete 3.jpg";
import secondaryCategoryImage from "../../imagenes-warframe/secundarias/Lex Prime.png";
import meleeCategoryImage from "../../imagenes-warframe/Melee/Nikana Prime.png";
import { useSelection } from "./SelectionContext.js";

const platinumPackages = [
  { name: "100 platinos", image: package1Image, price: "$12.000 COP" },
  { name: "250 platinos", image: package2Image, price: "$22.000 COP" },
  { name: "600 platinos", image: package3Image, price: "$50.000 COP", popular: true },
];

const categories = [
  { id: "platino", label: "Platino", subtitle: "Paquetes" },
  { id: "warframes", label: "Warframes", subtitle: "Warframe" },
  { id: "primarias", label: "Armas Primarias", subtitle: "Rifles" },
  {
    id: "secundarias",
    label: "Armas Secundarias",
    subtitle: "Pistolas",
    image: secondaryCategoryImage,
  },
  { id: "mele", label: "Armas Melé", subtitle: "Blades", image: meleeCategoryImage },
];

function Catalog() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("warframes");
  const [selectedPackage, setSelectedPackage] = useState("600 platinos");
  const { selectedItems } = useSelection();

  const activeItems = useMemo(() => {
    switch (activeCategory) {
      case "warframes":
        return warframes;
      case "primarias":
        return primarias;
      case "secundarias":
        return secundarias;
      case "mele":
        return meles;
      default:
        return [];
    }
  }, [activeCategory]);

  const activeTitle =
    categories.find((category) => category.id === activeCategory)?.label ?? "Warframes";

  return (
    <div className="catalog-page">
      <div className="catalog-hero">
        <Link to="/" className="catalog-back-button">
          ← Volver al Inicio
        </Link>

        <h1 className="catalog-title">CATÁLOGO DE WARFRAME</h1>
      </div>

      <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />

      <div className="catalog-grid">
        {categories.map((category) => (
          <button
            type="button"
            key={category.id}
            className={`catalog-card ${category.id} ${activeCategory === category.id ? "active" : ""}`}
            onClick={() => setActiveCategory(category.id)}
          >
            {(category.image || category.id === "platino") && (
              <img
                className="catalog-card-image"
                src={category.image || platinumOfferImage}
                alt=""
                aria-hidden="true"
              />
            )}
            <span>{category.label}</span>
            <small>{category.subtitle}</small>
          </button>
        ))}
      </div>

      <div className="catalog-selection-bar">
        <span>
          {selectedItems.length === 1
            ? "1 artículo seleccionado"
            : `${selectedItems.length} artículos seleccionados`}
        </span>
        <Link to="/formulario" className="catalog-form-link">
          Ir al formulario
        </Link>
      </div>

      {activeCategory === "platino" ? (
        <div className="catalog-platinum-panel category-section">
          <h2>Paquetes de Platino</h2>
          <p>
            Encuentra paquetes de platino a excelente precio para conseguir tus armas,
            warframes y componentes sin perder horas en farmeo.
          </p>
          <p className="platinum-price-note">Precios promocionales sugeridos en pesos colombianos.</p>
          <div className="platinum-offers">
            {platinumPackages.map((packageInfo) => (
              <button
                type="button"
                className={`offer-box ${selectedPackage === packageInfo.name ? "selected" : ""}`}
                key={packageInfo.name}
                aria-pressed={selectedPackage === packageInfo.name}
                onClick={() => setSelectedPackage(packageInfo.name)}
              >
                <img src={packageInfo.image} alt={packageInfo.name} loading="lazy" />
                <strong>{packageInfo.name}</strong>
                <span className="offer-price">{packageInfo.price}</span>
                {packageInfo.popular && (
                  <span className="offer-badge">Más Popular</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ItemList
          items={activeItems}
          title={activeTitle}
          searchTerm={searchTerm}
          categoryId={activeCategory}
        />
      )}
    </div>
  );
}

export default Catalog;