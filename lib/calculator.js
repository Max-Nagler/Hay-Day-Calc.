function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function slugKey(value) {
  return normalizeName(value).replace(/[^a-z0-9äöüß]+/g, "-");
}

function addToMap(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

function mergeMaps(target, source, factor = 1) {
  for (const [key, amount] of source.entries()) {
    addToMap(target, key, amount * factor);
  }
}

function cloneMap(source) {
  return new Map(source || []);
}

function sortByLevelThenName(a, b) {
  return (a.level || 0) - (b.level || 0) || String(a.name || "").localeCompare(String(b.name || ""), "de");
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
    defaultSlotsByBuilding: settings.defaultSlotsByBuilding || {},
    intermediateMustBeProduced: Boolean(intermediateMustBeProduced),
    excludedIngredientNames: settings.excludedIngredientNames || []
  };
}

function buildIndexes(products, recipes) {
  const productsByKey = new Map((products || []).map((product) => [product.key, product]));
  const recipesByProductKey = new Map();

  for (const recipe of recipes || []) {
    if (!recipe.productKey) continue;
    if (!recipesByProductKey.has(recipe.productKey)) recipesByProductKey.set(recipe.productKey, []);
    recipesByProductKey.get(recipe.productKey).push(recipe);
  }

  return { productsByKey, recipesByProductKey };
}

function getBuildingName(product) {
  return product?.building || "Ohne Gebäude";
}

function getSlotsForBuilding(building, settings) {
  const customValue = settings.slotsByBuilding?.[building];

  if (customValue !== undefined && customValue !== null && customValue !== "") {
    return clamp(safeNumber(customValue, settings.globalSlots), 1, 10);
  }

  const databaseValue = settings.defaultSlotsByBuilding?.[building];

  if (databaseValue !== undefined && databaseValue !== null && databaseValue !== "") {
    return clamp(safeNumber(databaseValue, settings.globalSlots), 1, 10);
  }

  return settings.globalSlots;
}

function getBuildingCapacityMinutes(building, settings) {
  return getSlotsForBuilding(building, settings) * Math.max(settings.hours * 60, 1);
}

function isBuildingAllowedName(building, settings) {
  if (settings.disabledBuildings.includes(building)) return false;
  if (settings.allowedBuildings.length > 0) return settings.allowedBuildings.includes(building);
  return true;
}

function isIngredientExcluded(product, settings) {
  if (!product) return false;
  const excluded = new Set(settings.excludedIngredientNames.map(normalizeName));
  return excluded.has(normalizeName(product.name));
}

function hasRecipe(product, indexes) {
  return indexes.recipesByProductKey.has(product?.key);
}

function isRawProduct(product) {
  if (!product) return true;
  return !product.building || !product.timeMin;
}

function getMetricValue(product, mode) {
  return mode === "xp" ? safeNumber(product.xp, 0) : safeNumber(product.coins, 0);
}

function createEmptyAnalysis() {
  return {
    feasible: true,
    reasons: [],
    warnings: [],
    directIngredientsMap: new Map(),
    baseIngredientsMap: new Map(),
    intermediateMap: new Map(),
    productionRequirements: new Map(),
    capacityMinutesByBuilding: new Map(),
    slotsByBuilding: new Map()
  };
}

/**
 * Rekursive Rezeptauflösung.
 * Für ein Zielprodukt wird je Stück berechnet:
 * - direkte Zutaten für die Hover-Anzeige
 * - Roh-/Basiszutaten
 * - Zwischenprodukte, die wirklich produziert werden müssen
 * - Kapazitätsverbrauch je Gebäude in Minuten und Slots
 */
