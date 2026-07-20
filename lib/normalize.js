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

export function readTitle(properties) {
  const titleProperty = Object.values(properties || {}).find(
    (property) => property?.type === "title"
  );

  if (!titleProperty) return "";

  return titleProperty.title
    ?.map((part) => part.plain_text)
    .join("")
    .trim();
}

export function readNumber(properties, names, fallback = 0) {
  for (const name of names) {
    const property = properties?.[name];

    if (!property) continue;

    if (property.type === "number") {
      return property.number ?? fallback;
    }

    if (property.type === "formula" && property.formula?.type === "number") {
      return property.formula.number ?? fallback;
    }

    if (property.type === "rollup" && property.rollup?.type === "number") {
      return property.rollup.number ?? fallback;
    }
  }

  return fallback;
}

export function readText(properties, names, fallback = "") {
  for (const name of names) {
    const property = properties?.[name];

    if (!property) continue;

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

    if (property.type === "formula" && property.formula?.type === "string") {
      return property.formula.string || fallback;
    }

    if (property.type === "url") {
      return property.url || fallback;
    }
  }

  return fallback;
}

export function readCheckbox(properties, names, fallback = false) {
  for (const name of names) {
    const property = properties?.[name];

    if (!property) continue;

    if (property.type === "checkbox") {
      return Boolean(property.checkbox);
    }

    if (property.type === "formula" && property.formula?.type === "boolean") {
      return Boolean(property.formula.boolean);
    }
  }

  return fallback;
}

export function readRelationIds(properties, names) {
  for (const name of names) {
    const property = properties?.[name];

    if (!property) continue;

    if (property.type === "relation") {
      return property.relation?.map((item) => item.id) || [];
    }
  }

  return [];
}

export function readFirstFileUrl(properties, names, fallback = "") {
  for (const name of names) {
    const property = properties?.[name];

    if (!property) continue;

    if (property.type === "files") {
      const file = property.files?.[0];

      if (!file) continue;

      if (file.type === "file") return file.file?.url || fallback;
      if (file.type === "external") return file.external?.url || fallback;
    }

    if (property.type === "url") {
      return property.url || fallback;
    }
  }

  return fallback;
}

function parseTimeToMinutes(value) {
  const text = normalizeText(value).toLowerCase();

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

export function normalizeProductPage(page) {
  const properties = page.properties || {};
  const name = page.title || readTitle(properties);

  const timeText = readText(properties, [
    "Produktionszeit",
    "Zeit",
    "Dauer"
  ]);

  return {
    id: page.id,
    key: slugify(name),
    name,
    level: readNumber(properties, ["Level", "level"], 0),
    xp: readNumber(properties, ["XP", "Erfahrungspunkte"], 0),
    coins: readNumber(properties, ["MaxPreis", "Verkaufspreis", "Preis"], 0),
    timeText,
    timeMin:
      readNumber(properties, ["Produktionszeit Minuten", "Zeit Minuten", "Minuten"], 0) ||
      parseTimeToMinutes(timeText),
    building: readText(properties, ["Gebäude", "Produktionsgebäude"], ""),
    type: readText(properties, ["Typ", "Kategorie", "Gruppe"], ""),
    iconUrl: readFirstFileUrl(properties, ["Icon", "Bild", "Bildlink"], ""),
    verified: readText(properties, ["Quelle geprüft?", "Geprüft"], "") === "Ja"
  };
}

export function normalizeRecipePage(page, productsById = new Map()) {
  const properties = page.properties || {};

  const productRelationIds = readRelationIds(properties, [
    "Produkt",
    "Product"
  ]);

  const ingredientRelationIds = readRelationIds(properties, [
    "Zutat",
    "Ingredient"
  ]);

  const productFromRelation = productsById.get(productRelationIds[0])?.name || "";
  const ingredientFromRelation =
    productsById.get(ingredientRelationIds[0])?.name || "";

  const product =
    productFromRelation ||
    readText(properties, ["Produkt", "Product", "Erzeugnis"], "");

  const ingredient =
    ingredientFromRelation ||
    readText(properties, ["Zutat", "Ingredient"], "");

  return {
    id: page.id,
    product,
    productKey: slugify(product),
    ingredient,
    ingredientKey: slugify(ingredient),
    amount: readNumber(properties, ["Menge", "Amount", "Anzahl"], 0),
    verified: readText(properties, ["Quelle geprüft?", "Geprüft"], "") === "Ja"
  };
}

export function normalizeBuildingPage(page) {
  const properties = page.properties || {};
  const name = page.title || readTitle(properties);

  return {
    id: page.id,
    key: slugify(name),
    name,
    level: readNumber(properties, ["Level", "level"], 0),
    iconUrl: readFirstFileUrl(properties, ["Icon", "Bild", "Bildlink"], ""),
    active: !readCheckbox(properties, ["Deaktiviert", "Ausgeschlossen"], false)
  };
}

export function normalizeData(rawData) {
  const products = (rawData.mainDatabase || []).map(normalizeProductPage);
  const productsById = new Map(products.map((product) => [product.id, product]));

  const recipes = (rawData.recipeDatabase || []).map((page) =>
    normalizeRecipePage(page, productsById)
  );

  return {
    syncedAt: rawData.syncedAt || null,
    products,
    recipes,
    buildings: [],
    productsByKey: new Map(products.map((product) => [product.key, product])),
    recipesByProductKey: recipes.reduce((map, recipe) => {
      if (!map.has(recipe.productKey)) map.set(recipe.productKey, []);
      map.get(recipe.productKey).push(recipe);
      return map;
    }, new Map())
  };
}
