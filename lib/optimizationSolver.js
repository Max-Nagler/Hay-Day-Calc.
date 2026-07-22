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

export function solveOptimizationModel(model) {
  const make = new Map();
  const sell = new Map();
  const usedAsIntermediate = new Map();
  const productsByKey = new Map(model.products.map((product) => [product.key, product]));
  const items = [...model.products]
    .map((product) => ({
      product,
      value: model.settings.mode === "xp" ? safeNumber(product.xp, 0) : safeNumber(product.coins, 0),
      efficiency: (model.settings.mode === "xp" ? safeNumber(product.xp, 0) : safeNumber(product.coins, 0)) / Math.max(safeNumber(product.timeMin, 0), 1)
    }))
    .filter((item) => item.value > 0)
    // Für Branch-and-Bound zuerst nach absolutem Zielwert sortieren.
    // Effizienz als Primärsortierung findet zwar schnell "gute" Teillösungen,
    // kann aber hochpreisige Produkte zu spät besuchen und wegen Node-Limit
    // deutlich unter dem Optimum stoppen.
    .sort((a, b) => b.value - a.value || b.efficiency - a.efficiency)
    // Harte Begrenzung, damit der Browser nicht einfriert.
    // Der vollständige Solver muss später in einen Worker oder serverseitig laufen.
    .slice(0, 36);

  const remainingSlotsByBuilding = new Map();
  const remainingMinutesByBuilding = new Map();

  for (const building of model.settings.allowedBuildings || []) {
    remainingSlotsByBuilding.set(building, getSlotsForBuilding(building, model.settings));
    remainingMinutesByBuilding.set(building, getTimeLimitMinutes(model.settings));
  }

  let bestValue = 0;
  let bestSell = new Map();
  let visitedNodes = 0;
  const maxNodes = 45000;

  function search(index, selection, currentValue, slotsLeft, minutesLeft) {
    visitedNodes += 1;
    if (visitedNodes > maxNodes) return;

    if (estimateUpperBound(items, index, slotsLeft, minutesLeft, currentValue, model.settings.mode) <= bestValue) {
      return;
    }

    const requiredMake = requirementsFit(selection, model);
    const currentUsage = buildUsageFromMake(requiredMake, productsByKey);

    if (!usageFits(currentUsage.buildingMinutes, currentUsage.buildingSlots, model.settings)) {
      return;
    }

    if (currentValue > bestValue) {
      bestValue = currentValue;
      bestSell = new Map(selection);
    }

    if (index >= items.length) {
      return;
    }

    const item = items[index];
    const building = getBuildingName(item.product);
    const time = safeNumber(item.product.timeMin, 0);
    const maxBySlots = slotsLeft.get(building) || 0;
    const maxByMinutes = Math.floor((minutesLeft.get(building) || 0) / Math.max(time, 1));
    const maxCount = Math.max(0, Math.min(maxBySlots, maxByMinutes));

    for (let amount = maxCount; amount >= 0; amount -= 1) {
      const nextSelection = new Map(selection);
      const nextSlots = new Map(slotsLeft);
      const nextMinutes = new Map(minutesLeft);

      if (amount > 0) {
        nextSelection.set(item.product.key, amount);
        nextSlots.set(building, (nextSlots.get(building) || 0) - amount);
        nextMinutes.set(building, (nextMinutes.get(building) || 0) - amount * time);
      }

      search(index + 1, nextSelection, currentValue + amount * item.value, nextSlots, nextMinutes);
    }
  }

  search(0, new Map(), 0, remainingSlotsByBuilding, remainingMinutesByBuilding);

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
    solverStatus: visitedNodes > maxNodes ? "feasible_node_limited" : "optimal",
    objectiveValue: bestValue,
    make,
    sell,
    usedAsIntermediate,
    buildingMinutes: usage.buildingMinutes,
    buildingSlots: usage.buildingSlots,
    variablesCount: model.variablesCount,
    constraintsCount: model.constraintsCount,
    infeasibleReasons: [],
    raw: { visitedNodes, maxNodes }
  };
}

export function convertSolutionToProductionPlan(solution, products = [], settings = {}) {
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
      ingredientsMap: new Map(),
      displayIngredientsMap: new Map(),
      intermediateMap: new Map(),
      productionRequirements: new Map()
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
    feasible: reasons.length === 0 && solution.solverStatus === "optimal",
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
