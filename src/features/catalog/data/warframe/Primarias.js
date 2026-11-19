import { createPrimeCatalog } from "@/features/catalog/data/warframe/primeCatalog.js";
import { getPrimaryWeaponParts } from "@/features/catalog/data/warframe/PrimariasPiezas.js";

const images = import.meta.glob("/imagenes-warframe/primarias/*Prime*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

const primarias = createPrimeCatalog(images).map((weapon) => ({
  ...weapon,
  parts: getPrimaryWeaponParts(weapon.name),
}));

export default primarias;
