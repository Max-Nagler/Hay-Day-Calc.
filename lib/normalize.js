import { getIconInfo } from "./data/iconUtils";

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return normalizeName(value)
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getProperties(page) {
  return page?.properties || {};
}

function getPageId(page) {
  return page?.id || page?.url || "";
}

function normalizeId(value) {
  return String(value || "").replace(/-/g, "");
}

function getProperty(properties, names) {
  const wanted = names.map(normalizeName);

  for (const [key, value] of Object.entries(properties || {})) {
    if (wanted.includes(normalizeName(key))) {
      return value;
    }
  }

  return null;
}

function readTitleFromProperty(property) {
  if (!property) return "";

  if (property.type === "title") {
    return property.title?.map((item) => item.plain_text || "").join("").trim() || "";
  }

  if (property.type === "rich_text") {
    return property.rich_text?.map((item) => item.plain_text || "").join("").trim() || "";
  }

  if (property.type === "formula") {
    if (property.formula?.type === "string") return property.formula.string || "";
    if (property.formula?.type === "number") return String(property.formula.number || "");
  }

  if (typeof property === "string") return property;

  return "";
}

function readTitle(page) {
  if (!page) return "";

  if (page.title) return page.title;

  const properties = getProperties(page);

  for (const value of Object.values(properties)) {
    if (value?.type === "title") {
      return readTitleFromProperty(value);
    }
  }

  return "";
}

function readTextFromProperty(property) {
  if (!property) return "";

  if (typeof property === "string") return property;

  if (property.type === "title") {
    return property.title?.map((item) => item.plain_text || "").join("").trim() || "";
  }

  if (property.type === "rich_text") {
    return property.rich_text?.map((item) => item.plain_text || "").join("").trim() || "";
  }

  if (property.type === "select") {
    return property.select?.name || "";
  }

  if (property.type === "status") {
    return property.status?.name || "";
  }

  if (property.type === "multi_select") {
    return property.multi_select?.map((item) => item.name).join(", ") || "";
  }

  if (property.type === "url") {
    return property.url || "";
  }

  if (property.type === "formula") {
    if (property.formula?.type === "string") return property.formula.string || "";
    if (property.formula?.type === "number") return String(property.formula.number ?? "");
    if (property.formula?.type === "boolean") return property.formula.boolean ? "Ja" : "Nein";
  }

  if (property.type === "rollup") {
    if (property.rollup?.type === "array") {
      return (
        property.rollup.array
          ?.map((item) => readTextFromProperty(item))
          .filter(Boolean)
          .join(", ") || ""
      );
    }

    if (property.rollup?.type === "number") return String(property.rollup.number ?? "");
  }

  return "";
}

function readText(properties, names, fallback = "") {
  const property = getProperty(properties, names);
  const value = readTextFromProperty(property);
  return value || fallback;
}

function readNumber(properties, names, fallback = 0) {
  const property = getProperty(properties, names);
  if (!property) return fallback;

  if (typeof property === "number") return property;

  if (property.type === "number") {
    return Number.isFinite(property.number) ? property.number : fallback;
  }

  if (property.type === "formula" && property.formula?.type === "number") {
    return Number.isFinite(property.formula.number) ? property.formula.number : fallback;
  }

  if (property.type === "rollup") {
    if (property.rollup?.type === "number") {
      return Number.isFinite(property.rollup.number) ? property.rollup.number : fallback;
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
        .find((value) => Number.isFinite(value));

      return Number.isFinite(firstNumber) ? firstNumber : fallback;
    }
  }

  const text = readTextFromProperty(property);
  const parsed = Number(String(text).replace(",", "."));

  return Number.isFinite(parsed) ? parsed : fallback;
}

function readCheckbox(properties, names, fallback = false) {
  const property = getProperty(properties, names);
  if (!property) return fallback;

  if (typeof property === "boolean") return property;

  if (property.type === "checkbox") return Boolean(property.checkbox);

  return fallback;
}

