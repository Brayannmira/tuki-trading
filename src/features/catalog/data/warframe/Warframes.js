import { getWarframeParts } from "@/features/catalog/data/warframe/WarframeRarities.js";
import { createPrimeCatalog } from "@/features/catalog/data/warframe/primeCatalog.js";

const images = import.meta.glob("/imagenes-warframe/Warframe/*Prime*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

const warframes = createPrimeCatalog(images).map((warframe) => ({
  ...warframe,
  parts: getWarframeParts(warframe.name),
}));

export default warframes;
