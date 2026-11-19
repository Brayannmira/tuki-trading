import { useSelection } from "@/shared/state/selection/SelectionContext.js";

function normalizeSearchText(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getPartDisplayName(itemName, partName) {
  return normalizeSearchText(partName).includes(normalizeSearchText(itemName))
    ? partName
    : `${partName} de ${itemName}`;
}

function ItemList({
  items,
  title,
  searchTerm,
  categoryId,
  rarezasActivas = [],
  estadosActivos = [],
  tipoActivo = "Todos",
  soloFavoritos = false,
  catalogProducts = {},
  ordenarPor = "name",
}) {
  const { selectedItems, toggleItem, favorites, toggleFavorite } = useSelection();
  const normalizedSearchTerm = normalizeSearchText(searchTerm);
  const filteredItems = items.filter((item) => {
    const itemName = typeof item === 'object' ? item.name : item;
    const selectionId = `${categoryId}:${itemName}`;
    const product = catalogProducts[selectionId] ?? {};
    const matchesItem = normalizeSearchText(itemName).includes(normalizedSearchTerm);
    const matchesPart =
      typeof item === 'object' &&
      item.parts?.some((part) =>
        normalizeSearchText(getPartDisplayName(itemName, part.name)).includes(normalizedSearchTerm),
      );
    const matchesRarity =
      rarezasActivas.length === 0 ||
      item.parts?.some((part) => rarezasActivas.includes(part.rarity)) ||
      (typeof item === "object" && rarezasActivas.includes(item.rarity));
    const matchesStatus =
      estadosActivos.length === 0 ||
      estadosActivos.includes(product.availability ?? "Por confirmar");
    const matchesType =
      tipoActivo === "Todos" ||
      item.type === tipoActivo ||
      item.parts?.some((part) => part.type === tipoActivo);
    const matchesFavorite = !soloFavoritos || favorites.includes(selectionId);

    return (matchesItem || matchesPart) &&
      matchesRarity &&
      matchesStatus &&
      matchesType &&
      matchesFavorite;
  }).sort((first, second) => {
    const firstName = typeof first === "object" ? first.name : first;
    const secondName = typeof second === "object" ? second.name : second;

    if (ordenarPor === "name") {
      return firstName.localeCompare(secondName);
    }
    if (ordenarPor === "price") {
      const firstPrice = catalogProducts[`${categoryId}:${firstName}`]?.priceCop;
      const secondPrice = catalogProducts[`${categoryId}:${secondName}`]?.priceCop;
      if (
        (firstPrice === null || firstPrice === undefined) &&
        (secondPrice === null || secondPrice === undefined)
      ) {
        return firstName.localeCompare(secondName);
      }
      if (firstPrice === null || firstPrice === undefined) return 1;
      if (secondPrice === null || secondPrice === undefined) return -1;
      return firstPrice - secondPrice || firstName.localeCompare(secondName);
    }
    if (ordenarPor === "popularity") {
      const firstPopularity = catalogProducts[`${categoryId}:${firstName}`]?.popularity ?? 0;
      const secondPopularity = catalogProducts[`${categoryId}:${secondName}`]?.popularity ?? 0;
      return secondPopularity - firstPopularity || firstName.localeCompare(secondName);
    }

    return 0;
  });

  const hasImages = items.some((item) => typeof item === 'object' && item.image);

  return (
    <div className={`category-section${hasImages ? ' warframes-section' : ''}`}>
      <h2>{title}</h2>
      <p className="catalog-result-count" aria-live="polite">
        {filteredItems.length} {filteredItems.length === 1 ? "resultado" : "resultados"}
      </p>
      {filteredItems.length > 0 ? (
        <ul className="items-grid">
          {filteredItems.map((item) => {
            const itemName = typeof item === 'object' ? item.name : item;
            const image = typeof item === 'object' ? item.image : null;
            const selectionId = `${categoryId}:${itemName}`;
            const product = catalogProducts[selectionId] ?? {};
            const isSelected = selectedItems.some(
              (selectedItem) => selectedItem.id === selectionId,
            );
            const isFavorite = favorites.includes(selectionId);
            const unavailable =
              product.availability === "Agotado" || product.stockQuantity === 0;

            return (
              <li key={itemName} className={`item-card${image ? ' warframe-card' : ''}`}>
                {image && <img src={image} alt={itemName} loading="lazy" />}
                <div className="item-name">{itemName}</div>
                {image && item.type && <span className="warframe-type">{item.type}</span>}
                <div className="catalog-item-meta">
                  <span>{product.availability ?? "Por confirmar"}</span>
                  {product.stockQuantity !== null && product.stockQuantity !== undefined && (
                    <span>{product.stockQuantity} disponibles</span>
                  )}
                  <span>
                    {product.priceCop === null || product.priceCop === undefined
                      ? "COP: por cotizar"
                      : `$${new Intl.NumberFormat("es-CO").format(product.priceCop)} COP`}
                  </span>
                  <span>
                    {product.pricePlatinum === null || product.pricePlatinum === undefined
                      ? "Platino: por cotizar"
                      : `${new Intl.NumberFormat("es-CO").format(product.pricePlatinum)} platinos`}
                  </span>
                </div>
                {image && item.parts && (
                  <details className="warframe-details">
                    <summary>Ver piezas, rareza y seleccionar</summary>
                    {item.parts.length > 0 ? (
                      <ul>
                        {item.parts.map((part) => {
                          const partSelectionId = `${selectionId}:part:${part.name}`;
                          const partDisplayName = getPartDisplayName(itemName, part.name);
                          const productId = `${categoryId}:${partDisplayName}`;
                          const partProduct = catalogProducts[productId] ?? {};
                          const partUnavailable =
                            partProduct.availability === "Agotado" ||
                            partProduct.stockQuantity === 0;
                          const isPartSelected = selectedItems.some(
                            (selectedItem) => selectedItem.id === partSelectionId,
                          );

                          return (
                            <li key={part.name}>
                              <label className="warframe-part-select">
                                <input
                                  type="checkbox"
                                  checked={isPartSelected}
                                  disabled={partUnavailable && !isPartSelected}
                                  onChange={() =>
                                    toggleItem({
                                      id: partSelectionId,
                                      parentId: selectionId,
                                      catalogId: productId,
                                      name: partDisplayName,
                                      category: title,
                                      quantity: 1,
                                      priceCop: partProduct.priceCop ?? null,
                                      pricePlatinum: partProduct.pricePlatinum ?? null,
                                    })
                                  }
                                />
                                <span className="warframe-part-name">
                                  <strong>{partDisplayName}</strong>
                                  <small>{part.type}</small>
                                </span>
                                <span className={`rarity-badge rarity-${part.rarity.toLowerCase().replace(' ', '-')}`}>
                                  {part.rarity}
                                </span>
                                <span className="catalog-part-price">
                                  {partProduct.availability ?? "Por confirmar"}
                                </span>
                                {partProduct.stockQuantity !== null && partProduct.stockQuantity !== undefined && (
                                  <span className="catalog-part-price">
                                    {partProduct.stockQuantity} disponibles
                                  </span>
                                )}
                                {partProduct.priceCop !== null && partProduct.priceCop !== undefined && (
                                  <span className="catalog-part-price">
                                    ${new Intl.NumberFormat("es-CO").format(partProduct.priceCop)} COP
                                  </span>
                                )}
                                {partProduct.pricePlatinum !== null && partProduct.pricePlatinum !== undefined && (
                                  <span className="catalog-part-price">
                                    {new Intl.NumberFormat("es-CO").format(partProduct.pricePlatinum)} platinos
                                  </span>
                                )}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="warframe-no-parts">
                        Datos de piezas y rareza pendientes de añadir.
                      </p>
                    )}
                  </details>
                )}
                {typeof item === 'object' && item.type && (
                  !image && <span className="item-type">{item.type}</span>
                )}
                {image && (
                  <div className="catalog-item-actions">
                    <button
                      type="button"
                      className="catalog-favorite-button"
                      aria-label={isFavorite ? `Quitar ${itemName} de favoritos` : `Agregar ${itemName} a favoritos`}
                      aria-pressed={isFavorite}
                      onClick={() => toggleFavorite(selectionId)}
                    >
                      {isFavorite ? "★ Favorito" : "☆ Favorito"}
                    </button>
                    <button
                      type="button"
                      className={`item-select-button${isSelected ? " selected" : ""}`}
                      aria-pressed={isSelected}
                      disabled={unavailable && !isSelected}
                      onClick={() =>
                        toggleItem({
                          id: selectionId,
                          catalogId: selectionId,
                          name: itemName,
                          category: title,
                          quantity: 1,
                          priceCop: product.priceCop ?? null,
                          pricePlatinum: product.pricePlatinum ?? null,
                        })
                      }
                    >
                      {isSelected
                        ? "Quitar del formulario"
                        : unavailable
                          ? "No disponible"
                          : "Agregar al formulario"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="catalog-empty-state" role="status" aria-live="polite">
          No hay artículos que coincidan con los filtros seleccionados.
        </p>
      )}
    </div>
  );
}

export default ItemList;