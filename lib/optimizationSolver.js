// Kein direkter Import von javascript-lp-solver im Client-Bundle:
// das Paket zieht in Next/Vercel Node-Module wie fs/child_process nach.

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function getTimeLimitMinutes(settings) {
  return Math.max(safeNumber(settings.hours, 8) * 60, 1);
}

function getBuildingName(product) {
  return product?.building || "Ohne Gebäude";
}

function getSlotsForBuilding(building, settings) {
  const customValue = settings.slotsByBuilding?.[building];
  const databaseValue = settings.defaultSlotsByBuilding?.[building];
  const fallback = safeNumber(settings.globalSlots, 4);

  if (customValue !== undefined && customValue !== null && customValue !== "") return safeNumber(customValue, fallback);
  if (databaseValue !== undefined && databaseValue !== null && databaseValue !== "") return safeNumber(databaseValue, fallback);
  return fallback;
}

function addToMap(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

function buildRecipeIndex(recipes = []) {
  const byProductKey = new Map();

  for (const recipe of recipes) {
    if (!recipe.productKey || !recipe.ingredientKey) continue;
    if (!byProductKey.has(recipe.productKey)) byProductKey.set(recipe.productKey, []);
    byProductKey.get(recipe.productKey).push({
      key: recipe.ingredientKey,
      amount: safeNumber(recipe.amount, 1),
      name: recipe.ingredient
    });
  }

  return byProductKey;
}

function hasExcludedRecipeTree(product, context, visited = new Set()) {
  if (!product) return true;
  if (context.excludedNames.has(normalizeName(product.name))) return true;
  if (visited.has(product.key)) return true;

  const nextVisited = new Set(visited);
  nextVisited.add(product.key);
  const rows = context.recipesByProductKey.get(product.key) || [];

  for (const row of rows) {
    const ingredient = context.productsByKey.get(row.key);
    if (!ingredient) continue;
    if (context.excludedNames.has(normalizeName(ingredient.name))) return true;
    if (ingredient.building && context.intermediateMustBeProduced) {
      if (hasExcludedRecipeTree(ingredient, context, nextVisited)) return true;
    }
  }

  return false;
}

function isProductAllowed(product, context) {
  const building = getBuildingName(product);
  const timeLimit = getTimeLimitMinutes(context.settings);

  return (
    product?.key &&
    product?.name &&
    product.building &&
    safeNumber(product.timeMin, 0) > 0 &&
    safeNumber(product.timeMin, 0) <= timeLimit &&
    safeNumber(product.level, 0) <= safeNumber(context.settings.level, 999) &&
    (context.settings.allowedBuildings || []).includes(building) &&
    !hasExcludedRecipeTree(product, context)
  );
}

function getRequirementMap(productKey, context, memo = new Map(), stack = new Set()) {
  if (memo.has(productKey)) return memo.get(productKey);
  if (stack.has(productKey)) return { feasible: false, requirements: new Map(), reasons: [`Zyklischer Materialfluss bei ${productKey}`] };

  const product = context.productsByKey.get(productKey);
  const rows = context.recipesByProductKey.get(productKey) || [];
  const requirements = new Map();
  const reasons = [];
  const nextStack = new Set(stack);
  nextStack.add(productKey);

  for (const row of rows) {
    const ingredient = context.productsByKey.get(row.key);
    if (!ingredient) continue;
    if (context.excludedNames.has(normalizeName(ingredient.name))) {
      reasons.push(`${ingredient.name} ist ausgeschlossen`);
      continue;
    }

    const isMakeable = context.allowedProductKeys.has(row.key);

    if (context.intermediateMustBeProduced && isMakeable) {
      addToMap(requirements, row.key, row.amount);
      const child = getRequirementMap(row.key, context, memo, nextStack);
      if (!child.feasible) reasons.push(...child.reasons);
      for (const [childKey, childAmount] of child.requirements.entries()) {
        addToMap(requirements, childKey, childAmount * row.amount);
      }
    }
  }

  const result = { feasible: reasons.length === 0, requirements, reasons };
  memo.set(productKey, result);
  return result;
}

export function buildOptimizationModel(products = [], recipes = [], settings = {}) {
  const productsByKey = new Map((products || []).map((product) => [product.key, product]));
  const recipesByProductKey = buildRecipeIndex(recipes);
  const excludedNames = new Set((settings.excludedIngredientNames || []).map(normalizeName));
  const context = {
    productsByKey,
    recipesByProductKey,
    excludedNames,
    settings,
    intermediateMustBeProduced: Boolean(settings.intermediateMustBeProduced),
    allowedProductKeys: new Set()
  };

  const candidates = (products || []).filter((product) => isProductAllowed(product, context));
  context.allowedProductKeys = new Set(candidates.map((product) => product.key));

  const requirementMemo = new Map();
  const feasibleProducts = [];
  const rejected = [];

  for (const product of candidates) {
    const requirements = getRequirementMap(product.key, context, requirementMemo);
    if (requirements.feasible) {
      feasibleProducts.push({ product, requirements: requirements.requirements });
    } else {
      rejected.push({ product: product.name, reason: requirements.reasons.join("; ") });
    }
  }

  const lpModel = {
    optimize: "objective",
    opType: "max",
    constraints: {},
    variables: {},
    ints: {}
  };

  const constraintNames = new Set();
  const timeLimit = getTimeLimitMinutes(settings);
  const buildings = Array.from(new Set(feasibleProducts.map((item) => getBuildingName(item.product))));

  for (const building of buildings) {
    lpModel.constraints[`slots:${building}`] = { max: getSlotsForBuilding(building, settings) };
    lpModel.constraints[`minutes:${building}`] = { max: timeLimit };
    constraintNames.add(`slots:${building}`);
    constraintNames.add(`minutes:${building}`);
  }

  for (const { product } of feasibleProducts) {
    lpModel.constraints[`flow:${product.key}`] = { equal: 0 };
    constraintNames.add(`flow:${product.key}`);
  }

  for (const { product, requirements } of feasibleProducts) {
    const makeVar = `make:${product.key}`;
    const sellVar = `sell:${product.key}`;
    const building = getBuildingName(product);
    const objective = settings.mode === "xp" ? safeNumber(product.xp, 0) : safeNumber(product.coins, 0);

    lpModel.variables[makeVar] = {
      [`slots:${building}`]: 1,
      [`minutes:${building}`]: safeNumber(product.timeMin, 0),
      [`flow:${product.key}`]: 1
    };
    lpModel.variables[sellVar] = {
      objective,
      [`flow:${product.key}`]: -1
    };

    for (const [requiredKey, amount] of requirements.entries()) {
      lpModel.variables[makeVar][`flow:${requiredKey}`] = (lpModel.variables[makeVar][`flow:${requiredKey}`] || 0) - amount;
    }

    lpModel.ints[makeVar] = 1;
    lpModel.ints[sellVar] = 1;
  }

  return {
    solver: "browser-branch-and-bound-ilp",
    lpModel,
    products: feasibleProducts.map((item) => item.product),
    requirementsByProductKey: new Map(feasibleProducts.map((item) => [item.product.key, item.requirements])),
    productsByKey,
    recipesByProductKey,
    settings,
    rejected,
    variablesCount: Object.keys(lpModel.variables).length,
    constraintsCount: constraintNames.size
  };
}

function estimateUpperBound(items, index, remainingSlotsByBuilding, remainingMinutesByBuilding, currentValue, mode) {
  let bound = currentValue;

  for (let cursor = index; cursor < items.length; cursor += 1) {
    const item = items[cursor];
    const building = getBuildingName(item.product);
    const remainingSlots = remainingSlotsByBuilding.get(building) || 0;
    const remainingMinutes = remainingMinutesByBuilding.get(building) || 0;
    const maxBySlots = remainingSlots;
    const maxByMinutes = Math.floor(remainingMinutes / Math.max(safeNumber(item.product.timeMin, 0), 1));
    const maxCount = Math.max(0, Math.min(maxBySlots, maxByMinutes));
    const value = mode === "xp" ? safeNumber(item.product.xp, 0) : safeNumber(item.product.coins, 0);
    bound += maxCount * value;
  }

  return bound;
}

function requirementsFit(selection, model) {
  const required = new Map();

  for (const [key, sold] of selection.entries()) {
    if (sold <= 0) continue;
    addToMap(required, key, sold);

    const requirements = model.requirementsByProductKey.get(key) || new Map();
    for (const [requiredKey, amount] of requirements.entries()) {
      addToMap(required, requiredKey, amount * sold);
    }
  }

  return required;
}

function buildUsageFromMake(make, productsByKey) {
  const buildingMinutes = new Map();
  const buildingSlots = new Map();

  for (const [key, amount] of make.entries()) {
    const product = productsByKey.get(key);
    if (!product || amount <= 0) continue;

    const building = getBuildingName(product);
    addToMap(buildingSlots, building, amount);
    addToMap(buildingMinutes, building, amount * safeNumber(product.timeMin, 0));
  }

  return { buildingMinutes, buildingSlots };
}

function usageFits(buildingMinutes, buildingSlots, settings) {
  const timeLimit = getTimeLimitMinutes(settings);

  for (const [building, slots] of buildingSlots.entries()) {
    if (slots > getSlotsForBuilding(building, settings)) return false;
  }

  for (const [, minutes] of buildingMinutes.entries()) {
    if (minutes > timeLimit) return false;
  }

  return true;
}

function cloneSelectionMap(source) {
  return new Map(source || []);
}

function mergeSelection(target, source, factor = 1) {
  for (const [key, amount] of source.entries()) {
    addToMap(target, key, amount * factor);
  }
}

function selectionSignature(selection) {
  return Array.from(selection.entries())
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, amount]) => `${key}:${amount}`)
    .join("|") || "empty";
}

