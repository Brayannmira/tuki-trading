export function createPrimeCatalog(images) {
  return Object.entries(images)
    .map(([path, image]) => ({
      name: path.split("/").pop().replace(/\.[^.]+$/, ""),
      image,
      type: "Prime",
    }))
    .filter((item) => /\bPrime\b/i.test(item.name))
    .sort((first, second) => first.name.localeCompare(second.name));
}
