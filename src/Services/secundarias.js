import { createPrimeCatalog } from "./primeCatalog.js";
import { getSecondaryWeaponParts } from "./SecundariasPiezas.js";

const images = import.meta.glob("../../imagenes-warframe/secundarias/*Prime*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

const secundarias = createPrimeCatalog(images).map((weapon) => ({
  ...weapon,
  parts: getSecondaryWeaponParts(weapon.name),
}));

export default secundarias;
