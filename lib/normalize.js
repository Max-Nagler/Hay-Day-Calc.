function normalizeText(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function propertyEntries(properties) {
  return Object.entries(properties || {});
}

function findProperty(properties, names) {
  const wanted = names.map((name) => name.toLowerCase());

  for (const [key, property] of propertyEntries(properties)) {
    if (wanted.includes(key.toLowerCase())) {
      return property;
    }
  }

  return null;
}

function findPropertyByType(properties, type) {
  return Object.values(properties || {}).find((property) => property?.type === type);
}

export function readTitle(properties) {
  const titleProperty = findPropertyByType(properties, "title");

  if (!titleProperty) return "";

  return (
    titleProperty.title
      ?.map((part) => part.plain_text)
      .join("")
      .trim() || ""
  );
}

export function readNumber(properties, names, fallback = 0) {
  const property = findProperty(properties, names);

  if (!property) return fallback;

  if (property.type === "number") {
    return property.number ?? fallback;
  }

  if (property.type === "formula") {
    if (property.formula?.type === "number") {
      return property.formula.number ?? fallback;
    }

    if (property.formula?.type === "string") {
      const parsed = parseFloat(String(property.formula.string).replace(",", "."));
      return Number.isFinite(parsed) ? parsed : fallback;
    }
  }

  if (property.type === "rollup") {
    if (property.rollup?.type === "number") {
      return property.rollup.number ?? fallback;
    }

    if (property.rollup?.type === "array") {
      const firstNumber = property.rollup.array
        ?.map((item) => {
          if (item.type === "number") return item.number;
          if (item.type === "formula" && item.formula?.type === "number") {
            return item.formula.number;
          }
          return null;
        })
        .find((value) => typeof value === "number");

      return firstNumber ?? fallback;
    }
  }

  if (property.type === "rich_text") {
    const text = property.rich_text?.map((part) => part.plain_text).join("") || "";
    const parsed = parseFloat(text.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function readText(properties, names, fallback = "") {
  const property = findProperty(properties, names);

  if (!property) return fallback;

  return readTextFromProperty(property, fallback);
}

function readTextFromProperty(property, fallback = "") {
  if (!property) return fallback;

  if (property.type === "rich_text") {
    return (
      property.rich_text
        ?.map((part) => part.plain_text)
        .join("")
        .trim() || fallback
    );
  }

  if (property.type === "title") {
    return (
      property.title
        ?.map((part) => part.plain_text)
        .join("")
        .trim() || fallback
    );
  }

  if (property.type === "select") {
    return property.select?.name || fallback;
  }

  if (property.type === "status") {
    return property.status?.name || fallback;
  }

  if (property.type === "multi_select") {
    return property.multi_select?.map((item) => item.name).join(", ") || fallback;
  }

  if (property.type === "url") {
    return property.url || fallback;
  }

  if (property.type === "email") {
    return property.email || fallback;
  }

  if (property.type === "phone_number") {
    return property.phone_number || fallback;
  }

  if (property.type === "number") {
    return property.number === null || property.number === undefined
      ? fallback
      : String(property.number);
  }

  if (property.type === "checkbox") {
    return property.checkbox ? "Ja" : "Nein";
  }

  if (property.type === "formula") {
    if (property.formula?.type === "string") return property.formula.string || fallback;
    if (property.formula?.type === "number") return String(property.formula.number ?? "");
    if (property.formula?.type === "boolean") return property.formula.boolean ? "Ja" : "Nein";
    if (property.formula?.type === "date") return property.formula.date?.start || fallback;
  }

  if (property.type === "rollup") {
    if (property.rollup?.type === "array") {
      const values = property.rollup.array
        ?.map((item) => readTextFromProperty(item, ""))
        .filter(Boolean);

      return values?.join(", ") || fallback;
    }

    if (property.rollup?.type === "number") {
      return String(property.rollup.number ?? "");
    }
  }

  return fallback;
}

export function readCheckbox(properties, names, fallback = false) {
  const property = findProperty(properties, names);

  if (!property) return fallback;

  if (property.type === "checkbox") {
    return Boolean(property.checkbox);
  }

  if (property.type === "formula" && property.formula?.type === "boolean") {
    return Boolean(property.formula.boolean);
  }

  return fallback;
}

export function readRelationIds(properties, names) {
  const property = findProperty(properties, names);

  if (!property) return [];

  if (property.type === "relation") {
    return property.relation?.map((item) => item.id) || [];
  }

  return [];
}

function readRelationNames(properties, names, pageNameById) {
  const ids = readRelationIds(properties, names);

  return ids
    .map((id) => pageNameById.get(id))
    .filter(Boolean);
}

export function readFirstFileUrl(properties, names, fallback = "") {
  const property = findProperty(properties, names);

  if (!property) return fallback;

  if (property.type === "files") {
    const file = property.files?.[0];

    if (!file) return fallback;

    if (file.type === "file") return file.file?.url || fallback;
    if (file.type === "external") return file.external?.url || fallback;
  }

  if (property.type === "url") {
    return property.url || fallback;
  }

  if (property.type === "rich_text") {
    const text = readTextFromProperty(property, fallback);
    if (text.startsWith("http")) return text;
  }

  return fallback;
}

function parseTimeToMinutes(value) {
  const text = normalizeText(value)
    .toLowerCase()
    .replace("≈", "")
    .replace("ca.", "")
    .replace("ca", "")
    .trim();

  if (!text || text === "–" || text === "-") return 0;
  if (text.includes("sofort")) return 0;

  let minutes = 0;

  const dayMatch = text.match(/(\d+(?:[,.]\d+)?)\s*(tag|tage|d)/);
  const hourMatch = text.match(/(\d+(?:[,.]\d+)?)\s*(h|std|stunde|stunden)/);
  const minuteMatch = text.match(/(\d+(?:[,.]\d+)?)\s*(min|minute|minuten)/);

  if (dayMatch) {
    minutes += Number(dayMatch[1].replace(",", ".")) * 24 * 60;
  }

  if (hourMatch) {
    minutes += Number(hourMatch[1].replace(",", ".")) * 60;
  }

  if (minuteMatch) {
    minutes += Number(minuteMatch[1].replace(",", "."));
  }

  if (!minutes) {
    const pureNumber = Number(text.replace(",", "."));
    if (!Number.isNaN(pureNumber)) return pureNumber;
  }

  return Math.round(minutes);
}

function readVerified(properties) {
  const text = readText(properties, ["Quelle geprüft?", "Geprüft", "Verified"], "");
  const checkbox = readCheckbox(properties, ["Quelle geprüft?", "Geprüft", "Verified"], false);

  return checkbox || ["ja", "yes", "true", "geprüft"].includes(text.toLowerCase());
}

function buildPageNameById(rawData) {
  const map = new Map();

  const allPages = [
    ...(rawData.mainDatabase || []),
    ...(rawData.recipeDatabase || []),
    ...(rawData.buildingDatabase || []),
    ...(rawData.rawProductsDatabase || [])
  ];

  for (const page of allPages) {
    const name = page.title || readTitle(page.properties || "");

    if (page.id && name) {
      map.set(page.id, name);
    }
  }

  return map;
}

function readBuilding(properties, pageNameById) {
  // Erst Relation versuchen
  const relationNames = readRelationNames(
    properties,
    [
      "Gebäude",
      "Produktionsgebäude",
      "Gebäude Relation",
      "Produktionsgebäude Relation",
      "Building"
    ],
    pageNameById
  );

  if (relationNames.length) return relationNames[0];

  // Dann Rollup/Formel/Text/Select
  return readText(
    properties,
    [
      "Gebäude",
      "Produktionsgebäude",
      "Gebäude Name",
      "Produktionsgebäude Name",
      "Building",
      "Machine",
      "Maschine"
    ],
    ""
  );
}

function readProductNameFromRecipe(properties, pageNameById) {
  const relationNames = readRelationNames(
    properties,
    ["Produkt", "Product", "Erzeugnis", "Produkt Relation"],
    pageNameById
  );

  if (relationNames.length) return relationNames[0];

  return readText(properties, ["Produkt", "Product", "Erzeugnis"], "");
}

function readIngredientNameFromRecipe(properties, pageNameById) {
  const relationNames = readRelationNames(
    properties,
    ["Zutat", "Ingredient", "Zutat Relation"],
    pageNameById
  );

  if (relationNames.length) return relationNames[0];

  return readText(properties, ["Zutat", "Ingredient"], "");
}

export function normalizeProductPage(page, pageNameById = new Map()) {
  const properties = page.properties || {};
  const name = page.title || readTitle(properties);

  const timeText = readText(properties, [
    "Produktionszeit",
    "Zeit",
    "Dauer",
    "Produktionsdauer"
  ]);

  const building = readBuilding(properties, pageNameById);

  return {
    id: page.id,
    key: slugify(name),
    name,
    level: readNumber(properties, ["Level", "level", "Lvl", "Freischaltlevel"], 0),
    xp: readNumber(properties, ["XP", "Erfahrungspunkte", "Erfahrung"], 0),
    coins: readNumber(properties, ["MaxPreis", "Max Preis", "Verkaufspreis", "Preis", "Coins"], 0),
    timeText,
    timeMin:
      readNumber(
        properties,
        ["Produktionszeit Minuten", "Zeit Minuten", "Minuten", "Produktionsdauer Minuten"],
        0
      ) || parseTimeToMinutes(timeText),
    building,
    type: readText(properties, ["Typ", "Kategorie", "Gruppe", "Art"], ""),
    iconUrl: readFirstFileUrl(properties, ["Icon", "Bild", "Bildlink", "Image", "Produktbild"], ""),
    verified: readVerified(properties)
  };
}

export function normalizeRecipePage(page, pageNameById = new Map()) {
  const properties = page.properties || {};

  const product = readProductNameFromRecipe(properties, pageNameById);
  const ingredient = readIngredientNameFromRecipe(properties, pageNameById);

  return {
    id: page.id,
    product,
    productKey: slugify(product),
    ingredient,
    ingredientKey: slugify(ingredient),
    amount: readNumber(properties, ["Menge", "Amount", "Anzahl", "Qty"], 0),
    verified: readVerified(properties)
  };
}

export function normalizeBuildingPage(page) {
  const properties = page.properties || {};
  const name = page.title || readTitle(properties);

  return {
    id: page.id,
    key: slugify(name),
    name,
    level: readNumber(properties, ["Level", "level", "Lvl", "Freischaltlevel"], 0),
    iconUrl: readFirstFileUrl(properties, ["Icon", "Bild", "Bildlink", "Image"], ""),
    active: !readCheckbox(properties, ["Deaktiviert", "Ausgeschlossen"], false)
  };
}

export function normalizeData(rawData) {
  const pageNameById = buildPageNameById(rawData);

  const products = (rawData.mainDatabase || [])
    .map((page) => normalizeProductPage(page, pageNameById))
    .filter((product) => product.name);

  const recipes = (rawData.recipeDatabase || [])
    .map((page) => normalizeRecipePage(page, pageNameById))
    .filter((recipe) => recipe.product && recipe.ingredient && recipe.amount > 0);

  const buildings = (rawData.buildingDatabase || [])
    .map(normalizeBuildingPage)
    .filter((building) => building.name);

  return {
    syncedAt: rawData.syncedAt || null,
    products,
    recipes,
    buildings,
    productsByKey: new Map(products.map((product) => [product.key, product])),
    recipesByProductKey: recipes.reduce((map, recipe) => {
      if (!map.has(recipe.productKey)) map.set(recipe.productKey, []);
      map.get(recipe.productKey).push(recipe);
      return map;
    }, new Map())
  };
}
