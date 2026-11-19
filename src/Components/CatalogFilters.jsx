import SearchBar from "./SearchBar.jsx";

const rarities = ["Común", "Poco Común", "Raro", "Legendario"];
const statuses = [
  "Disponible",
  "En Bóveda",
  "Oferta Especial",
  "Agotado",
  "Por confirmar",
];

function CatalogFilters({
  searchTerm,
  setSearchTerm,
  activeRarities,
  setActiveRarities,
  activeStatuses,
  setActiveStatuses,
  activeType,
  setActiveType,
  favoritesOnly,
  setFavoritesOnly,
  sortBy,
  setSortBy,
  hasCatalogPrices,
  hasCatalogPopularity,
}) {
  const toggleFilter = (value, activeValues, setActiveValues) => {
    setActiveValues((currentValues) =>
      currentValues.includes(value)
        ? currentValues.filter((currentValue) => currentValue !== value)
        : [...currentValues, value],
    );
  };

  return (
    <>
      <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      <section className="catalog-filter-panel" aria-labelledby="catalog-filter-title">
        <h2 id="catalog-filter-title">Filtros y selección</h2>

        <fieldset className="catalog-filter-group">
          <legend>Filtrar por rareza</legend>
          {rarities.map((rarity) => (
            <label className="catalog-filter-option" key={rarity}>
              <input
                type="checkbox"
                checked={activeRarities.includes(rarity)}
                onChange={() => toggleFilter(rarity, activeRarities, setActiveRarities)}
              />
              <span>{rarity}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="catalog-filter-group">
          <legend>Filtrar por estado</legend>
          {statuses.map((status) => (
            <label className="catalog-filter-option" key={status}>
              <input
                type="checkbox"
                checked={activeStatuses.includes(status)}
                onChange={() => toggleFilter(status, activeStatuses, setActiveStatuses)}
              />
              <span>{status}</span>
            </label>
          ))}
        </fieldset>

        <label className="catalog-sort-control">
          <span>Filtrar por tipo</span>
          <select value={activeType} onChange={(event) => setActiveType(event.target.value)}>
            <option value="Todos">Todos los tipos</option>
            <option value="Prime">Prime</option>
            <option value="Plano Principal">Plano principal</option>
            <option value="Componente">Componente</option>
          </select>
        </label>

        <label className="catalog-filter-option catalog-favorites-filter">
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(event) => setFavoritesOnly(event.target.checked)}
          />
          <span>Mostrar solo favoritos</span>
        </label>

        <label className="catalog-sort-control">
          <span>Ordenar por</span>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="name">Nombre</option>
            <option value="price" disabled={!hasCatalogPrices}>Precio</option>
            <option value="popularity" disabled={!hasCatalogPopularity}>Popularidad</option>
          </select>
        </label>
        {!hasCatalogPrices && (
          <p className="catalog-sort-note">
            El orden por precio se habilitará al cargar la lista real que compartirás.
          </p>
        )}
        {!hasCatalogPopularity && (
          <p className="catalog-sort-note">
            La popularidad se calcula con las cantidades de pedidos completados.
          </p>
        )}
      </section>
    </>
  );
}

export default CatalogFilters;
