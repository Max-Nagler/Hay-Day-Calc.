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
function getCombinationMaterialPressure(selection, model) {
if (selection.size === 0) return 0;
let pressure = 0;
for (const [key, amount] of selection.entries()) {
const product = model.productsByKey.get(key);
if (!product) continue;
const requirements = model.requirementsByProductKey.get(key) || new Map();
pressure += amount * safeNumber(product.timeMin, 0) * 0.1;
for (const [requiredKey, requiredAmount] of requirements.entries()) {
const requiredProduct = model.productsByKey.get(requiredKey);
if (!requiredProduct) continue;
pressure += amount * requiredAmount * 35;
pressure += amount * requiredAmount * safeNumber(requiredProduct.timeMin, 0) * 0.15;
}
}
return pressure;
}
function mapLessOrEqual(left, right) {
const keys = new Set([...left.keys(), ...right.keys()]);
for (const key of keys) {
if ((left.get(key) || 0) > (right.get(key) || 0)) return false;
}
return true;
}
function combinationDominates(left, right, model) {
if (left === right) return false;
if (left.value < right.value) return false;
if (left.slots > right.slots) return false;
if (left.minutes > right.minutes) return false;
const leftMake = requirementsFit(left.sell, model);
const rightMake = requirementsFit(right.sell, model);
if (!mapLessOrEqual(leftMake, rightMake)) return false;
return (
left.value > right.value ||
left.slots < right.slots ||
left.minutes < right.minutes ||
selectionSignature(leftMake) !== selectionSignature(rightMake)
);
}
function filterDominatedCombinations(combinations, model) {
const survivors = [];
let pruned = 0;
const sorted = [...combinations].sort((a, b) =>
b.value - a.value ||
a.slots - b.slots ||
a.minutes - b.minutes
);
for (const candidate of sorted) {
const dominated = survivors.some((survivor) => combinationDominates(survivor, candidate, model));
if (dominated) {
pruned += 1;
continue;
}
for (let index = survivors.length - 1; index >= 0; index -= 1) {
if (combinationDominates(candidate, survivors[index], model)) {
survivors.splice(index, 1);
pruned += 1;
}
}
survivors.push(candidate);
}
return {
combinations: survivors.sort((a, b) => (b.globalScore || b.value) - (a.globalScore || a.value) || b.value - a.value || (a.materialPressure || 0) - (b.materialPressure || 0)),
pruned
};
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
.slice(0, Math.max(slotLimit * 2, 8));
const combinationsBySignature = new Map();
function remember(selection, value, slots, minutes) {
const signature = selectionSignature(selection);
const current = combinationsBySignature.get(signature);
if (!current || value > current.value || (value === current.value && minutes < current.minutes)) {
const materialPressure = getCombinationMaterialPressure(selection, model);
combinationsBySignature.set(signature, {
building,
sell: cloneSelectionMap(selection),
value,
slots,
minutes,
materialPressure,
globalScore: value - materialPressure,
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
const rawCombinations = Array.from(combinationsBySignature.values())
.filter((combo) => combo.value > 0 || combo.slots === 0)
.sort((a, b) => (b.globalScore || b.value) - (a.globalScore || a.value) || b.value - a.value || (a.materialPressure || 0) - (b.materialPressure || 0));
const dominanceResult = filterDominatedCombinations(rawCombinations, model);
const emptyCombination = dominanceResult.combinations.find((combo) => combo.slots === 0) || {
building,
sell: new Map(),
value: 0,
slots: 0,
minutes: 0,
materialPressure: 0,
globalScore: 0,
products: []
};
const maxCombinationsPerBuilding = 12;
const nonEmptyCombinations = dominanceResult.combinations.filter((combo) => combo.slots > 0).slice(0, maxCombinationsPerBuilding);
const combinations = [emptyCombination, ...nonEmptyCombinations];
return {
building,
candidateProducts: candidates.length,
generatedCombinations: combinationsBySignature.size,
prunedByDominance: dominanceResult.pruned,
keptCombinationsBeforeLimit: dominanceResult.combinations.length,
keptCombinations: combinations.length,
maxCombinationsPerBuilding,
solverMode: "fast",
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
prunedByDominance: result.prunedByDominance || 0,
keptCombinationsBeforeLimit: result.keptCombinationsBeforeLimit || result.keptCombinations,
keptCombinations: result.keptCombinations,
maxCombinationsPerBuilding: result.maxCombinationsPerBuilding,
solverMode: result.solverMode,
bestLocalCombination: result.bestLocalCombination
? {
value: result.bestLocalCombination.value,
slots: result.bestLocalCombination.slots,
minutes: result.bestLocalCombination.minutes,
materialPressure: result.bestLocalCombination.materialPressure || 0,
globalScore: result.bestLocalCombination.globalScore || result.bestLocalCombination.value,
products: result.bestLocalCombination.products
}
: null,
selectedCombination: selectedCombinations.get(result.building)
? {
value: selectedCombinations.get(result.building).value,
slots: selectedCombinations.get(result.building).slots,
minutes: selectedCombinations.get(result.building).minutes,
materialPressure: selectedCombinations.get(result.building).materialPressure || 0,
globalScore: selectedCombinations.get(result.building).globalScore || selectedCombinations.get(result.building).value,
products: selectedCombinations.get(result.building).products
}
: null
})),
globalSearch: {
combinationsEvaluated: stats.combinationsEvaluated,
nodesVisited: stats.nodesVisited,
prunedByUpperBound: stats.prunedByUpperBound || 0,
prunedByMaterialFlow: stats.prunedByMaterialFlow || 0,
prunedBeforeRecursionByMaterialFlow: stats.prunedBeforeRecursionByMaterialFlow,
prunedByBuildingCapacity: stats.prunedByBuildingCapacity,
prunedByDominance: stats.prunedByDominance,
seedAttempts: stats.seedAttempts,
bestSeedValue: stats.bestSeedValue,
beamSearch: Boolean(stats.beamSearch),
solverMode: stats.solverMode,
beamWidth: stats.beamWidth,
beamExact: stats.beamExact,
beamDroppedStates: stats.beamDroppedStates,
beamLevels: (stats.beamLevels || []).slice(0, 12),
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
const startedAt = Date.now();
const maxRuntimeMs = 3500;
const beamWidth = 80;
let stoppedByTime = false;
const stats = {
nodesVisited: 0,
combinationsEvaluated: 0,
prunedByUpperBound: 0,
prunedByMaterialFlow: 0,
prunedBeforeRecursionByMaterialFlow: 0,
prunedByBuildingCapacity: 0,
prunedByDominance: buildingResults.reduce((sum, result) => sum + (result.prunedByDominance || 0), 0),
seedAttempts: 0,
bestSeedValue: 0,
beamSearch: true,
beamWidth,
solverMode: "fast",
beamExact: true,
beamDroppedStates: 0,
beamLevels: []
};
let bestValue = 0;
let bestSell = new Map();
let bestSelectedCombinations = new Map();
function rememberBest(selection, selectedCombinations, value) {
if (value > bestValue) {
bestValue = value;
bestSell = cloneSelectionMap(selection);
bestSelectedCombinations = new Map(selectedCombinations);
}
}
function stateScore(state) {
const requiredMake = requirementsFit(state.selection, model);
const usage = buildUsageFromMake(requiredMake, productsByKey);
let slackScore = 0;
for (const [building, slots] of usage.buildingSlots.entries()) {
slackScore += Math.max(0, getSlotsForBuilding(building, model.settings) - slots) * 4;
}
for (const [building, minutes] of usage.buildingMinutes.entries()) {
slackScore += Math.max(0, getTimeLimitMinutes(model.settings) - minutes) * 0.02;
}
return state.value + slackScore;
}
function seedGreedyFeasibleSolution(sorter = null, combinationSorter = null) {
const seedSelection = new Map();
const seedSelectedCombinations = new Map();
let seedValue = 0;
stats.seedAttempts += 1;
const seedBuildingResults = sorter ? [...orderedBuildingResults].sort(sorter) : orderedBuildingResults;
for (const buildingResult of seedBuildingResults) {
const seedCombinations = combinationSorter
? [...buildingResult.combinations].sort(combinationSorter)
: [...buildingResult.combinations].sort((a, b) =>
(b.globalScore || b.value) - (a.globalScore || a.value) ||
b.value - a.value
);
for (const combination of seedCombinations) {
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
stats.bestSeedValue = seedValue;
}
}
seedGreedyFeasibleSolution();
seedGreedyFeasibleSolution((a, b) => b.upperValue - a.upperValue);
seedGreedyFeasibleSolution(null, (a, b) => b.value - a.value || (a.materialPressure || 0) - (b.materialPressure || 0));
let states = [{
selection: new Map(),
selectedCombinations: new Map(),
value: 0,
signature: "empty"
}];
for (const buildingResult of orderedBuildingResults) {
if (Date.now() - startedAt > maxRuntimeMs) {
stoppedByTime = true;
break;
}
const nextBySignature = new Map();
let candidateExpansions = 0;
let feasibleExpansions = 0;
for (const state of states) {
for (const combination of buildingResult.combinations) {
candidateExpansions += 1;
stats.combinationsEvaluated += 1;
const nextSelection = cloneSelectionMap(state.selection);
mergeSelection(nextSelection, combination.sell);
const requiredMake = requirementsFit(nextSelection, model);
const usage = buildUsageFromMake(requiredMake, productsByKey);
if (!usageFits(usage.buildingMinutes, usage.buildingSlots, model.settings)) {
stats.prunedBeforeRecursionByMaterialFlow += 1;
continue;
}
feasibleExpansions += 1;
const nextSelectedCombinations = new Map(state.selectedCombinations);
nextSelectedCombinations.set(buildingResult.building, combination);
const nextState = {
selection: nextSelection,
selectedCombinations: nextSelectedCombinations,
value: state.value + combination.value,
signature: selectionSignature(nextSelection)
};
const existing = nextBySignature.get(nextState.signature);
if (!existing || nextState.value > existing.value) {
nextBySignature.set(nextState.signature, nextState);
}
rememberBest(nextSelection, nextSelectedCombinations, nextState.value);
}
}
let nextStates = Array.from(nextBySignature.values())
.sort((a, b) => stateScore(b) - stateScore(a) || b.value - a.value);
const statesBeforeTrim = nextStates.length;
if (nextStates.length > beamWidth) {
stats.beamExact = false;
stats.beamDroppedStates += nextStates.length - beamWidth;
nextStates = nextStates.slice(0, beamWidth);
}
stats.nodesVisited += candidateExpansions;
if (stats.beamLevels.length < 12) {
stats.beamLevels.push({
building: buildingResult.building,
statesBefore: states.length,
candidateExpansions,
feasibleExpansions,
statesBeforeTrim,
statesAfter: nextStates.length,
droppedStates: Math.max(0, statesBeforeTrim - nextStates.length),
bestValueAfter: bestValue,
worstKeptValueAfter: nextStates.length ? nextStates[nextStates.length - 1].value : 0
});
}
states = nextStates;
if (states.length === 0) break;
}
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
solverStatus: stoppedByTime ? "feasible_beam_time_limited" : stats.beamExact ? "optimal_beam_exact" : "feasible_beam_width_limited",
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
maxRuntimeMs,
runtimeMs: Date.now() - startedAt,
stoppedByTime,
combinationSolver: true,
beamSearch: true,
solverMode: "fast",
beamWidth,
beamExact: stats.beamExact,
beamDroppedStates: stats.beamDroppedStates,
combinationsEvaluated: stats.combinationsEvaluated,
prunedByDominance: stats.prunedByDominance,
prunedBeforeRecursionByMaterialFlow: stats.prunedBeforeRecursionByMaterialFlow,
seedAttempts: stats.seedAttempts,
bestSeedValue: stats.bestSeedValue
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
feasible: reasons.length === 0,
searchComplete: solution.solverStatus === "optimal" || solution.solverStatus === "optimal_beam_exact",
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