function getRequirementPressure(product, model) {
  const requirements = model.requirementsByProductKey.get(product.key) || new Map();
  let pressure = 0;

  for (const [key, amount] of requirements.entries()) {
    const requiredProduct = model.productsByKey.get(key);
    if (!requiredProduct) continue;
    pressure += amount * safeNumber(requiredProduct.timeMin, 0);
  }

  return pressure;
}

function createBuildingCombinations(building, products, model) {
  const slotLimit = getSlotsForBuilding(building, model.settings);
  const minuteLimit = getTimeLimitMinutes(model.settings);
  const mode = model.settings.mode;
  const candidates = products
    .filter((product) => getBuildingName(product) === building)
    .map((product) => {
      const value = mode === "xp" ? safeNumber(product.xp, 0) : safeNumber(product.coins, 0);
      const requirementPressure = getRequirementPressure(product, model);
      return {
        product,
        value,
        minutes: safeNumber(product.timeMin, 0),
        requirementPressure,
        netEfficiency: value / Math.max(safeNumber(product.timeMin, 0) + requirementPressure, 1),
        efficiency: value / Math.max(safeNumber(product.timeMin, 0), 1)
      };
    })
    .filter((item) => item.value > 0 && item.minutes > 0)
    .sort((a, b) => b.netEfficiency - a.netEfficiency || b.value - a.value || b.efficiency - a.efficiency)
    .slice(0, Math.max(slotLimit * 6, 18));

  const combinationsBySignature = new Map();

  function remember(selection, value, slots, minutes) {
    const signature = selectionSignature(selection);
    const current = combinationsBySignature.get(signature);
    if (!current || value > current.value || (value === current.value && minutes < current.minutes)) {
      combinationsBySignature.set(signature, {
        building,
        sell: cloneSelectionMap(selection),
        value,
        slots,
        minutes,
        products: Array.from(selection.entries()).map(([key, amount]) => ({
          key,
          amount,
          product: model.productsByKey.get(key)?.name || key
        }))
      });
    }
  }

  function dfs(index, selection, value, slots, minutes) {
    remember(selection, value, slots, minutes);
    if (index >= candidates.length) return;

    const item = candidates[index];
    const maxCount = Math.max(
      0,
      Math.min(
        slotLimit - slots,
        Math.floor((minuteLimit - minutes) / Math.max(item.minutes, 1))
      )
    );

    for (let amount = maxCount; amount >= 0; amount -= 1) {
      const nextSelection = cloneSelectionMap(selection);
      if (amount > 0) nextSelection.set(item.product.key, amount);
      dfs(
        index + 1,
        nextSelection,
        value + amount * item.value,
        slots + amount,
        minutes + amount * item.minutes
      );
    }
  }

  dfs(0, new Map(), 0, 0, 0);

  const combinations = Array.from(combinationsBySignature.values())
    .filter((combo) => combo.value > 0 || combo.slots === 0)
    .sort((a, b) => b.value - a.value || a.minutes - b.minutes)
    .slice(0, 90);

  return {
    building,
    candidateProducts: candidates.length,
    generatedCombinations: combinationsBySignature.size,
    keptCombinations: combinations.length,
    bestLocalCombination: combinations.find((combo) => combo.value > 0) || combinations[0],
    combinations
  };
}

