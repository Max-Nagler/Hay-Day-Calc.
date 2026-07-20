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
  return {
    mode: settings.mode || "coins",
    level: safeNumber(settings.level, 999),
    hours: safeNumber(settings.hours, 8),
    globalSlots: clamp(safeNumber(settings.globalSlots, 5), 1, 10),

    // Gebäudeauswahl
    allowedBuildings: settings.allowedBuildings || [],
    disabledBuildings: settings.disabledBuildings || [],
    slotsByBuilding: settings.slotsByBuilding || {},

    // Zwischenprodukt-Logik
    assumeIntermediateStock: Boolean(settings.assumeIntermediateStock),
    resolveToBaseIngredients: settings.resolveToBaseIngredients !== false
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
    // Slotauslastung: lange Produktionsketten bevorzugen.
    return time;
  }

  // Standard: Coins pro effektiver Minute.
  return (product.coins || 0) / time;
}

function getProductSlots(product, settings) {
  if (settings.slotsByBuilding?.[product.building]) {
    return clamp(
      safeNumber(settings.slotsByBuilding[product.building], settings.globalSlots),
      1,
      10
    );
  }

  return settings.globalSlots;
}

function isBuildingAllowed(product, settings) {
  const building = product.building || "Ohne Gebäude";

  if (settings.disabledBuildings.includes(building)) {
    return false;
  }

  if (settings.allowedBuildings.length > 0) {
    return settings.allowedBuildings.includes(building);
  }

  return true;
}

function getAllowedProducts({ products, settings }) {
  return products
    .filter((product) => {
      const isUnlocked = (product.level || 0) <= settings.level;
      const allowed = isBuildingAllowed(product, settings);
      const hasUsableName = Boolean(product.name);
      const hasValidTime = (product.timeMin || 0) >= 0;

      return isUnlocked && allowed && hasUsableName && hasValidTime;
    })
    .sort(sortByLevelThenName);
}

function analyzeProductChain({
  product,
  amount = 1,
  indexes,
  settings,
  depth = 0,
  visited = new Set()
}) {
  const ingredientsMap = new Map();
  const intermediateMap = new Map();
  const warnings = [];

  if (!product) {
    return {
      ownTimeMin: 0,
      dependencyTimeMin: 0,
      effectiveTimeMin: 0,
      ingredientsMap,
      intermediateMap,
      warnings: ["Produkt nicht gefunden."]
    };
  }

  if (depth > 20) {
    addToMap(ingredientsMap, product.key, amount);
    warnings.push(`Rekursion bei ${product.name} gestoppt.`);

    return {
      ownTimeMin: product.timeMin * amount,
      dependencyTimeMin: 0,
      effectiveTimeMin: product.timeMin * amount,
      ingredientsMap,
      intermediateMap,
      warnings
    };
  }

  if (visited.has(product.key)) {
    addToMap(ingredientsMap, product.key, amount);
    warnings.push(`Zyklisches Rezept erkannt bei ${product.name}.`);

    return {
      ownTimeMin: product.timeMin * amount,
      dependencyTimeMin: 0,
      effectiveTimeMin: product.timeMin * amount,
      ingredientsMap,
      intermediateMap,
      warnings
    };
  }

  const recipeRows = indexes.recipesByProductKey.get(product.key) || [];
  const ownTimeMin = (product.timeMin || 0) * amount;

  // Kein Rezept = Grundzutat / nicht weiter auflösbar
  if (!recipeRows.length) {
    addToMap(ingredientsMap, product.key, amount);

    return {
      ownTimeMin,
      dependencyTimeMin: 0,
      effectiveTimeMin: ownTimeMin,
      ingredientsMap,
      intermediateMap,
      warnings
    };
  }

  const nextVisited = new Set(visited);
  nextVisited.add(product.key);

  let dependencyTimeMin = 0;

  for (const recipe of recipeRows) {
    const ingredientAmount = recipe.amount * amount;
    const ingredientProduct = indexes.productsByKey.get(recipe.ingredientKey);

    if (!ingredientProduct) {
      addToMap(ingredientsMap, recipe.ingredientKey || recipe.ingredient, ingredientAmount);
      warnings.push(`Zutat nicht gefunden: ${recipe.ingredient}`);
      continue;
    }

    const ingredientHasRecipe = indexes.recipesByProductKey.has(ingredientProduct.key);

    if (ingredientHasRecipe) {
      addToMap(intermediateMap, ingredientProduct.key, ingredientAmount);
    }

    if (settings.assumeIntermediateStock && ingredientHasRecipe) {
      // Zwischenprodukt ist auf Lager:
      // Es wird benötigt, aber seine Unterzutaten und Zeit werden nicht berechnet.
      addToMap(ingredientsMap, ingredientProduct.key, ingredientAmount);
      continue;
    }

    if (settings.resolveToBaseIngredients && ingredientHasRecipe) {
      const childAnalysis = analyzeProductChain({
        product: ingredientProduct,
        amount: ingredientAmount,
        indexes,
        settings,
        depth: depth + 1,
        visited: nextVisited
      });

      dependencyTimeMin += childAnalysis.effectiveTimeMin;
      mergeMaps(ingredientsMap, childAnalysis.ingredientsMap);
      mergeMaps(intermediateMap, childAnalysis.intermediateMap);
      warnings.push(...childAnalysis.warnings);
    } else {
      addToMap(ingredientsMap, ingredientProduct.key, ingredientAmount);
    }
  }

  return {
    ownTimeMin,
    dependencyTimeMin,
    effectiveTimeMin: ownTimeMin + dependencyTimeMin,
    ingredientsMap,
    intermediateMap,
    warnings
  };
}