function readRelationIds(properties, names) {
  let property = getProperty(properties, names);

  if (!property) {
    const wanted = names.map(normalizeName);

    property = Object.entries(properties || {}).find(([key, value]) => {
      if (value?.type !== "relation") return false;

      const normalizedKey = normalizeName(key);
      return wanted.some((name) => normalizedKey.includes(name) || name.includes(normalizedKey));
    })?.[1];
  }

  if (!property) return [];

  if (property.type === "relation") {
    return property.relation?.map((item) => item.id).filter(Boolean) || [];
  }

  if (Array.isArray(property)) {
    return property.map((item) => item.id || item).filter(Boolean);
  }

  return [];
}

function readMultiSelect(properties, names) {
  const property = getProperty(properties, names);

  if (!property) return [];

  if (property.type === "multi_select") {
    return property.multi_select?.map((item) => item.name).filter(Boolean) || [];
  }

  if (property.type === "select") {
    return property.select?.name ? [property.select.name] : [];
  }

  const text = readTextFromProperty(property);

  return text
    ? text
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function hasCategory(categories, categoryName) {
  const wanted = normalizeName(categoryName);

  return categories.some((category) => normalizeName(category) === wanted);
}

function parseTimeToMinutes(value) {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    return value;
  }

  const text = String(value).trim().toLowerCase();

  if (!text) return 0;

  const numeric = Number(text.replace(",", "."));
  if (Number.isFinite(numeric)) return numeric;

  let minutes = 0;

  const hourMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(h|std|stunde|stunden)/);
  const minuteMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(m|min|minute|minuten)/);

  if (hourMatch) {
    minutes += Number(hourMatch[1].replace(",", ".")) * 60;
  }

  if (minuteMatch) {
    minutes += Number(minuteMatch[1].replace(",", "."));
  }

  return Math.round(minutes);
}

function buildPageMaps(pages) {
  const pageById = {};
  const nameById = {};

  for (const page of pages || []) {
    const id = getPageId(page);
    const normalizedId = normalizeId(id);
    const name = readTitle(page);

    if (id) {
      pageById[id] = page;
    }

    if (normalizedId) {
      pageById[normalizedId] = page;
    }

    if (id && name) {
      nameById[id] = name;
    }

    if (normalizedId && name) {
      nameById[normalizedId] = name;
    }
  }

  return {
    pageById,
    nameById
  };
}

function getIconUrl(page) {
  return getIconInfo(page).url;
}

function normalizeBuildingPage(page) {
  const properties = getProperties(page);
  const name = readTitle(page);
  const categories = readMultiSelect(properties, ["Kategorie", "Kategorien", "Typ", "Art"]);

  const iconInfo = getIconInfo(page);

  return {
    id: getPageId(page),
    key: slugify(name),
    name,
    level: readNumber(properties, ["Level", "Lvl", "Freischaltlevel"], 0),
    categories,
    type: categories.join(", "),
    iconUrl: iconInfo.url,
    iconSource: iconInfo.source,
    slots: readNumber(properties, ["Produktionsslots", "Slots", "Produktionsplätze"], 0)
  };
}

function getFirstRelatedBuilding({ properties, pageById, buildingById }) {
  const relationIds = readRelationIds(properties, [
    "Produktionsgebäude",
    "Gebäude",
    "Building",
    "Maschine",
    "Produziert in",
    "Produziert mit",
    "Herstellungsgebäude",
    "Produktionsmaschine",
    "Produktionsort"
  ]);

  for (const id of relationIds) {
    const normalizedId = normalizeId(id);

    if (buildingById[id] || buildingById[normalizedId]) {
      return buildingById[id] || buildingById[normalizedId];
    }

    const relatedPage = pageById[id] || pageById[normalizedId];

    if (relatedPage) {
      return normalizeBuildingPage(relatedPage);
    }
  }

  return null;
}

