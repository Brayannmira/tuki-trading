import { useState } from "react";
import { SelectionContext } from "./SelectionContext.js";

function SelectionProvider({ children }) {
  const [selectedItems, setSelectedItems] = useState([]);

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

  return (
    <SelectionContext.Provider value={{ selectedItems, toggleItem }}>
      {children}
    </SelectionContext.Provider>
  );
}

export default SelectionProvider;
