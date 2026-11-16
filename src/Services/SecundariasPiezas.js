const secondaryWeaponParts = {
  "Akarius Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
    ["Vínculo", "Común"],
  ],
  "Akbolto Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
    ["Eslabón", "Común"],
  ],
  "Akbronco Prime": [
    ["Plano", "Común"],
    ["Cañón", "Poco Común"],
    ["Receptor", "Común"],
    ["Eslabón", "Raro"],
  ],
  "Akjagara Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Poco Común"],
    ["Receptor", "Común"],
    ["Eslabón", "Común"],
  ],
  "Aklex Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
  ],
  "Akmagnus Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
    ["Eslabón", "Común"],
  ],
  "Aksomati Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
    ["Eslabón", "Común"],
  ],
  "Akstiletto Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Poco Común"],
    ["Receptor", "Raro"],
    ["Eslabón", "Común"],
  ],
  "Akvasto Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
    ["Eslabón", "Común"],
  ],
  "Afuris Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
    ["Eslabón", "Común"],
  ],
  "Athodai Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
  ],
  "Ballistica Prime": [
    ["Plano", "Común"],
    ["Cuerpo", "Común"],
    ["Culata", "Poco Común"],
    ["Receptor", "Raro"],
  ],
  "Bronco Prime": [
    ["Plano", "Común"],
    ["Cañón", "Poco Común"],
    ["Receptor", "Común"],
  ],
  "Epitaph Prime": [
    ["Plano", "Raro"],
    ["Cápsula", "Común"],
    ["Mecanismo", "Poco Común"],
  ],
  "Euphona Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
  ],
  "Hikou Prime": [
    ["Plano", "Común"],
    ["Bolsa", "Raro"],
    ["Estrella", "Poco Común"],
  ],
  "Hystrix Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
  ],
  "Knell Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
  ],
  "Kompressa Prime": [
    ["Plano", "Raro"],
    ["Cápsula", "Común"],
    ["Mecanismo", "Poco Común"],
  ],
  "Lato Prime": [
    ["Plano", "Común"],
    ["Cañón", "Raro"],
    ["Receptor", "Poco Común"],
  ],
  "Lex Prime": [
    ["Plano", "Común"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
  ],
  "Magnus Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
  ],
  "Pandero Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
    ["Culata", "Común"],
  ],
  "Pyrana Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Poco Común"],
    ["Receptor", "Raro"],
    ["Culata", "Común"],
  ],
  "Sicarus Prime": [
    ["Plano", "Común"],
    ["Cañón", "Raro"],
    ["Receptor", "Poco Común"],
  ],
  "Spira Prime": [
    ["Plano", "Raro"],
    ["Bolsa", "Poco Común"],
    ["Hoja", "Común"],
  ],
  "Vasto Prime": [
    ["Plano", "Común"],
    ["Cañón", "Raro"],
    ["Receptor", "Poco Común"],
  ],
  "Velox Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
  ],
  "Zakti Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
  ],
  "Zylok Prime": [
    ["Plano", "Raro"],
    ["Cañón", "Común"],
    ["Receptor", "Poco Común"],
  ],
};

export function getSecondaryWeaponParts(weaponName) {
  return (secondaryWeaponParts[weaponName] ?? []).map(([name, rarity]) => ({
    name,
    type: name === "Plano" ? "Plano Principal" : "Componente",
    rarity,
  }));
}