function normalizeProductPage(page, helpers) {
  const { pageById, buildingById } = helpers;

  const properties = getProperties(page);
  const name = readTitle(page);
  const key = slugify(name || getPageId(page));
  const categories = readMultiSelect(properties, ["Kategorie", "Kategorien", "Typ", "Art"]);

  const building = getFirstRelatedBuilding({
    properties,
    pageById,
    buildingById
  });

  const timeNumber = readNumber(
    properties,
    [
      "Produktionszeit",
      "Produktionszeit Minuten",
      "Zeit Minuten",
      "Minuten",
      "Produktionsdauer Minuten"
    ],
    0
  );

  const timeText = readText(properties, [
    "Produktionszeit",
    "Zeit",
    "Dauer",
    "Produktionsdauer"
  ]);

  const iconInfo = getIconInfo(page);

  return {
    id: getPageId(page),
    key,
    name,
    categories,
    level: readNumber(properties, ["Level", "level", "Lvl", "Freischaltlevel"], 0),

    coins: readNumber(properties, ["Verkaufspreis", "MaxPreis", "Max Preis", "Preis", "Coins"], 0),
    timeMin: timeNumber || parseTimeToMinutes(timeText),
    amount: readNumber(properties, ["Menge", "Bestand", "Lagerbestand"], 0),
    building: building?.name || "",
    buildingKey: building?.key || "",
    buildingIconUrl: building?.iconUrl || "",
    buildingSlots: building?.slots || 0,
    type: categories.join(", "),
    iconUrl: iconInfo.url,
    iconSource: iconInfo.source,
    verified: readCheckbox(properties, ["Quelle geprüft?", "Geprüft", "Verified"], false)
  };
}

function normalizeRecipePage(page, helpers) {
  const { pageById, nameById } = helpers;
  const properties = getProperties(page);

  function getRelationName(names) {
    const ids = readRelationIds(properties, names);

    for (const id of ids) {
      const normalizedId = normalizeId(id);

      if (nameById[id] || nameById[normalizedId]) return nameById[id] || nameById[normalizedId];

      const relatedPage = pageById[id] || pageById[normalizedId];
      const title = readTitle(relatedPage);

      if (title) return title;
    }

    return "";
  }

  const productName =
    getRelationName(["Produkt", "Product", "Erzeugnis", "Produkt Relation", "Output", "Herstellung"]) ||
    readText(properties, ["Produkt", "Product", "Erzeugnis", "Output", "Herstellung"], "");

  const ingredientName =
    getRelationName(["Zutat", "Ingredient", "Zutat Relation", "Zutaten", "Input", "Benötigt", "Benötigte Zutat"]) ||
    readText(properties, ["Zutat", "Ingredient", "Zutaten", "Input", "Benötigt", "Benötigte Zutat"], "");

  return {
    id: getPageId(page),
    product: productName,
    productKey: slugify(productName),
    ingredient: ingredientName,
    ingredientKey: slugify(ingredientName),
    amount: readNumber(properties, ["Menge", "Amount", "Anzahl", "Qty"], 1)
  };
}

export function normalizeData(rawData) {
  const mainPages = rawData?.mainDatabase || [];
  const recipePages = rawData?.recipeDatabase || [];

  const { pageById, nameById } = buildPageMaps([...mainPages, ...recipePages]);

  const rawBuildings = mainPages
    .filter((page) => {
      const properties = getProperties(page);
      const categories = readMultiSelect(properties, ["Kategorie", "Kategorien", "Typ", "Art"]);

      return hasCategory(categories, "Produktionsgebäude");
    })
    .map(normalizeBuildingPage)
    .filter((building) => building.name);

  const buildingById = {};

  for (const building of rawBuildings) {
    if (building.id) {
      buildingById[building.id] = building;
      buildingById[normalizeId(building.id)] = building;
    }
  }

  const products = mainPages
    .filter((page) => {
      const properties = getProperties(page);
      const categories = readMultiSelect(properties, ["Kategorie", "Kategorien", "Typ", "Art"]);

      return !hasCategory(categories, "Produktionsgebäude");
    })
    .map((page) =>
      normalizeProductPage(page, {
        pageById,
        buildingById
      })
    )
    .filter((product) => product.name);

  const recipes = recipePages
    .map((page) =>
      normalizeRecipePage(page, {
        pageById,
        nameById
      })
    )
    .filter((recipe) => recipe.product && recipe.ingredient);

  return {
    products,
    recipes,
    buildings: rawBuildings
  };
}