function buildCombinationSearchDebug(buildingResults, stats, selectedCombinations, bestValue) {
  return {
    buildings: buildingResults.map((result) => ({
      building: result.building,
      candidateProducts: result.candidateProducts,
      candidateCombinations: result.generatedCombinations,
      keptCombinations: result.keptCombinations,
      bestLocalCombination: result.bestLocalCombination
        ? {
            value: result.bestLocalCombination.value,
            slots: result.bestLocalCombination.slots,
            minutes: result.bestLocalCombination.minutes,
            products: result.bestLocalCombination.products
          }
        : null,
      selectedCombination: selectedCombinations.get(result.building)
        ? {
            value: selectedCombinations.get(result.building).value,
            slots: selectedCombinations.get(result.building).slots,
            minutes: selectedCombinations.get(result.building).minutes,
            products: selectedCombinations.get(result.building).products
          }
        : null
    })),
    globalSearch: {
      combinationsEvaluated: stats.combinationsEvaluated,
      nodesVisited: stats.nodesVisited,
      prunedByUpperBound: stats.prunedByUpperBound,
      prunedByMaterialFlow: stats.prunedByMaterialFlow,
      prunedByBuildingCapacity: stats.prunedByBuildingCapacity,
      bestValue
    }
  };
}

export function solveOptimizationModel(model) {
  const make = new Map();
  const sell = new Map();
  const usedAsIntermediate = new Map();
  const productsByKey = new Map(model.products.map((product) => [product.key, product]));
  const buildings = Array.from(new Set(model.products.map((product) => getBuildingName(product))))
    .sort((a, b) => a.localeCompare(b, "de"));

  const buildingResults = buildings.map((building) => createBuildingCombinations(building, model.products, model));
  const orderedBuildingResults = buildingResults
    .map((result) => ({
      ...result,
      upperValue: Math.max(...result.combinations.map((combo) => combo.value), 0)
    }))
    .sort((a, b) => {
      const aDependency = Math.max(...a.combinations.map((combo) => {
        const make = requirementsFit(combo.sell, model);
        return Array.from(make.values()).reduce((sum, amount) => sum + amount, 0) - combo.slots;
      }), 0);
      const bDependency = Math.max(...b.combinations.map((combo) => {
        const make = requirementsFit(combo.sell, model);
        return Array.from(make.values()).reduce((sum, amount) => sum + amount, 0) - combo.slots;
      }), 0);
      return bDependency - aDependency || b.upperValue - a.upperValue || a.building.localeCompare(b.building, "de");
    });

  const suffixUpperBounds = new Array(orderedBuildingResults.length + 1).fill(0);
  for (let index = orderedBuildingResults.length - 1; index >= 0; index -= 1) {
    suffixUpperBounds[index] = suffixUpperBounds[index + 1] + orderedBuildingResults[index].upperValue;
  }

  const stats = {
    nodesVisited: 0,
    combinationsEvaluated: 0,
    prunedByUpperBound: 0,
    prunedByMaterialFlow: 0,
    prunedByBuildingCapacity: 0
  };
  const maxNodes = 180000;
  let bestValue = 0;
  let bestSell = new Map();
  let bestSelectedCombinations = new Map();

  function evaluateSelection(selection, selectedCombinations, currentValue) {
    const requiredMake = requirementsFit(selection, model);
    const usage = buildUsageFromMake(requiredMake, productsByKey);
    if (!usageFits(usage.buildingMinutes, usage.buildingSlots, model.settings)) {
      stats.prunedByMaterialFlow += 1;
      return;
    }

    if (currentValue > bestValue) {
      bestValue = currentValue;
      bestSell = cloneSelectionMap(selection);
      bestSelectedCombinations = new Map(selectedCombinations);
    }
  }

  // Schneller Startwert: pro Gebäude die beste lokale Kombination nehmen,
  // sofern sie zusammen mit dem bisherigen Plan global feasible bleibt.
  // Ohne Seed kann die Kombinationssuche vor der ersten guten Lösung ins Node-Limit laufen.
  function seedGreedyFeasibleSolution() {
    const seedSelection = new Map();
    const seedSelectedCombinations = new Map();
    let seedValue = 0;

    for (const buildingResult of orderedBuildingResults) {
      for (const combination of buildingResult.combinations) {
        const nextSelection = cloneSelectionMap(seedSelection);
        mergeSelection(nextSelection, combination.sell);
        const requiredMake = requirementsFit(nextSelection, model);
        const usage = buildUsageFromMake(requiredMake, productsByKey);

        if (usageFits(usage.buildingMinutes, usage.buildingSlots, model.settings)) {
          mergeSelection(seedSelection, combination.sell);
          seedSelectedCombinations.set(buildingResult.building, combination);
          seedValue += combination.value;
          break;
        }
      }
    }

    if (seedValue > bestValue) {
      bestValue = seedValue;
      bestSell = cloneSelectionMap(seedSelection);
      bestSelectedCombinations = new Map(seedSelectedCombinations);
    }
  }

  seedGreedyFeasibleSolution();

  function search(buildingIndex, selection, selectedCombinations, currentValue) {
    stats.nodesVisited += 1;
    if (stats.nodesVisited > maxNodes) return;

    if (currentValue + suffixUpperBounds[buildingIndex] <= bestValue) {
      stats.prunedByUpperBound += 1;
      return;
    }

    evaluateSelection(selection, selectedCombinations, currentValue);

    if (buildingIndex >= orderedBuildingResults.length) return;

    const buildingResult = orderedBuildingResults[buildingIndex];
    for (const combination of buildingResult.combinations) {
      stats.combinationsEvaluated += 1;
      const nextSelection = cloneSelectionMap(selection);
      mergeSelection(nextSelection, combination.sell);
      const nextSelectedCombinations = new Map(selectedCombinations);
      nextSelectedCombinations.set(buildingResult.building, combination);
      search(
        buildingIndex + 1,
        nextSelection,
        nextSelectedCombinations,
        currentValue + combination.value
      );
      if (stats.nodesVisited > maxNodes) break;
    }
  }

  search(0, new Map(), new Map(), 0);

  const requiredMake = requirementsFit(bestSell, model);
  const usage = buildUsageFromMake(requiredMake, productsByKey);

  for (const [key, amount] of requiredMake.entries()) {
    if (amount > 0) make.set(key, amount);
  }

  for (const [key, amount] of bestSell.entries()) {
    if (amount > 0) sell.set(key, amount);
  }

  for (const [key, amount] of make.entries()) {
    usedAsIntermediate.set(key, Math.max(amount - (sell.get(key) || 0), 0));
  }

  return {
    solverStatus: stats.nodesVisited > maxNodes ? "feasible_combination_node_limited" : "optimal",
    objectiveValue: bestValue,
    make,
    sell,
    usedAsIntermediate,
    buildingMinutes: usage.buildingMinutes,
    buildingSlots: usage.buildingSlots,
    variablesCount: model.variablesCount,
    constraintsCount: model.constraintsCount,
    infeasibleReasons: [],
    raw: {
      visitedNodes: stats.nodesVisited,
      maxNodes,
      combinationSolver: true,
      combinationsEvaluated: stats.combinationsEvaluated
    },
    combinationDebug: buildCombinationSearchDebug(buildingResults, stats, bestSelectedCombinations, bestValue)
  };
}

