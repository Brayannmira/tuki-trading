import { createPrimeCatalog } from "@/features/catalog/data/warframe/primeCatalog.js";
import { getMeleeWeaponParts } from "@/features/catalog/data/warframe/MelePiezas.js";

const images = import.meta.glob("/imagenes-warframe/Melee/*Prime*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

const mele = createPrimeCatalog(images).map((weapon) => ({
  ...weapon,
  parts: getMeleeWeaponParts(weapon.name),
}));

export default mele;