function resolveProductTree(product, indexes, settings, depth = 0, visited = new Set()) {
  const analysis = createEmptyAnalysis();

  if (!product) {
    analysis.feasible = false;
    analysis.reasons.push("Produkt fehlt");
    return analysis;
  }

  if ((product.level || 0) > settings.level) {
    analysis.feasible = false;
    analysis.reasons.push(`Level zu niedrig für ${product.name}`);
    return analysis;
  }

  if (isIngredientExcluded(product, settings)) {
    analysis.feasible = false;
    analysis.reasons.push(`${product.name} ist ausgeschlossen`);
    return analysis;
  }

  if (visited.has(product.key)) {
    analysis.feasible = false;
    analysis.reasons.push(`Zyklisches Rezept bei ${product.name}`);
    return analysis;
  }

  if (depth > 20) {
    analysis.feasible = false;
    analysis.reasons.push(`Rezeptbaum zu tief bei ${product.name}`);
    return analysis;
  }

  const recipeRows = indexes.recipesByProductKey.get(product.key) || [];

  if (!recipeRows.length) {
    addToMap(analysis.baseIngredientsMap, product.key, 1);
    return analysis;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(product.key);

  for (const recipe of recipeRows) {
    const ingredientAmount = safeNumber(recipe.amount, 1);
    const ingredientKey = recipe.ingredientKey || slugKey(recipe.ingredient);
    const ingredientProduct = indexes.productsByKey.get(recipe.ingredientKey);

    addToMap(analysis.directIngredientsMap, ingredientKey, ingredientAmount);

    if (!ingredientProduct) {
      analysis.feasible = false;
      analysis.reasons.push(`Zutat nicht gefunden: ${recipe.ingredient}`);
      continue;
    }

    if ((ingredientProduct.level || 0) > settings.level) {
      analysis.feasible = false;
      analysis.reasons.push(`${ingredientProduct.name} erst ab Level ${ingredientProduct.level}`);
      continue;
    }

    if (isIngredientExcluded(ingredientProduct, settings)) {
      analysis.feasible = false;
      analysis.reasons.push(`${ingredientProduct.name} ist ausgeschlossen`);
      continue;
    }

    const ingredientIsIntermediate = settings.intermediateMustBeProduced && hasRecipe(ingredientProduct, indexes);

    if (ingredientIsIntermediate) {
      const building = getBuildingName(ingredientProduct);

      if (!isBuildingAllowedName(building, settings)) {
        analysis.feasible = false;
        analysis.reasons.push(`Gebäude für Zwischenprodukt fehlt: ${building}`);
        continue;
      }

      addToMap(analysis.intermediateMap, ingredientProduct.key, ingredientAmount);
      addToMap(analysis.productionRequirements, ingredientProduct.key, ingredientAmount);
      addToMap(analysis.capacityMinutesByBuilding, building, safeNumber(ingredientProduct.timeMin, 0) * ingredientAmount);
      addToMap(analysis.slotsByBuilding, building, ingredientAmount);

      const child = resolveProductTree(ingredientProduct, indexes, settings, depth + 1, nextVisited);

      if (!child.feasible) {
        analysis.feasible = false;
        analysis.reasons.push(...child.reasons);
      }

      mergeMaps(analysis.baseIngredientsMap, child.baseIngredientsMap, ingredientAmount);
      mergeMaps(analysis.intermediateMap, child.intermediateMap, ingredientAmount);
      mergeMaps(analysis.productionRequirements, child.productionRequirements, ingredientAmount);
      mergeMaps(analysis.capacityMinutesByBuilding, child.capacityMinutesByBuilding, ingredientAmount);
      mergeMaps(analysis.slotsByBuilding, child.slotsByBuilding, ingredientAmount);
      analysis.warnings.push(...child.warnings);
    } else {
      addToMap(analysis.baseIngredientsMap, ingredientProduct.key, ingredientAmount);
    }
  }

  return analysis;
}

function createOneUnitCandidate(product, indexes, settings) {
  const building = getBuildingName(product);
  const reasons = [];
  const warnings = [];

  if (!product.name) reasons.push("Produktname fehlt");
  if ((product.level || 0) > settings.level) reasons.push(`Level zu niedrig (${product.level})`);
  if (!isBuildingAllowedName(building, settings)) reasons.push(`Gebäude nicht verfügbar: ${building}`);
  if (!product.timeMin || product.timeMin <= 0) reasons.push("Produktionszeit fehlt");

  const recipeRows = indexes.recipesByProductKey.get(product.key) || [];
  if (!recipeRows.length && product.building) {
    warnings.push(`${product.name}: Rezept fehlt oder nicht gepflegt`);
  }

  const tree = resolveProductTree(product, indexes, settings);
  if (!tree.feasible) reasons.push(...tree.reasons);

  const capacityMinutesByBuilding = cloneMap(tree.capacityMinutesByBuilding);
  const slotsByBuilding = cloneMap(tree.slotsByBuilding);

  addToMap(capacityMinutesByBuilding, building, safeNumber(product.timeMin, 0));
  addToMap(slotsByBuilding, building, 1);

  const score = getMetricValue(product, settings.mode);
  const totalCapacityMinutes = Array.from(capacityMinutesByBuilding.values()).reduce((sum, value) => sum + value, 0);
  const bottleneckMinutes = Math.max(...Array.from(capacityMinutesByBuilding.values()), 1);
  const efficiency = score / Math.max(bottleneckMinutes, 1);

  return {
    product,
    score,
    coins: safeNumber(product.coins, 0),
    xp: safeNumber(product.xp, 0),
    capacityMinutesByBuilding,
    slotsByBuilding,
    directIngredientsMap: tree.directIngredientsMap,
    ingredientsMap: tree.baseIngredientsMap,
    intermediateMap: tree.intermediateMap,
    productionRequirements: tree.productionRequirements,
    warnings,
    reasons,
    feasible: reasons.length === 0,
    totalCapacityMinutes,
    bottleneckMinutes,
    efficiency
  };
}

function candidateFits(candidate, usedMinutesByBuilding, usedSlotsByBuilding, settings) {
  for (const [building, minutes] of candidate.capacityMinutesByBuilding.entries()) {
    const nextMinutes = (usedMinutesByBuilding.get(building) || 0) + minutes;
    const capacity = getBuildingCapacityMinutes(building, settings);
    if (nextMinutes > capacity) {
      return {
        fits: false,
        reason: `${building}: Zeitlimit (${Math.ceil(nextMinutes)}/${Math.ceil(capacity)} min)`
      };
    }
  }

  for (const [building, slots] of candidate.slotsByBuilding.entries()) {
    const nextSlots = (usedSlotsByBuilding.get(building) || 0) + slots;
    const capacity = getSlotsForBuilding(building, settings);
    if (nextSlots > capacity) {
      return {
        fits: false,
        reason: `${building}: Slots (${nextSlots}/${capacity})`
      };
    }
  }

  return { fits: true, reason: "" };
}

function addCandidateUsage(candidate, usedMinutesByBuilding, usedSlotsByBuilding, factor = 1) {
  mergeMaps(usedMinutesByBuilding, candidate.capacityMinutesByBuilding, factor);
  mergeMaps(usedSlotsByBuilding, candidate.slotsByBuilding, factor);
}

/**
 * Globale Optimierung über alle Gebäude.
 * Das ist bewusst keine reine Sortierung: Es wird per Beam-Search eine Menge möglicher
 * Produktionskombinationen aufgebaut. Jede neue Produkt-Einheit muss gegen alle
 * Gebäude-Zeit- und Slot-Kapazitäten passen, inklusive Zwischenprodukten.
 */
function optimizeGlobally(products, indexes, settings) {
  const debugRejected = [];
  const debugChosen = [];
  const topCandidates = [];
  const beamWidth = 45;
  const maxIterations = Math.max(
    1,
    Math.min(
      80,
      (settings.allowedBuildings.length || 1) * Math.max(settings.globalSlots, 1) * 2
    )
  );
  const candidateLimit = 70;

  const unitCandidates = products
    .map((product) => createOneUnitCandidate(product, indexes, settings))
    .map((candidate) => {
      topCandidates.push({
        product: candidate.product.name,
        score: candidate.score,
        efficiency: candidate.efficiency,
        bottleneckMinutes: candidate.bottleneckMinutes,
        reasons: candidate.reasons
      });
      return candidate;
    });

  const feasibleCandidates = unitCandidates
    .filter((candidate) => {
      if (candidate.feasible) return true;
      debugRejected.push({
        product: candidate.product.name,
        reason: candidate.reasons.join("; ")
      });
      return false;
    })
    .sort((a, b) => b.efficiency - a.efficiency || b.score - a.score)
    .slice(0, candidateLimit);

  let states = [
    {
      score: 0,
      coins: 0,
      xp: 0,
      picks: new Map(),
      usedMinutesByBuilding: new Map(),
      usedSlotsByBuilding: new Map()
    }
  ];

  function stateSignature(state) {
    const picks = Array.from(state.picks.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, amount]) => `${key}:${amount}`)
      .join("|");
    return picks || "empty";
  }

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const nextStates = [...states];
    let expanded = false;

    for (const state of states) {
      for (const candidate of feasibleCandidates) {
        const fit = candidateFits(candidate, state.usedMinutesByBuilding, state.usedSlotsByBuilding, settings);

        if (!fit.fits) {
          if (iteration === 0) {
            debugRejected.push({
              product: candidate.product.name,
              reason: fit.reason
            });
          }
          continue;
        }

        const nextPicks = new Map(state.picks);
        nextPicks.set(candidate.product.key, (nextPicks.get(candidate.product.key) || 0) + 1);

        const nextState = {
          score: state.score + candidate.score,
          coins: state.coins + candidate.coins,
          xp: state.xp + candidate.xp,
          picks: nextPicks,
          usedMinutesByBuilding: cloneMap(state.usedMinutesByBuilding),
          usedSlotsByBuilding: cloneMap(state.usedSlotsByBuilding)
        };

        addCandidateUsage(candidate, nextState.usedMinutesByBuilding, nextState.usedSlotsByBuilding);
        nextStates.push(nextState);
        expanded = true;

        if (nextStates.length >= beamWidth * 4) break;
      }

      if (nextStates.length >= beamWidth * 4) break;
    }

    const deduped = new Map();
    for (const state of nextStates) {
      const signature = stateSignature(state);
      const current = deduped.get(signature);
      if (!current || state.score > current.score) deduped.set(signature, state);
    }

    states = Array.from(deduped.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, beamWidth);

    if (!expanded) break;
  }

  const best = states.sort((a, b) => b.score - a.score)[0] || states[0];

  for (const [key, amount] of best.picks.entries()) {
    const candidate = feasibleCandidates.find((item) => item.product.key === key);
    if (!candidate) continue;
    debugChosen.push({
      product: candidate.product.name,
      amount,
      reason: `${settings.mode === "xp" ? "XP" : "Coins"} ${candidate.score} pro Stück, Engpass-Effizienz ${candidate.efficiency.toFixed(2)}`
    });
  }

  return {
    best,
    candidates: feasibleCandidates,
    debug: {
      chosen: debugChosen,
      rejected: debugRejected.slice(0, 80),
      topCandidates: topCandidates
        .sort((a, b) => b.efficiency - a.efficiency)
        .slice(0, 20),
      buildingUsage: Array.from(best.usedMinutesByBuilding.entries()).map(([building, minutes]) => ({
        building,
        minutes,
        capacityMinutes: getBuildingCapacityMinutes(building, settings),
        slots: best.usedSlotsByBuilding.get(building) || 0,
        slotCapacity: getSlotsForBuilding(building, settings)
      }))
    }
  };
}

