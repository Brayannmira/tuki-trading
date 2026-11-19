import { useEffect, useState } from "react";
import { SelectionContext } from "./SelectionContext.js";

const favoritesStorageKey = "tuki-trading-favorites";
const selectionStorageKey = "tuki-trading-cart";

function readSelection() {
  try {
    const savedSelection = localStorage.getItem(selectionStorageKey);
    if (!savedSelection) return [];

    const parsedSelection = JSON.parse(savedSelection);
    if (!Array.isArray(parsedSelection)) return [];
    return parsedSelection.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.category === "string" &&
        Number.isSafeInteger(item.quantity) &&
        item.quantity >= 1 &&
        item.quantity <= 99,
    );
  } catch (error) {
    console.error("No se pudo leer el carrito guardado:", error);
    return [];
  }
}

function readFavorites() {
  try {
    const savedFavorites = localStorage.getItem(favoritesStorageKey);
    if (!savedFavorites) return [];

    const parsedFavorites = JSON.parse(savedFavorites);
    return Array.isArray(parsedFavorites) && parsedFavorites.every(
      (favoriteId) => typeof favoriteId === "string",
    )
      ? parsedFavorites
      : [];
  } catch (error) {
    console.error("No se pudieron leer los favoritos guardados:", error);
    return [];
  }
}

function SelectionProvider({ children }) {
  const [selectedItems, setSelectedItems] = useState(readSelection);
  const [favorites, setFavorites] = useState(readFavorites);

  useEffect(() => {
    try {
      localStorage.setItem(selectionStorageKey, JSON.stringify(selectedItems));
    } catch (error) {
      console.error("No se pudo guardar el carrito:", error);
    }
  }, [selectedItems]);

  useEffect(() => {
    try {
      localStorage.setItem(favoritesStorageKey, JSON.stringify(favorites));
    } catch (error) {
      console.error("No se pudieron guardar los favoritos:", error);
    }
  }, [favorites]);

  const toggleItem = (item) => {
    setSelectedItems((currentItems) => {
      if (currentItems.some((selectedItem) => selectedItem.id === item.id)) {
        return currentItems.filter((selectedItem) => selectedItem.id !== item.id);
      }

      return [
        ...currentItems.filter(
          (selectedItem) =>
            selectedItem.id !== item.parentId && selectedItem.parentId !== item.id,
        ),
        item,
      ];
    });
  };

  const updateQuantity = (id, value) => {
    const quantity = Number(value);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) return;

    setSelectedItems((currentItems) =>
      currentItems.map((item) => item.id === id ? { ...item, quantity } : item),
    );
  };

  const toggleFavorite = (id) => {
    setFavorites((currentFavorites) =>
      currentFavorites.includes(id)
        ? currentFavorites.filter((favoriteId) => favoriteId !== id)
        : [...currentFavorites, id],
    );
  };

  const clearSelection = () => setSelectedItems([]);

  return (
    <SelectionContext.Provider
      value={{
        selectedItems,
        toggleItem,
        updateQuantity,
        favorites,
        toggleFavorite,
        clearSelection,
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

export default SelectionProvider;
