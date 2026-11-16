import { useSelection } from "./SelectionContext.js";

function normalizeSearchText(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getPartDisplayName(itemName, partName) {
  return normalizeSearchText(partName).includes(normalizeSearchText(itemName))
    ? partName
    : `${partName} de ${itemName}`;
}

function ItemList({ items, title, searchTerm, categoryId }) {
  const { selectedItems, toggleItem } = useSelection();
  const normalizedSearchTerm = normalizeSearchText(searchTerm);
  const filteredItems = items.filter((item) => {
    const itemName = typeof item === 'object' ? item.name : item;
    const matchesItem = normalizeSearchText(itemName).includes(normalizedSearchTerm);
    const matchesPart =
      typeof item === 'object' &&
      item.parts?.some((part) =>
        normalizeSearchText(getPartDisplayName(itemName, part.name)).includes(normalizedSearchTerm),
      );

    return matchesItem || matchesPart;
  });

  if (filteredItems.length === 0) return null;
  const hasImages = filteredItems.some((item) => typeof item === 'object' && item.image);

  return (
    <div className={`category-section${hasImages ? ' warframes-section' : ''}`}>
      <h2>{title}</h2>
      <ul className="items-grid">
        {filteredItems.map((item) => {
          const itemName = typeof item === 'object' ? item.name : item;
          const image = typeof item === 'object' ? item.image : null;
          const selectionId = `${categoryId}:${itemName}`;
          const isSelected = selectedItems.some((selectedItem) => selectedItem.id === selectionId);

          return (
            <li key={itemName} className={`item-card${image ? ' warframe-card' : ''}`}>
              {image && <img src={image} alt={itemName} loading="lazy" />}
              <div className="item-name">{itemName}</div>
              {image && item.type && <span className="warframe-type">{item.type}</span>}
              {image && item.parts && (
                <details className="warframe-details">
                  <summary>Ver piezas, rareza y seleccionar</summary>
                  {item.parts.length > 0 ? (
                    <ul>
                      {item.parts.map((part) => {
                        const partSelectionId = `${selectionId}:part:${part.name}`;
                        const partDisplayName = getPartDisplayName(itemName, part.name);
                        const isPartSelected = selectedItems.some(
                          (selectedItem) => selectedItem.id === partSelectionId,
                        );

                        return (
                          <li key={part.name}>
                            <label className="warframe-part-select">
                              <input
                                type="checkbox"
                                checked={isPartSelected}
                                onChange={() =>
                                  toggleItem({
                                    id: partSelectionId,
                                    parentId: selectionId,
                                    name: partDisplayName,
                                    category: title,
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
                <button
                  type="button"
                  className={`item-select-button${isSelected ? " selected" : ""}`}
                  aria-pressed={isSelected}
                  onClick={() =>
                    toggleItem({ id: selectionId, name: itemName, category: title })
                  }
                >
                  {isSelected ? "Quitar del formulario" : "Agregar al formulario"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ItemList;