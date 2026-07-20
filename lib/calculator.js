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

function sortByLevelThenName(a, b) {
  return (a.level || 0) - (b.level || 0) || a.name.localeCompare(b.name);
}

function getScore(product, mode) {
  const timeMin = Math.max(product.timeMin || 1, 1);
  const xp = product.xp || 0;
  const coins = product.coins || 0;

  if (mode === "xp") {
    return xp / timeMin;
  }

  if (mode === "slots") {
    // Für Slotauslastung: bevorzugt Produkte, die gut in lange Zeitfenster passen.
    // Genauere Logik kommt später mit echten Slot-Warteschlangen.
    return timeMin;
  }

  // Standard: Coins
  return coins / timeMin;
}

function groupByBuilding(products) {
  return products.reduce((groups, product) => {
    const building = product.building || "Ohne Gebäude";

    if (!groups.has(building)) {
      groups.set(building, []);
    }

    groups.get(building).push(product);
    return groups;
  }, new Map());
}

function getAllowedProducts({ products, level, allowedBuildings }) {
  return products
    .filter((product) => {
      const isUnlocked = (product.level || 0) <= level;
      const buildingAllowed =
        !allowedBuildings?.length || allowedBuildings.includes(product.building);

      return isUnlocked && buildingAllowed;
    })
    .sort(sortByLevelThenName);
}

function pickBestProductsByBuilding({
  products,
  mode,
  hours,
  slotsByBuilding = {},
  maxProductsPerBuilding = 1
}) {
  const grouped = groupByBuilding(products);
  const productionPlan = [];

  for (const [building, buildingProducts] of grouped.entries()) {
    const sortedProducts = [...buildingProducts].sort((a, b) => {
      return getScore(b, mode) - getScore(a, mode);
    });

    const selectedProducts = sortedProducts.slice(0, maxProductsPerBuilding);
    const slots = clamp(safeNumber(slotsByBuilding[building], 1), 1, 10);
    const availableMinutes = Math.max(hours * 60, 1);

    for (const product of selectedProducts) {
      const timeMin = Math.max(product.timeMin || 1, 1);

      let amount = Math.floor((availableMinutes / timeMin) * slots);

      // Mindestens 1, damit lange Produkte bei großen Zeitfenstern nicht verschwinden.
      if (amount < 1 && timeMin <= availableMinutes * slots) {
        amount = 1;
      }

      if (amount <= 0) continue;

      productionPlan.push({
        product,
        building,
        amount,
        totalTimeMin: amount * timeMin,
        totalXp: amount * (product.xp || 0),
        totalCoins: amount * (product.coins || 0),
        score: getScore(product, mode)
      });
    }
  }

  return productionPlan.sort((a, b) => {
    return (
      (a.product.level || 0) - (b.product.level || 0) ||
      a.building.localeCompare(b.building) ||
      a.product.name.localeCompare(b.product.name)
    );
  });
}

function resolveIngredientsForProduct({
  product,
  amount,
  recipesByProductKey,
  productsByKey,
  resolveToBaseIngredients,
  depth = 0,
  visited = new Set(),
  ingredientsMap,
  intermediateMap,
  warnings
}) {
  if (!product) return;

  if (depth > 20) {
    warnings.push(`Rekursion bei ${product.name} gestoppt.`);
    addToMap(ingredientsMap, product.key, amount);
    return;
  }

  if (visited.has(product.key)) {
    warnings.push(`Zyklisches Rezept erkannt bei ${product.name}.`);
    addToMap(ingredientsMap, product.key, amount);
    return;
  }

  const recipeRows = recipesByProductKey.get(product.key) || [];

  if (!recipeRows.length) {
    addToMap(ingredientsMap, product.key, amount);
    return;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(product.key);

  if (depth > 0) {
    addToMap(intermediateMap, product.key, amount);
  }

  for (const recipe of recipeRows) {
    const ingredientAmount = recipe.amount * amount;
    const ingredientProduct = productsByKey.get(recipe.ingredientKey);

    if (!ingredientProduct) {
      warnings.push(`Zutat nicht gefunden: ${recipe.ingredient}`);
      addToMap(ingredientsMap, recipe.ingredientKey || recipe.ingredient, ingredientAmount);
      continue;
    }

    if (resolveToBaseIngredients) {
      resolveIngredientsForProduct({
        product: ingredientProduct,
        amount: ingredientAmount,
        recipesByProductKey,
        productsByKey,
        resolveToBaseIngredients,
        depth: depth + 1,
        visited: nextVisited,
        ingredientsMap,
        intermediateMap,
        warnings
      });
    } else {
      addToMap(ingredientsMap, ingredientProduct.key, ingredientAmount);
    }
  }
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
      ["ei", "milch", "speck", "wolle", "ziegenmilch"].includes(
        item.name.toLowerCase()
      )
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

export function calculateProductionPlan({
  products,
  recipes,
  mode = "coins",
  level = 999,
  hours = 8,
  allowedBuildings = [],
  slotsByBuilding = {},
  resolveToBaseIngredients = true
}) {
  const productsByKey = new Map(products.map((product) => [product.key, product]));

  const recipesByProductKey = recipes.reduce((map, recipe) => {
    if (!map.has(recipe.productKey)) {
      map.set(recipe.productKey, []);
    }

    map.get(recipe.productKey).push(recipe);
    return map;
  }, new Map());

  const allowedProducts = getAllowedProducts({
    products,
    level,
    allowedBuildings
  });

  const productionPlan = pickBestProductsByBuilding({
    products: allowedProducts,
    mode,
    hours,
    slotsByBuilding
  });

  const ingredientsMap = new Map();
  const intermediateMap = new Map();
  const warnings = [];

  for (const entry of productionPlan) {
    resolveIngredientsForProduct({
      product: entry.product,
      amount: entry.amount,
      recipesByProductKey,
      productsByKey,
      resolveToBaseIngredients,
      ingredientsMap,
      intermediateMap,
      warnings
    });
  }

  const ingredients = mapEntriesToItems(ingredientsMap, productsByKey);
  const intermediateProducts = mapEntriesToItems(intermediateMap, productsByKey);

  const totals = productionPlan.reduce(
    (sum, entry) => {
      sum.xp += entry.totalXp;
      sum.coins += entry.totalCoins;
      sum.products += entry.amount;
      return sum;
    },
    {
      xp: 0,
      coins: 0,
      products: 0
    }
  );

  return {
    mode,
    level,
    hours,
    totals,
    productionPlan,
    productionByBuilding: groupProductionPlanByBuilding(productionPlan),
    ingredients,
    ingredientGroups: groupIngredients(ingredients),
    intermediateProducts,
    warnings
  };
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

export function getAvailableBuildings(products, level = 999) {
  const buildings = new Map();

  for (const product of products) {
    if (!product.building) continue;
    if ((product.level || 0) > level) continue;

    if (!buildings.has(product.building)) {
      buildings.set(product.building, {
        name: product.building,
        level: product.level || 0,
        iconUrl: ""
      });
    }

    const building = buildings.get(product.building);
    building.level = Math.min(building.level, product.level || 0);
  }

  return Array.from(buildings.values()).sort((a, b) => {
    return a.level - b.level || a.name.localeCompare(b.name);
  });
}
