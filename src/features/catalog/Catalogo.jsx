import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "@/features/catalog/Catalog.css";
import CatalogFilters from "@/features/catalog/CatalogFilters.jsx";
import ItemList from "@/features/catalog/ItemList.jsx";
import warframes from "@/features/catalog/data/warframe/Warframes.js";
import primarias from "@/features/catalog/data/warframe/Primarias.js";
import secundarias from "@/features/catalog/data/warframe/secundarias.js";
import meles from "@/features/catalog/data/warframe/mele.js";
import secondaryCategoryImage from "../../../imagenes-warframe/secundarias/Lex Prime.png";
import meleeCategoryImage from "../../../imagenes-warframe/Melee/Nikana Prime.png";
import { useSelection } from "@/shared/state/selection/SelectionContext.js";

const platinumOfferImage = "/Oferta-platinum.webp";
const package1Image = "/Paquete-1.webp";
const package2Image = "/Paquete-2.webp";
const package3Image = "/Paquete-3.webp";

const platinumPackages = [
  { id: "platino:100 platinos", name: "100 platinos", image: package1Image, priceCop: 12000 },
  { id: "platino:250 platinos", name: "250 platinos", image: package2Image, priceCop: 22000 },
  {
    id: "platino:600 platinos",
    name: "600 platinos",
    image: package3Image,
    priceCop: 50000,
    popular: true,
  },
];

const categories = [
  {
    id: "platino",
    label: "Platino",
    subtitle: "Paquetes",
    rareza: "Legendario",
    estado: "Disponible",
    image: platinumOfferImage,
    destacado: false,
  },
  {
    id: "warframes",
    label: "Warframes",
    subtitle: "Warframes",
    rareza: "Raro",
    estado: "Disponible",
    image: "/diseno-sin-titulo.webp",
    destacado: true,
  },
  {
    id: "primarias",
    label: "Armas Primarias",
    subtitle: "Rifles",
    rareza: "Poco Común",
    estado: "En Bóveda",
    image: "/images.webp",
    destacado: true,
  },
  {
    id: "secundarias",
    label: "Armas Secundarias",
    subtitle: "Pistolas",
    rareza: "Común",
    estado: "Disponible",
    image: secondaryCategoryImage,
    destacado: false,
  },
  {
    id: "mele",
    label: "Armas Melé",
    subtitle: "Espadas",
    rareza: "Raro",
    estado: "Oferta Especial",
    image: meleeCategoryImage,
    destacado: false,
  },
];

