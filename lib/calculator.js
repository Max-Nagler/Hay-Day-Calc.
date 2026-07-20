function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function addToMap(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

function mergeMaps(target, source) {
  for (const [key, amount] of source.entries()) {
    addToMap(target, key, amount);
  }
}

function sortByLevelThenName(a, b) {
  return (a.level || 0) - (b.level || 0) || a.name.localeCompare(b.name);
}

function createDefaultSettings(settings = {}) {
  const intermediateMustBeProduced =
    settings.intermediateMustBeProduced ??
    settings.resolveToBaseIngredients ??
    false;

  return {
    mode: settings.mode || "coins",
    level: safeNumber(settings.level, 999),
    hours: safeNumber(settings.hours, 8),
    globalSlots: clamp(safeNumber(settings.globalSlots, 5), 1, 10),

    allowedBuildings: settings.allowedBuildings || [],
    disabledBuildings: settings.disabledBuildings || [],
    slotsByBuilding: settings.slotsByBuilding || {},

    intermediateMustBeProduced: Boolean(intermediateMustBeProduced)
  };
}

function buildIndexes(products, recipes) {
  const productsByKey = new Map(products.map((product) => [product.key, product]));

  const recipesByProductKey = recipes.reduce((map, recipe) => {
    if (!map.has(recipe.productKey)) {
      map.set(recipe.productKey, []);
    }

    map.get(recipe.productKey).push(recipe);
    return map;
  }, new Map());

  return {
    productsByKey,
    recipesByProductKey
  };
}

function getProductScore(product, mode, effectiveTimeMin) {
  const time = Math.max(effectiveTimeMin || product.timeMin || 1, 1);

  if (mode === "xp") {
    return (product.xp || 0) / time;
  }

  if (mode === "slots") {
    return time;
  }

  return (product.coins || 0) / time;
}

function getBuildingName(product) {
  return product.building || "Ohne Gebäude";
}

function getSlotsForBuilding(building, settings) {
  if (settings.slotsByBuilding?.[building]) {
    return clamp(
      safeNumber(settings.slotsByBuilding[building], settings.globalSlots),
      1,
      10
    );
  }

  return settings.globalSlots;
}

function isBuildingAllowedName(building, settings) {
  if (settings.disabledBuildings.includes(building)) return false;

  if (settings.allowedBuildings.length > 0) {
    return settings.allowedBuildings.includes(building);
  }

  return true;
}

function isProductAllowed(product, settings) {
  const building = getBuildingName(product);

  return (
    product.name &&
    (product.level || 0) <= settings.level &&
    (product.timeMin || 0) >= 0 &&
    isBuildingAllowedName(building, settings)
  );
}

function getAllowedProducts({ products, settings }) {
  return products.filter((product) => isProductAllowed(product, settings)).sort(sortByLevelThenName);
}

function groupProductsByBuilding(products) {
  return products.reduce((map, product) => {
    const building = getBuildingName(product);

    if (!map.has(building)) {
      map.set(building, []);
    }

    map.get(building).push(product);
    return map;
  }, new Map());
}

function hasRecipe(product, indexes) {
  return indexes.recipesByProductKey.has(product.key);
}

/**
 * Sammelt die Produktmengen, die für ein Produkt nötig sind.
 *
 * Wenn Zwischenprodukte hergestellt werden müssen:
 * - Zwischenprodukte landen in productionRequirements
 * - deren Unterzutaten werden weiter aufgelöst
 *
 * Wenn Zwischenprodukte NICHT hergestellt werden müssen:
 * - Zwischenprodukte gelten als Lagerware und landen direkt in ingredientsMap
 */
function collectRequirements({
  product,
  amount,
  indexes,
  settings,
  ingredientsMap,
  intermediateMap,
  productionRequirements,
  warnings,
  depth = 0,
  visited = new Set()
}) {
  if (!product) return;

  if (depth > 20) {
    addToMap(ingredientsMap, product.key, amount);
    warnings.push(`Rekursion bei ${product.name} gestoppt.`);
    return;
  }

  if (visited.has(product.key)) {
    addToMap(ingredientsMap, product.key, amount);
    warnings.push(`Zyklisches Rezept erkannt bei ${product.name}.`);
    return;
  }

  const recipeRows = indexes.recipesByProductKey.get(product.key) || [];

  if (!recipeRows.length) {
    addToMap(ingredientsMap, product.key, amount);
    return;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(product.key);

  for (const recipe of recipeRows) {
    const ingredientAmount = recipe.amount * amount;
    const ingredientProduct = indexes.productsByKey.get(recipe.ingredientKey);

    if (!ingredientProduct) {
      addToMap(ingredientsMap, recipe.ingredientKey || recipe.ingredient, ingredientAmount);
      warnings.push(`Zutat nicht gefunden: ${recipe.ingredient}`);
      continue;
    }

    const ingredientHasRecipe = hasRecipe(ingredientProduct, indexes);

    if (ingredientHasRecipe) {
      addToMap(intermediateMap, ingredientProduct.key, ingredientAmount);
    }

    if (ingredientHasRecipe && settings.intermediateMustBeProduced) {
      addToMap(productionRequirements, ingredientProduct.key, ingredientAmount);

      collectRequirements({
        product: ingredientProduct,
        amount: ingredientAmount,
        indexes,
        settings,
        ingredientsMap,
        intermediateMap,
        productionRequirements,
        warnings,
        depth: depth + 1,
        visited: nextVisited
      });
    } else {
      addToMap(ingredientsMap, ingredientProduct.key, ingredientAmount);
    }
  }
}

function estimateSingleChainTime(product, indexes, settings, visited = new Set()) {
  if (!settings.intermediateMustBeProduced) {
    return Math.max(product.timeMin || 1, 1);
  }

  if (visited.has(product.key)) {
    return Math.max(product.timeMin || 1, 1);
  }

  const recipeRows = indexes.recipesByProductKey.get(product.key) || [];
  const nextVisited = new Set(visited);
  nextVisited.add(product.key);

  let total = Math.max(product.timeMin || 1, 1);

  for (const recipe of recipeRows) {
    const ingredientProduct = indexes.productsByKey.get(recipe.ingredientKey);

    if (!ingredientProduct) continue;

    if (hasRecipe(ingredientProduct, indexes)) {
      total += recipe.amount * estimateSingleChainTime(ingredientProduct, indexes, settings, nextVisited);
    }
  }

  return Math.max(total, 1);
}

function createProductionEntry({ product, amount, role, indexes, settings, warnings }) {
  const ingredientsMap = new Map();
  const intermediateMap = new Map();
  const productionRequirements = new Map();

  collectRequirements({
    product,
    amount,
    indexes,
    settings,
    ingredientsMap,
    intermediateMap,
    productionRequirements,
    warnings
  });

  const building = getBuildingName(product);

  return {
    product,
    building,
    role,
    amount,
    slotsUsed: amount,
    slots: getSlotsForBuilding(building, settings),
    ownTimeMin: (product.timeMin || 0) * amount,
    effectiveTimeMin: (product.timeMin || 0) * amount,
    totalTimeMin: (product.timeMin || 0) * amount,
    totalXp: amount * (product.xp || 0),
    totalCoins: amount * (product.coins || 0),
    ingredientsMap,
    intermediateMap,
    productionRequirements
  };
}

function getBestProductForBuilding(products, building, indexes, settings) {
  const candidates = products
    .filter((product) => getBuildingName(product) === building)
    .map((product) => {
      const singleTime = estimateSingleChainTime(product, indexes, settings);

      return {
        product,
        singleTime,
        score: getProductScore(product, settings.mode, singleTime)
      };
    })
    .sort((a, b) => {
      return (
        b.score - a.score ||
        (a.product.level || 0) - (b.product.level || 0) ||
        a.product.name.localeCompare(b.product.name)
      );
    });

  return candidates[0] || null;
}

function getAmountForQueue(product, indexes, settings, freeSlots) {
  if (freeSlots <= 0) return 0;

  const availableMinutes = Math.max(settings.hours * 60, 1);
  const singleTime = estimateSingleChainTime(product, indexes, settings);
  const amountByTime = Math.max(1, Math.ceil(availableMinutes / Math.max(singleTime, 1)));

  return clamp(amountByTime, 1, freeSlots);
}

/**
 * Baut den Produktionsplan in zwei Phasen:
 *
 * Phase 1:
 * - pro Gebäude das beste Endprodukt wählen
 *
 * Phase 2:
 * - Zwischenprodukte als eigene Produktionsaufträge einplanen
 * - sie belegen Slots in ihrem jeweiligen Gebäude
 * - Restslots werden mit Empfehlungen gefüllt
 */
function buildQueuePlan({ products, indexes, settings }) {
  const productsByBuilding = groupProductsByBuilding(products);
  const allBuildings = Array.from(productsByBuilding.keys()).sort();

  const warnings = [];
  const productionPlan = [];
  const usedSlotsByBuilding = new Map();
  const requiredProductionByKey = new Map();

  function getUsedSlots(building) {
    return usedSlotsByBuilding.get(building) || 0;
  }

  function addUsedSlots(building, amount) {
    usedSlotsByBuilding.set(building, getUsedSlots(building) + amount);
  }

  function getFreeSlots(building) {
    return Math.max(getSlotsForBuilding(building, settings) - getUsedSlots(building), 0);
  }

  // Phase 1: Hauptproduktion pro Gebäude
  for (const building of allBuildings) {
    const best = getBestProductForBuilding(products, building, indexes, settings);
    if (!best) continue;

    const freeSlots = getFreeSlots(building);
    const amount = getAmountForQueue(best.product, indexes, settings, freeSlots);
    if (amount <= 0) continue;

    const entry = createProductionEntry({
      product: best.product,
      amount,
      role: "main",
      indexes,
      settings,
      warnings
    });

    productionPlan.push(entry);
    addUsedSlots(building, amount);

    if (settings.intermediateMustBeProduced) {
      mergeMaps(requiredProductionByKey, entry.productionRequirements);
    }
  }

  // Phase 2: Zwischenprodukte einplanen und Slots blockieren
  if (settings.intermediateMustBeProduced) {
    const sortedRequirements = Array.from(requiredProductionByKey.entries())
      .map(([key, amount]) => ({
        product: indexes.productsByKey.get(key),
        amount
      }))
      .filter((item) => item.product)
      .sort((a, b) => sortByLevelThenName(a.product, b.product));

    for (const requirement of sortedRequirements) {
      const building = getBuildingName(requirement.product);
      const freeSlots = getFreeSlots(building);

      if (freeSlots <= 0) {
        warnings.push(
          `Nicht genug freie Slots in ${building} für ${requirement.amount}× ${requirement.product.name}.`
        );
        continue;
      }

      const amount = Math.min(requirement.amount, freeSlots);

      if (amount < requirement.amount) {
        warnings.push(
          `Nur ${amount} von ${requirement.amount}× ${requirement.product.name} passen in die Warteschlange von ${building}.`
        );
      }

      const entry = createProductionEntry({
        product: requirement.product,
        amount,
        role: "intermediate",
        indexes,
        settings,
        warnings
      });

      productionPlan.push(entry);
      addUsedSlots(building, amount);
    }
  }

  return {
    productionPlan: productionPlan.sort((a, b) => {
      return (
        (a.product.level || 0) - (b.product.level || 0) ||
        a.building.localeCompare(b.building) ||
        a.product.name.localeCompare(b.product.name) ||
        a.role.localeCompare(b.role)
      );
    }),
    warnings
  };
}

function mapEntriesToItems(map, productsByKey) {
  return Array.from(map.entries())
    .map(([key, amount]) => {
      const product = productsByKey.get(key);

      return {
        key,
        name: product?.name || key,
        amount,
        level: product?.level || 0,
        type: product?.type || "",
        building: product?.building || "",
        iconUrl: product?.iconUrl || ""
      };
    })
    .sort(sortByLevelThenName);
}

function groupIngredients(items) {
  const groups = {
    field: {
      title: "Feld",
      items: []
    },
    animals: {
      title: "Tiergehege",
      items: []
    },
    buildings: {
      title: "Produktionsgebäude",
      items: []
    },
    other: {
      title: "Sonstiges",
      items: []
    }
  };

  for (const item of items) {
    const type = String(item.type || "").toLowerCase();
    const building = String(item.building || "").toLowerCase();
    const name = String(item.name || "").toLowerCase();

    if (
      type.includes("feld") ||
      type.includes("pflanze") ||
      type.includes("frucht") ||
      type.includes("baum") ||
      type.includes("busch")
    ) {
      groups.field.items.push(item);
      continue;
    }

    if (
      type.includes("tier") ||
      building.includes("tiergehege") ||
      ["ei", "milch", "speck", "wolle", "ziegenmilch"].includes(name)
    ) {
      groups.animals.items.push(item);
      continue;
    }

    if (item.building) {
      groups.buildings.items.push(item);
      continue;
    }

    groups.other.items.push(item);
  }

  return Object.values(groups).filter((group) => group.items.length > 0);
}

function groupProductionPlanByBuilding(productionPlan) {
  const groups = productionPlan.reduce((map, entry) => {
    if (!map.has(entry.building)) {
      map.set(entry.building, {
        building: entry.building,
        minLevel: entry.product.level || 0,
        items: []
      });
    }

    const group = map.get(entry.building);
    group.minLevel = Math.min(group.minLevel, entry.product.level || 0);
    group.items.push(entry);

    return map;
  }, new Map());

  return Array.from(groups.values()).sort((a, b) => {
    return a.minLevel - b.minLevel || a.building.localeCompare(b.building);
  });
}

export function calculateProductionPlan({
  products,
  recipes,
  mode = "coins",
  level = 999,
  hours = 8,
  globalSlots = 5,
  allowedBuildings = [],
  disabledBuildings = [],
  slotsByBuilding = {},
  intermediateMustBeProduced = false,

  // Legacy Props, damit alte page.js-Versionen nicht direkt brechen:
  assumeIntermediateStock,
  resolveToBaseIngredients
}) {
  const settings = createDefaultSettings({
    mode,
    level,
    hours,
    globalSlots,
    allowedBuildings,
    disabledBuildings,
    slotsByBuilding,
    intermediateMustBeProduced:
      intermediateMustBeProduced ||
      (resolveToBaseIngredients === true && assumeIntermediateStock !== true)
  });

  const indexes = buildIndexes(products, recipes);

  const allowedProducts = getAllowedProducts({
    products,
    settings
  });

  const { productionPlan, warnings } = buildQueuePlan({
    products: allowedProducts,
    indexes,
    settings
  });

  const ingredientsMap = new Map();
  const intermediateMap = new Map();

  for (const entry of productionPlan) {
    mergeMaps(ingredientsMap, entry.ingredientsMap);
    mergeMaps(intermediateMap, entry.intermediateMap);
  }

  const ingredients = mapEntriesToItems(ingredientsMap, indexes.productsByKey);
  const intermediateProducts = mapEntriesToItems(intermediateMap, indexes.productsByKey);

  const totals = productionPlan.reduce(
    (sum, entry) => {
      sum.xp += entry.totalXp;
      sum.coins += entry.totalCoins;
      sum.products += entry.amount;
      sum.buildings.add(entry.building);
      sum.effectiveTimeMin += entry.effectiveTimeMin;
      return sum;
    },
    {
      xp: 0,
      coins: 0,
      products: 0,
      buildings: new Set(),
      effectiveTimeMin: 0
    }
  );

  return {
    settings,
    mode: settings.mode,
    level: settings.level,
    hours: settings.hours,
    totals: {
      ...totals,
      buildings: totals.buildings.size
    },
    productionPlan,
    productionByBuilding: groupProductionPlanByBuilding(productionPlan),
    ingredients,
    ingredientGroups: groupIngredients(ingredients),
    intermediateProducts,
    warnings: [...new Set(warnings)]
  };
}

export function getAvailableBuildings(products, level = 999) {
  const buildings = new Map();

  for (const product of products) {
    if (!product.building) continue;
    if ((product.level || 0) > level) continue;

    if (!buildings.has(product.building)) {
      buildings.set(product.building, {
        name: product.building,
        level: product.level || 0,
        iconUrl: product.iconUrl || ""
      });
    }

    const building = buildings.get(product.building);
    building.level = Math.min(building.level, product.level || 0);

    if (!building.iconUrl && product.iconUrl) {
      building.iconUrl = product.iconUrl;
    }
  }

  return Array.from(buildings.values()).sort((a, b) => {
    return a.level - b.level || a.name.localeCompare(b.name);
  });
}