function createProductionEntryFromCandidate(candidate, amount, role, settings) {
  const building = getBuildingName(candidate.product);
  const ownTimeMin = safeNumber(candidate.product.timeMin, 0) * amount;

  return {
    product: candidate.product,
    building,
    role,
    amount,
    slotsUsed: amount,
    slots: getSlotsForBuilding(building, settings),
    ownTimeMin,
    effectiveTimeMin: ownTimeMin,
    totalTimeMin: ownTimeMin,
    totalXp: amount * candidate.xp,
    totalCoins: amount * candidate.coins,
    ingredientsMap: cloneMap(candidate.ingredientsMap),
    displayIngredientsMap: cloneMap(candidate.directIngredientsMap),
    intermediateMap: cloneMap(candidate.intermediateMap),
    productionRequirements: cloneMap(candidate.productionRequirements)
  };
}

function buildQueuePlan({ products, indexes, settings }) {
  const optimized = optimizeGlobally(products, indexes, settings);
  const productionPlan = [];
  const intermediateTotals = new Map();
  const warnings = [];

  for (const [key, amount] of optimized.best.picks.entries()) {
    const candidate = optimized.candidates.find((item) => item.product.key === key);
    if (!candidate) continue;

    productionPlan.push(createProductionEntryFromCandidate(candidate, amount, "main", settings));

    if (settings.intermediateMustBeProduced) {
      mergeMaps(intermediateTotals, candidate.productionRequirements, amount);
    }

    warnings.push(...candidate.warnings);
  }

  if (settings.intermediateMustBeProduced) {
    for (const [key, amount] of intermediateTotals.entries()) {
      const product = indexes.productsByKey.get(key);
      if (!product) continue;

      const candidate = createOneUnitCandidate(product, indexes, settings);
      productionPlan.push(createProductionEntryFromCandidate(candidate, amount, "intermediate", settings));
    }
  }

  return {
    productionPlan: productionPlan.sort((a, b) => {
      const roleOrder = (a.role === "intermediate" ? 1 : 0) - (b.role === "intermediate" ? 1 : 0);
      return (
        a.building.localeCompare(b.building, "de") ||
        roleOrder ||
        (a.product.level || 0) - (b.product.level || 0) ||
        a.product.name.localeCompare(b.product.name, "de")
      );
    }),
    warnings: [...new Set(warnings)],
    debug: optimized.debug
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
        iconUrl: product?.iconUrl || "",
        iconEmoji: product?.iconEmoji || "",
        iconType: product?.iconType || ""
      };
    })
    .sort(sortByLevelThenName);
}

