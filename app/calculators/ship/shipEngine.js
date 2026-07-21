import { calculateProductionPlan } from "../production/productionEngine";

function addToMap(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

function mapRequiredCrates({ crates, productsByKey, stockByProductKey }) {
  return crates
    .filter((crate) => crate.productKey && Number(crate.amount || 0) > 0)
    .map((crate) => {
      const product = productsByKey.get(crate.productKey);
      const amount = Number(crate.amount || 0);
      const stockAmount = Number(stockByProductKey?.[crate.productKey] || 0);
      const missingAmount = Math.max(amount - stockAmount, 0);

      return {
        key: crate.productKey,
        name: product?.name || crate.productKey,
        product,
        amount,
        stockAmount,
        missingAmount
      };
    });
}

function restrictProductsToShipNeeds(products, missingProducts) {
  const requiredByKey = new Map(missingProducts.map((item) => [item.key, item.missingAmount]));

  return products.map((product) => {
    if (!requiredByKey.has(product.key)) return product;

    return {
      ...product,
      shipRequiredAmount: requiredByKey.get(product.key)
    };
  });
}

export function calculateShipOrder({
  products,
  recipes,
  level = 999,
  hoursUntilDeparture = 16,
  crates = [],
  stockByProductKey = {},
  globalSlots = 4,
  slotsByBuilding = {},
  defaultSlotsByBuilding = {},
  allowedBuildings = [],
  intermediateMustBeProduced = true,
  excludedIngredientNames = []
}) {
  const productsByKey = new Map(products.map((product) => [product.key, product]));
  const requiredProducts = mapRequiredCrates({ crates, productsByKey, stockByProductKey });
  const missingProducts = requiredProducts.filter((item) => item.missingAmount > 0);
  const warnings = [];

  const forcedAllowedBuildings = new Set(allowedBuildings);

  for (const item of missingProducts) {
    if (item.product?.building) {
      forcedAllowedBuildings.add(item.product.building);
    }
  }

  const productionPlan = calculateProductionPlan({
    products: restrictProductsToShipNeeds(products, missingProducts),
    recipes,
    mode: "slots",
    level,
    hours: hoursUntilDeparture,
    globalSlots,
    slotsByBuilding,
    defaultSlotsByBuilding,
    allowedBuildings: Array.from(forcedAllowedBuildings),
    intermediateMustBeProduced,
    excludedIngredientNames
  });

  const plannedByKey = new Map();
  for (const entry of productionPlan.productionPlan || []) {
    addToMap(plannedByKey, entry.product.key, entry.amount);
  }

  const notCovered = missingProducts.filter((item) => {
    return (plannedByKey.get(item.key) || 0) < item.missingAmount;
  });

  if (notCovered.length) {
    warnings.push(
      `Nicht vollständig geplant: ${notCovered
        .map((item) => `${item.missingAmount}× ${item.name}`)
        .join(", ")}.`
    );
  }

  const deadlineMin = Number(hoursUntilDeparture || 0) * 60;
  const totalRequiredTimeMin = Number(productionPlan.totals?.effectiveTimeMin || 0);
  const possible = notCovered.length === 0 && totalRequiredTimeMin <= deadlineMin;

  return {
    possible,
    deadlineMin,
    totalRequiredTimeMin,
    requiredProducts,
    missingProducts,
    productionPlan: productionPlan.productionPlan,
    productionByBuilding: productionPlan.productionByBuilding,
    ingredients: productionPlan.ingredients,
    ingredientGroups: productionPlan.ingredientGroups,
    intermediateProducts: productionPlan.intermediateProducts,
    warnings: [...new Set([...warnings, ...(productionPlan.warnings || [])])],
    summary: {
      crateCount: crates.length,
      requestedProductCount: requiredProducts.reduce((sum, item) => sum + item.amount, 0),
      missingProductCount: missingProducts.reduce((sum, item) => sum + item.missingAmount, 0),
      requiredBuildings: productionPlan.totals?.buildings || 0
    }
  };
}