function Catalog() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("warframes");
  const [activeRarities, setActiveRarities] = useState([]);
  const [activeStatuses, setActiveStatuses] = useState([]);
  const [activeType, setActiveType] = useState("Todos");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState("name");
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const { selectedItems, toggleItem } = useSelection();

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/catalog", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`No se pudo cargar el catálogo de precios (HTTP ${response.status}).`);
        }
        const products = await response.json();
        if (!Array.isArray(products)) {
          throw new Error("El servidor devolvió datos de catálogo no válidos.");
        }
        setCatalogProducts(products);
      })
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setCatalogError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });

    return () => controller.abort();
  }, []);

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
  const productsById = useMemo(
    () => Object.fromEntries(catalogProducts.map((product) => [product.id, product])),
    [catalogProducts],
  );
  const hasCatalogPrices = activeItems.some((item) => {
    const product = productsById[`${activeCategory}:${item.name}`];
    return (
      (product?.priceCop !== null && product?.priceCop !== undefined) ||
      (product?.pricePlatinum !== null && product?.pricePlatinum !== undefined)
    );
  });
  const hasCatalogPopularity = activeItems.some(
    (item) => (productsById[`${activeCategory}:${item.name}`]?.popularity ?? 0) > 0,
  );

  return (
    <div className="catalog-page">
      <div className="catalog-hero">
        <Link to="/" className="catalog-back-button">
          ← Volver al Inicio
        </Link>

        <h1 className="catalog-title">CATÁLOGO DE WARFRAME</h1>
      </div>

      <div className="catalog-grid">
        {categories.map((category) => (
          <button
            type="button"
            key={category.id}
            className={`catalog-card ${category.id} ${activeCategory === category.id ? "active" : ""}`}
            onClick={() => setActiveCategory(category.id)}
            aria-pressed={activeCategory === category.id}
          >
            <img
              className="catalog-card-image"
              src={category.image}
              alt=""
              aria-hidden="true"
            />
            {category.destacado && (
              <span className="catalog-card-featured">Destacado</span>
            )}
            <span>{category.label}</span>
            <small>{category.subtitle}</small>
            <span className="catalog-card-metadata">
              <span className="catalog-card-rarity">{category.rareza}</span>
              <span className="catalog-card-status">{category.estado}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="catalog-layout">
        <aside className="catalog-sidebar">
          {activeCategory !== "platino" && (
            <CatalogFilters
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              activeRarities={activeRarities}
              setActiveRarities={setActiveRarities}
              activeStatuses={activeStatuses}
              setActiveStatuses={setActiveStatuses}
              activeType={activeType}
              setActiveType={setActiveType}
              favoritesOnly={favoritesOnly}
              setFavoritesOnly={setFavoritesOnly}
              sortBy={sortBy}
              setSortBy={setSortBy}
              hasCatalogPrices={hasCatalogPrices}
              hasCatalogPopularity={hasCatalogPopularity}
            />
          )}

          <section className="catalog-selection-summary">
            <h2>Resumen de selección</h2>
            <p>
              {selectedItems.length}{" "}
              {selectedItems.length === 1 ? "artículo seleccionado" : "artículos seleccionados"}
            </p>
            <Link to="/formulario" className="catalog-form-link">
              Ir al formulario
            </Link>
          </section>
        </aside>

        <main className="catalog-results">
          {catalogError && <p className="catalog-data-error" role="alert">{catalogError}</p>}
          {catalogLoading && (
            <p className="catalog-loading" role="status" aria-live="polite">
              Cargando precios y disponibilidad…
            </p>
          )}
          {activeCategory === "platino" ? (
            <div className="catalog-platinum-panel category-section">
              <h2>Paquetes de Platino</h2>
              <p>
                Encuentra paquetes de platino a excelente precio para conseguir tus armas,
                warframes y componentes sin perder horas en farmeo.
              </p>
              <p className="platinum-price-note">Precios promocionales sugeridos en pesos colombianos.</p>
              <div className="platinum-offers">
                {platinumPackages.map((packageInfo) => {
                  const product = productsById[packageInfo.id] ?? {};
                  const isSelected = selectedItems.some((item) => item.id === packageInfo.id);
                  const unavailable =
                    product.availability === "Agotado" || product.stockQuantity === 0;
                  const priceCop = product.id ? product.priceCop : packageInfo.priceCop;

                  return (
                    <button
                      type="button"
                      className={`offer-box ${isSelected ? "selected" : ""}`}
                      key={packageInfo.name}
                      aria-pressed={isSelected}
                      disabled={unavailable && !isSelected}
                      onClick={() => toggleItem({
                        id: packageInfo.id,
                        catalogId: packageInfo.id,
                        name: packageInfo.name,
                        category: "Platino",
                        quantity: 1,
                        priceCop: product.priceCop ?? null,
                        pricePlatinum: product.pricePlatinum ?? null,
                      })}
                    >
                      <img src={packageInfo.image} alt={packageInfo.name} loading="lazy" />
                      <strong>{packageInfo.name}</strong>
                      <span className="offer-price">
                        {priceCop === null
                          ? "Por cotizar"
                          : `$${new Intl.NumberFormat("es-CO").format(priceCop)} COP`}
                      </span>
                      {packageInfo.popular && (
                        <span className="offer-badge">Más Popular</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div aria-busy={catalogLoading}>
              <ItemList
                items={activeItems}
                title={activeTitle}
                searchTerm={searchTerm}
                categoryId={activeCategory}
                rarezasActivas={activeRarities}
                estadosActivos={activeStatuses}
                tipoActivo={activeType}
                soloFavoritos={favoritesOnly}
                catalogProducts={productsById}
                ordenarPor={sortBy}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default Catalog;