function buildDirectIngredientMap(productKey, model) {
  const ingredients = new Map();
  const rows = model?.recipesByProductKey?.get(productKey) || [];

  for (const row of rows) {
    addToMap(ingredients, row.key, row.amount);
  }

  return ingredients;
}

function buildIntermediateRequirementMap(productKey, model) {
  return cloneSelectionMap(model?.requirementsByProductKey?.get(productKey) || new Map());
}

function multiplyMap(source, factor = 1) {
  const result = new Map();
  for (const [key, amount] of source.entries()) {
    addToMap(result, key, amount * factor);
  }
  return result;
}

export function convertSolutionToProductionPlan(solution, products = [], settings = {}, model = null) {
  const productsByKey = new Map((products || []).map((product) => [product.key, product]));
  const productionPlan = [];
  const materialFlow = [];

  for (const [key, amount] of solution.make.entries()) {
    const product = productsByKey.get(key);
    if (!product || amount <= 0) continue;

    const sold = solution.sell.get(key) || 0;
    const intermediateAmount = Math.max(amount - sold, 0);
    const role = sold > 0 ? "main" : "intermediate";

    productionPlan.push({
      product,
      building: getBuildingName(product),
      role,
      amount,
      sellAmount: sold,
      intermediateAmount,
      slotsUsed: amount,
      slots: getSlotsForBuilding(getBuildingName(product), settings),
      ownTimeMin: amount * safeNumber(product.timeMin, 0),
      effectiveTimeMin: amount * safeNumber(product.timeMin, 0),
      totalTimeMin: amount * safeNumber(product.timeMin, 0),
      totalCoins: sold * safeNumber(product.coins, 0),
      totalXp: sold * safeNumber(product.xp, 0),
      ingredientsMap: multiplyMap(buildDirectIngredientMap(product.key, model), amount),
      displayIngredientsMap: multiplyMap(buildDirectIngredientMap(product.key, model), amount),
      intermediateMap: multiplyMap(buildIntermediateRequirementMap(product.key, model), amount),
      productionRequirements: multiplyMap(buildIntermediateRequirementMap(product.key, model), amount)
    });

    materialFlow.push({
      product: product.name,
      key,
      made: amount,
      sold,
      usedAsIntermediate: intermediateAmount
    });
  }

  return { productionPlan, materialFlow };
}