function groupIngredients(items) {
  const groups = {
    field: { title: "Feld", items: [] },
    animals: { title: "Tiergehege", items: [] },
    buildings: { title: "Produktionsgebäude", items: [] },
    other: { title: "Sonstiges", items: [] }
  };

  for (const item of items) {
    const type = String(item.type || "").toLowerCase();
    const building = String(item.building || "").toLowerCase();
    const name = String(item.name || "").toLowerCase();

    if (type.includes("feld") || type.includes("pflanze") || type.includes("frucht") || type.includes("baum") || type.includes("busch")) {
      groups.field.items.push(item);
    } else if (type.includes("tier") || building.includes("tiergehege") || ["ei", "milch", "speck", "wolle", "ziegenmilch"].includes(name)) {
      groups.animals.items.push(item);
    } else if (item.building) {
      groups.buildings.items.push(item);
    } else {
      groups.other.items.push(item);
    }
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

  return Array.from(groups.values()).sort((a, b) => a.minLevel - b.minLevel || a.building.localeCompare(b.building, "de"));
}

function buildBuildingUtilization(productionPlan, settings) {
  const usedMinutesByBuilding = new Map();
  const usedSlotsByBuilding = new Map();

  for (const entry of productionPlan) {
    addToMap(usedMinutesByBuilding, entry.building, safeNumber(entry.ownTimeMin, 0));
    addToMap(usedSlotsByBuilding, entry.building, safeNumber(entry.slotsUsed, 0));
  }

  return Array.from(new Set([...usedMinutesByBuilding.keys(), ...usedSlotsByBuilding.keys()]))
    .map((building) => ({
      building,
      usedMinutes: usedMinutesByBuilding.get(building) || 0,
      capacityMinutes: getBuildingCapacityMinutes(building, settings),
      usedSlots: usedSlotsByBuilding.get(building) || 0,
      slots: getSlotsForBuilding(building, settings)
    }))
    .sort((a, b) => a.building.localeCompare(b.building, "de"));
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
  defaultSlotsByBuilding = {},
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
    defaultSlotsByBuilding,
    intermediateMustBeProduced:
      intermediateMustBeProduced ||
      (resolveToBaseIngredients === true && assumeIntermediateStock !== true),
    excludedIngredientNames
  });

  const indexes = buildIndexes(products, recipes);
  const allowedProducts = (products || [])
    .filter((product) => {
      const building = getBuildingName(product);
      return (
        product.name &&
        (product.level || 0) <= settings.level &&
        product.timeMin > 0 &&
        isBuildingAllowedName(building, settings)
      );
    })
    .sort(sortByLevelThenName);

  const { productionPlan, warnings, debug } = buildQueuePlan({
    products: allowedProducts,
    indexes,
    settings
  });

  const ingredientsMap = new Map();
  const displayIngredientsMap = new Map();
  const intermediateMap = new Map();

  for (const entry of productionPlan) {
    mergeMaps(ingredientsMap, entry.ingredientsMap);
    mergeMaps(displayIngredientsMap, entry.displayIngredientsMap || entry.ingredientsMap);
    mergeMaps(intermediateMap, entry.intermediateMap);
  }

  const ingredients = mapEntriesToItems(displayIngredientsMap, indexes.productsByKey);
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
    { xp: 0, coins: 0, products: 0, buildings: new Set(), effectiveTimeMin: 0 }
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
    buildingUtilization: buildBuildingUtilization(productionPlan, settings),
    optimizationDebug: debug,
    warnings: [...new Set(warnings)]
  };
}

export function getAvailableBuildings(products, level = 999) {
  const buildings = new Map();

  for (const product of products || []) {
    if (!product.building) continue;
    if ((product.level || 0) > level) continue;

    if (!buildings.has(product.building)) {
      buildings.set(product.building, {
        name: product.building,
        level: product.level || 0,
        iconUrl: product.buildingIconUrl || "",
        iconEmoji: product.buildingIconEmoji || "",
        iconType: product.buildingIconType || "",
        slots: product.buildingSlots || 0
      });
    }

    const building = buildings.get(product.building);
    building.level = Math.min(building.level, product.level || 0);

    if (!building.iconUrl && product.buildingIconUrl) building.iconUrl = product.buildingIconUrl;
    if (!building.iconEmoji && product.buildingIconEmoji) building.iconEmoji = product.buildingIconEmoji;
    if (!building.slots && product.buildingSlots) building.slots = product.buildingSlots;
  }

  return Array.from(buildings.values()).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "de"));
}
