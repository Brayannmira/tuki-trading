import { createPrimeCatalog } from "@/features/catalog/data/warframe/primeCatalog.js";
import { getSecondaryWeaponParts } from "@/features/catalog/data/warframe/SecundariasPiezas.js";

const images = import.meta.glob("/imagenes-warframe/secundarias/*Prime*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

const secundarias = createPrimeCatalog(images).map((weapon) => ({
  ...weapon,
  parts: getSecondaryWeaponParts(weapon.name),
}));

export default secundarias;