export function validateSolution(solution, products = [], settings = {}) {
  const reasons = [];
  const timeLimit = getTimeLimitMinutes(settings);

  for (const [building, slots] of solution.buildingSlots.entries()) {
    const slotCapacity = getSlotsForBuilding(building, settings);
    if (slots > slotCapacity) reasons.push(`${building}: Slots ${slots}/${slotCapacity}`);
  }

  for (const [building, minutes] of solution.buildingMinutes.entries()) {
    if (minutes > timeLimit) reasons.push(`${building}: Zeit ${minutes}/${timeLimit} min`);
  }

  for (const [key, made] of solution.make.entries()) {
    const sold = solution.sell.get(key) || 0;
    const usedAsIntermediate = solution.usedAsIntermediate.get(key) || 0;
    if (made !== sold + usedAsIntermediate) {
      reasons.push(`${key}: Materialfluss ${made} != ${sold} + ${usedAsIntermediate}`);
    }
  }

  return {
    // Feasible bedeutet: Die gefundene Lösung verletzt keine Constraints.
    // Ob die Suche vollständig bewiesen optimal war, steht separat in solverStatus.
    feasible: reasons.length === 0,
    searchComplete: solution.solverStatus === "optimal",
    infeasibleReasons: reasons
  };
}

export function buildBuildingUsageFromSolution(solution, settings = {}) {
  return Array.from(new Set([...solution.buildingSlots.keys(), ...solution.buildingMinutes.keys()]))
    .map((building) => ({
      building,
      slotsUsed: solution.buildingSlots.get(building) || 0,
      slotCapacity: getSlotsForBuilding(building, settings),
      minutes: solution.buildingMinutes.get(building) || 0,
      capacityMinutes: getTimeLimitMinutes(settings)
    }))
    .sort((a, b) => a.building.localeCompare(b.building, "de"));
}
