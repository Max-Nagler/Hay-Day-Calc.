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

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
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

    intermediateMustBeProduced: Boolean(intermediateMustBeProduced),
    excludedIngredientNames: settings.excludedIngredientNames || []
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
  const customValue = settings.slotsByBuilding?.[building];

  if (customValue !== undefined && customValue !== null && customValue !== "") {
    return clamp(safeNumber(customValue, settings.globalSlots), 1, 10);
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
    (product.timeMin || 0) > 0 &&
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

function isIngredientExcluded(product, settings) {
  if (!product) return false;

  const excluded = new Set(settings.excludedIngredientNames.map(normalizeName));
  return excluded.has(normalizeName(product.name));
}

function collectRequirements({
  product,
  amount,
  indexes,
  settings,
  ingredientsMap,
  intermediateMap,
  productionRequirements,
  warnings,
  excludedHits,
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

    if (isIngredientExcluded(ingredientProduct, settings)) {
      excludedHits.push(ingredientProduct.name);
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
        excludedHits,
        depth: depth + 1,
        visited: nextVisited
      });
    } else {
      addToMap(ingredientsMap, ingredientProduct.key, ingredientAmount);
    }
  }
}

function analyzeRequirements({ product, amount, indexes, settings, warnings }) {
  const ingredientsMap = new Map();
  const intermediateMap = new Map();
  const productionRequirements = new Map();
  const excludedHits = [];

  collectRequirements({
    product,
    amount,
    indexes,
    settings,
    ingredientsMap,
    intermediateMap,
    productionRequirements,
    warnings,
    excludedHits
  });

  return {
    ingredientsMap,
    intermediateMap,
    productionRequirements,
    excludedHits: [...new Set(excludedHits)]
  };
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
      total +=
        recipe.amount *
        estimateSingleChainTime(ingredientProduct, indexes, settings, nextVisited);
    }
  }

  return Math.max(total, 1);
}

function createProductionEntry({ product, amount, role, indexes, settings, warnings }) {
  const analysis = analyzeRequirements({
    product,
    amount,
    indexes,
    settings,
    warnings
  });

  const building = getBuildingName(product);
  const slots = getSlotsForBuilding(building, settings);
  const ownTimeMin = (product.timeMin || 0) * amount;

  return {
    product,
    building,
    role,
    amount,
    slotsUsed: amount,
    slots,
    ownTimeMin,
    effectiveTimeMin: ownTimeMin,
    totalTimeMin: ownTimeMin,
    totalXp: amount * (product.xp || 0),
    totalCoins: amount * (product.coins || 0),
    ...analysis
  };
}

function getBestProductForBuilding(products, building, indexes, settings) {
  const warnings = [];

  const candidates = products
    .filter((product) => getBuildingName(product) === building)
    .map((product) => {
      const singleTime = estimateSingleChainTime(product, indexes, settings);

      const analysis = analyzeRequirements({
        product,
        amount: 1,
        indexes,
        settings,
        warnings
      });

      return {
        product,
        singleTime,
        score: getProductScore(product, settings.mode, singleTime),
        excludedHits: analysis.excludedHits
      };
    })
    .filter((candidate) => candidate.excludedHits.length === 0)
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

  if (singleTime > availableMinutes) {
    return 0;
  }

  const amountByTime = Math.floor(availableMinutes / Math.max(singleTime, 1));

  return clamp(amountByTime, 0, freeSlots);
}

function getMaxMainAmountByIntermediateSlots({
  product,
  wantedAmount,
  indexes,
  settings,
  getFreeSlotsForBuilding
}) {
  if (!settings.intermediateMustBeProduced) return wantedAmount;

  let allowedAmount = wantedAmount;

  while (allowedAmount > 0) {
    const warnings = [];

    const analysis = analyzeRequirements({
      product,
      amount: allowedAmount,
      indexes,
      settings,
      warnings
    });

    let fits = true;

    for (const [intermediateKey, neededAmount] of analysis.productionRequirements.entries()) {
      const intermediateProduct = indexes.productsByKey.get(intermediateKey);
      if (!intermediateProduct) continue;

      const intermediateBuilding = getBuildingName(intermediateProduct);
      const freeSlots = getFreeSlotsForBuilding(intermediateBuilding);

      if (neededAmount > freeSlots) {
        fits = false;
        break;
      }
    }

    if (fits) {
      return allowedAmount;
    }

    allowedAmount -= 1;
  }

  return 0;
}

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

  for (const building of allBuildings) {
    const best = getBestProductForBuilding(products, building, indexes, settings);
    if (!best) continue;

    const ownFreeSlots = getFreeSlots(building);
    const wantedAmount = getAmountForQueue(best.product, indexes, settings, ownFreeSlots);

    if (wantedAmount <= 0) {
      warnings.push(
        `${best.product.name} wurde übersprungen, weil die Produktionszeit länger als ${settings.hours} h ist.`
      );
      continue;
    }

    const amount = getMaxMainAmountByIntermediateSlots({
      product: best.product,
      wantedAmount,
      indexes,
      settings,
      getFreeSlotsForBuilding: getFreeSlots
    });

    if (amount <= 0) {
      warnings.push(
        `${best.product.name} wurde übersprungen, weil benötigte Zwischenprodukte nicht in freie Slots passen.`
      );
      continue;
    }

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

      if (requirement.amount > freeSlots) {
        warnings.push(
          `${requirement.amount}× ${requirement.product.name} passt nicht in ${freeSlots} freie Slots von ${building}.`
        );
        continue;
      }

      const entry = createProductionEntry({
        product: requirement.product,
        amount: requirement.amount,
        role: "intermediate",
        indexes,
        settings,
        warnings
      });

      productionPlan.push(entry);
      addUsedSlots(building, requirement.amount);
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
  excludedIngredientNames = [],

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
      (resolveToBaseIngredients === true && assumeIntermediateStock !== true),
    excludedIngredientNames
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
