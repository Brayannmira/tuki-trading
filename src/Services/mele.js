import { createPrimeCatalog } from "./primeCatalog.js";
import { getMeleeWeaponParts } from "./MelePiezas.js";

const images = import.meta.glob("../../imagenes-warframe/Melee/*Prime*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

const mele = createPrimeCatalog(images).map((weapon) => ({
  ...weapon,
  parts: getMeleeWeaponParts(weapon.name),
}));

export default mele;