function groupProductsByBuilding(products) {
  return products.reduce((map, product) => {
    const building = product.building || "Ohne Gebäude";

    if (!map.has(building)) {
      map.set(building, []);
    }

    map.get(building).push(product);
    return map;
  }, new Map());
}

/**
 * Erstellt eine Warteschlange pro ausgewähltem/verfügbarem Gebäude.
 *
 * Wichtig:
 * - jedes Gebäude wird unabhängig betrachtet
 * - jedes Gebäude produziert nur 1 Produkt gleichzeitig
 * - Slots = Plätze in der Warteschlange
 * - jedes Gebäude bekommt sein eigenes bestes Produkt
 */
function buildQueuePlan({ products, indexes, settings }) {
  const productsByBuilding = groupProductsByBuilding(products);
  const productionPlan = [];
  const warnings = [];

  for (const [building, buildingProducts] of productsByBuilding.entries()) {
    const candidates = buildingProducts
      .map((product) => {
        const singleChain = analyzeProductChain({
          product,
          amount: 1,
          indexes,
          settings
        });

        return {
          product,
          building,
          effectiveTimeMin: singleChain.effectiveTimeMin,
          ownTimeMin: singleChain.ownTimeMin,
          dependencyTimeMin: singleChain.dependencyTimeMin,
          score: getProductScore(product, settings.mode, singleChain.effectiveTimeMin),
          warnings: singleChain.warnings
        };
      })
      .filter((candidate) => candidate.effectiveTimeMin >= 0)
      .sort((a, b) => {
        return (
          b.score - a.score ||
          (a.product.level || 0) - (b.product.level || 0) ||
          a.product.name.localeCompare(b.product.name)
        );
      });

    const best = candidates[0];

    if (!best) continue;

    warnings.push(...best.warnings);

    const slots = getProductSlots(best.product, settings);
    const availableMinutes = Math.max(settings.hours * 60, 1);
    const singleEffectiveTime = Math.max(best.effectiveTimeMin || best.product.timeMin || 1, 1);

    // Warteschlangenlogik:
    // - maximal so viele Produkte wie freie Slots
    // - mindestens 1 Produkt, wenn ein Kandidat existiert
    // - so viele Produkte, wie sinnvoll in das Zeitfenster passen
    const amountByTime = Math.max(1, Math.ceil(availableMinutes / singleEffectiveTime));
    const amount = clamp(amountByTime, 1, slots);

    const fullChain = analyzeProductChain({
      product: best.product,
      amount,
      indexes,
      settings
    });

    warnings.push(...fullChain.warnings);

    productionPlan.push({
      product: best.product,
      building,
      amount,
      slots,
      ownTimeMin: best.product.timeMin * amount,
      dependencyTimeMin: fullChain.dependencyTimeMin,
      effectiveTimeMin: fullChain.effectiveTimeMin,
      totalTimeMin: fullChain.effectiveTimeMin,
      totalXp: amount * (best.product.xp || 0),
      totalCoins: amount * (best.product.coins || 0),
      score: best.score,
      ingredientsMap: fullChain.ingredientsMap,
      intermediateMap: fullChain.intermediateMap
    });
  }

  return {
    productionPlan: productionPlan.sort((a, b) => {
      return (
        getBuildingSortLevel(a) - getBuildingSortLevel(b) ||
        a.building.localeCompare(b.building) ||
        a.product.name.localeCompare(b.product.name)
      );
    }),
    warnings
  };
}

function getBuildingSortLevel(entry) {
  return entry.product?.level || 0;
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
  assumeIntermediateStock = false,
  resolveToBaseIngredients = true
}) {
  const settings = createDefaultSettings({
    mode,
    level,
    hours,
    globalSlots,
    allowedBuildings,
    disabledBuildings,
    slotsByBuilding,
    assumeIntermediateStock,
    resolveToBaseIngredients
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
      sum.effectiveTimeMin += entry.effectiveTimeMin;
      sum.buildings += 1;
      return sum;
    },
    {
      xp: 0,
      coins: 0,
      products: 0,
      buildings: 0,
      effectiveTimeMin: 0
    }
  );

  return {
    settings,
    mode: settings.mode,
    level: settings.level,
    hours: settings.hours,
    totals,
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
