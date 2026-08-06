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
function mapSignature(map) {
return Array.from(map.entries())
.filter(([, amount]) => amount > 0)
.sort(([a], [b]) => a.localeCompare(b))
.map(([key, amount]) => `${key}:${amount}`)
.join("|") || "empty";
}
function stateDominates(left, right) {
if (left === right) return false;
if (left.value < right.value) return false;
if (!mapLessOrEqual(left.buildingSlots || new Map(), right.buildingSlots || new Map())) return false;
if (!mapLessOrEqual(left.buildingMinutes || new Map(), right.buildingMinutes || new Map())) return false;
return (
left.value > right.value ||
mapSignature(left.buildingSlots || new Map()) !== mapSignature(right.buildingSlots || new Map()) ||
mapSignature(left.buildingMinutes || new Map()) !== mapSignature(right.buildingMinutes || new Map())
);
}
function filterDominatedStates(states) {
const survivors = [];
let pruned = 0;
const sorted = [...states].sort((a, b) =>
b.value - a.value ||
mapSignature(a.buildingSlots || new Map()).localeCompare(mapSignature(b.buildingSlots || new Map())) ||
mapSignature(a.buildingMinutes || new Map()).localeCompare(mapSignature(b.buildingMinutes || new Map()))
);
for (const candidate of sorted) {
const dominated = survivors.some((survivor) => stateDominates(survivor, candidate));
if (dominated) {
pruned += 1;
continue;
}
for (let index = survivors.length - 1; index >= 0; index -= 1) {
if (stateDominates(candidate, survivors[index])) {
survivors.splice(index, 1);
pruned += 1;
}
}
survivors.push(candidate);
}
return { states: survivors, pruned };
}
function usageProfileSignature(state) {
const buildings = new Set([
...Array.from((state.buildingSlots || new Map()).keys()),
...Array.from((state.buildingMinutes || new Map()).keys())
]);
return Array.from(buildings)
.sort((a, b) => a.localeCompare(b, "de"))
.map((building) => {
const slots = state.buildingSlots?.get(building) || 0;
const minuteBucket = Math.floor((state.buildingMinutes?.get(building) || 0) / 60);
return `${building}:${slots}:${minuteBucket}`;
})
.join("|") || "empty";
}
function addUniqueStates(target, source, limit) {
let added = 0;
for (const state of source) {
if (target.size >= limit) break;
if (target.has(state.signature)) continue;
target.set(state.signature, state);
added += 1;
}
return added;
}
function selectBeamStates(states, beamWidth, scoreFn) {
if (states.length <= beamWidth) {
return {
states,
dropped: 0,
selection: {
selectedByScore: states.length,
selectedByValue: 0,
selectedByDiversity: 0
}
};
}
const selected = new Map();
const byScore = [...states].sort((a, b) => scoreFn(b) - scoreFn(a) || b.value - a.value);
const byValue = [...states].sort((a, b) => b.value - a.value || scoreFn(b) - scoreFn(a));
const selectedByScore = addUniqueStates(selected, byScore, Math.ceil(beamWidth * 0.6));
const selectedByValue = addUniqueStates(selected, byValue, Math.ceil(beamWidth * 0.8));
const bestByProfile = new Map();
for (const state of states) {
const profile = usageProfileSignature(state);
const current = bestByProfile.get(profile);
if (!current || scoreFn(state) > scoreFn(current) || (scoreFn(state) === scoreFn(current) && state.value > current.value)) {
bestByProfile.set(profile, state);
}
}
const diverseStates = Array.from(bestByProfile.values())
.sort((a, b) => scoreFn(b) - scoreFn(a) || b.value - a.value);
const beforeDiversity = selected.size;
addUniqueStates(selected, diverseStates, beamWidth);
if (selected.size < beamWidth) {
addUniqueStates(selected, byScore, beamWidth);
}
return {
states: Array.from(selected.values())
.sort((a, b) => scoreFn(b) - scoreFn(a) || b.value - a.value),
dropped: Math.max(0, states.length - selected.size),
selection: {
selectedByScore,
selectedByValue: Math.max(0, beforeDiversity - selectedByScore),
selectedByDiversity: Math.max(0, selected.size - beforeDiversity)
}
};
}
function combinationDominates(left, right) {
if (left === right) return false;
if (left.value < right.value) return false;
if (left.slots > right.slots) return false;
if (left.minutes > right.minutes) return false;
const leftMake = left.requiredMake || new Map();
const rightMake = right.requiredMake || new Map();
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
const dominated = survivors.some((survivor) => combinationDominates(survivor, candidate));
if (dominated) {
pruned += 1;
continue;
}
for (let index = survivors.length - 1; index >= 0; index -= 1) {
if (combinationDominates(candidate, survivors[index])) {
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
function addUniqueCombinations(target, source, limit) {
let added = 0;
for (const combination of source) {
if (target.size >= limit) break;
const signature = selectionSignature(combination.sell || new Map());
if (target.has(signature)) continue;
target.set(signature, combination);
added += 1;
}
return added;
}
function combinationProfileSignature(combination) {
const makeSignature = mapSignature(combination.requiredMake || new Map());
const slotBucket = combination.slots || 0;
const minuteBucket = Math.floor((combination.minutes || 0) / 60);
const pressureBucket = Math.floor((combination.materialPressure || 0) / 100);
return `${slotBucket}:${minuteBucket}:${pressureBucket}:${makeSignature}`;
}
function getDynamicCombinationLimit({ configuredLimit, candidates, dominanceCount }) {
const safeLimit = Math.max(safeNumber(configuredLimit, 24), 1);
const hasManyCandidates = candidates.length >= 4;
const hasManyCombinations = dominanceCount > safeLimit;
const highestRequirementPressure = Math.max(...candidates.map((item) => item.requirementPressure || 0), 0);
if (hasManyCombinations && hasManyCandidates && highestRequirementPressure > 120) return safeLimit;
if (hasManyCombinations && hasManyCandidates) return Math.max(12, Math.floor(safeLimit * 0.75));
return Math.max(8, Math.min(12, safeLimit));
}
function getCombinationGuidedScore(combination, guidance = null) {
if (!guidance) return combination.globalScore || combination.value;
let resourceCost = 0;
for (const [building, slots] of (combination.buildingSlots || new Map()).entries()) {
resourceCost += slots * (guidance.slotPressure?.get(building) || 0) * 120;
}
for (const [building, minutes] of (combination.buildingMinutes || new Map()).entries()) {
resourceCost += minutes * (guidance.minutePressure?.get(building) || 0) * 1.2;
}
const signature = selectionSignature(combination.sell || new Map());
const appearedBonus = guidance.selectedCombinationSignatures?.has(signature) ? Math.max(30, combination.value * 0.08) : 0;
return combination.value - (combination.materialPressure || 0) * 0.35 - resourceCost + appearedBonus;
}
function selectLocalCombinations(combinations, limit, guidance = null) {
const nonEmpty = combinations.filter((combo) => combo.slots > 0);
if (nonEmpty.length <= limit) {
return {
combinations: nonEmpty.map((combo) => ({
...combo,
guidedScore: getCombinationGuidedScore(combo, guidance)
})),
selection: {
selectedByGuidedScore: nonEmpty.length,
selectedByGlobalScore: 0,
selectedByValue: 0,
selectedByLowResourceCost: 0,
selectedByDiversity: 0
}
};
}
const scored = nonEmpty.map((combo) => ({
...combo,
guidedScore: getCombinationGuidedScore(combo, guidance)
}));
const selected = new Map();
const byGuidedScore = [...scored].sort((a, b) =>
(b.guidedScore || b.globalScore || b.value) - (a.guidedScore || a.globalScore || a.value) ||
b.value - a.value ||
(a.materialPressure || 0) - (b.materialPressure || 0)
);
const byGlobalScore = [...scored].sort((a, b) =>
(b.globalScore || b.value) - (a.globalScore || a.value) ||
b.value - a.value ||
(a.materialPressure || 0) - (b.materialPressure || 0)
);
const byValue = [...scored].sort((a, b) =>
b.value - a.value ||
(a.materialPressure || 0) - (b.materialPressure || 0) ||
a.minutes - b.minutes
);
const byLowResourceCost = [...scored].sort((a, b) =>
((b.guidedScore || b.value) - b.value) - ((a.guidedScore || a.value) - a.value) ||
(a.materialPressure || 0) - (b.materialPressure || 0) ||
b.value - a.value
);
const selectedByGuidedScore = addUniqueCombinations(selected, byGuidedScore, Math.ceil(limit * 0.45));
const beforeGlobalScore = selected.size;
addUniqueCombinations(selected, byGlobalScore, Math.ceil(limit * 0.65));
const selectedByGlobalScore = selected.size - beforeGlobalScore;
const beforeValue = selected.size;
addUniqueCombinations(selected, byValue, Math.ceil(limit * 0.8));
const selectedByValue = selected.size - beforeValue;
const beforeLowResourceCost = selected.size;
addUniqueCombinations(selected, byLowResourceCost, Math.ceil(limit * 0.92));
const selectedByLowResourceCost = selected.size - beforeLowResourceCost;
const bestByProfile = new Map();
for (const combination of scored) {
const profile = combinationProfileSignature(combination);
const current = bestByProfile.get(profile);
if (
!current ||
(combination.guidedScore || combination.globalScore || combination.value) > (current.guidedScore || current.globalScore || current.value) ||
((combination.guidedScore || combination.globalScore || combination.value) === (current.guidedScore || current.globalScore || current.value) && combination.value > current.value)
) {
bestByProfile.set(profile, combination);
}
}
const diverseCombinations = Array.from(bestByProfile.values())
.sort((a, b) =>
(b.guidedScore || b.globalScore || b.value) - (a.guidedScore || a.globalScore || a.value) ||
b.value - a.value
);
const beforeDiversity = selected.size;
addUniqueCombinations(selected, diverseCombinations, limit);
if (selected.size < limit) {
addUniqueCombinations(selected, byGuidedScore, limit);
}
return {
combinations: Array.from(selected.values())
.sort((a, b) =>
(b.guidedScore || b.globalScore || b.value) - (a.guidedScore || a.globalScore || a.value) ||
b.value - a.value ||
(a.materialPressure || 0) - (b.materialPressure || 0)
),
selection: {
selectedByGuidedScore,
selectedByGlobalScore,
selectedByValue,
selectedByLowResourceCost,
selectedByDiversity: selected.size - beforeDiversity
}
};
}
function createBuildingCombinations(building, products, model, guidance = null) {
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
const requiredMake = requirementsFit(selection, model);
const usage = buildUsageFromMake(requiredMake, model.productsByKey);
const materialPressure = getCombinationMaterialPressure(selection, model);
combinationsBySignature.set(signature, {
building,
sell: cloneSelectionMap(selection),
value,
slots,
minutes,
requiredMake,
buildingMinutes: usage.buildingMinutes,
buildingSlots: usage.buildingSlots,
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
const configuredMaxCombinationsPerBuilding = Math.max(safeNumber(model.settings.maxCombinationsPerBuilding, 24), 1);
const maxCombinationsPerBuilding = getDynamicCombinationLimit({
configuredLimit: configuredMaxCombinationsPerBuilding,
candidates,
dominanceCount: dominanceResult.combinations.length
});
const localSelection = selectLocalCombinations(dominanceResult.combinations, maxCombinationsPerBuilding, guidance);
const nonEmptyCombinations = localSelection.combinations;
const combinations = [emptyCombination, ...nonEmptyCombinations];
return {
building,
candidateProducts: candidates.length,
generatedCombinations: combinationsBySignature.size,
prunedByDominance: dominanceResult.pruned,
keptCombinationsBeforeLimit: dominanceResult.combinations.length,
keptCombinations: combinations.length,
configuredMaxCombinationsPerBuilding,
maxCombinationsPerBuilding,
localCombinationSelection: localSelection.selection,
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
configuredMaxCombinationsPerBuilding: result.configuredMaxCombinationsPerBuilding || result.maxCombinationsPerBuilding,
maxCombinationsPerBuilding: result.maxCombinationsPerBuilding,
localCombinationSelection: result.localCombinationSelection,
solverMode: result.solverMode,
bestLocalCombination: result.bestLocalCombination
? {
value: result.bestLocalCombination.value,
slots: result.bestLocalCombination.slots,
minutes: result.bestLocalCombination.minutes,
materialPressure: result.bestLocalCombination.materialPressure || 0,
globalScore: result.bestLocalCombination.globalScore || result.bestLocalCombination.value,
guidedScore: result.bestLocalCombination.guidedScore,
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
guidedScore: selectedCombinations.get(result.building).guidedScore,
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
function buildBuildingResults(model, guidance = null) {
const buildings = Array.from(new Set(model.products.map((product) => getBuildingName(product))))
.sort((a, b) => a.localeCompare(b, "de"));
return buildings.map((building) => createBuildingCombinations(building, model.products, model, guidance));
}
function orderBuildingResults(buildingResults, model) {
return buildingResults
.map((result) => ({
...result,
upperValue: Math.max(...result.combinations.map((combo) => combo.value), 0)
}))
.sort((a, b) => {
const aDependency = Math.max(...a.combinations.map((combo) => {
const make = combo.requiredMake || requirementsFit(combo.sell, model);
return Array.from(make.values()).reduce((sum, amount) => sum + amount, 0) - combo.slots;
}), 0);
const bDependency = Math.max(...b.combinations.map((combo) => {
const make = combo.requiredMake || requirementsFit(combo.sell, model);
return Array.from(make.values()).reduce((sum, amount) => sum + amount, 0) - combo.slots;
}), 0);
return bDependency - aDependency || b.upperValue - a.upperValue || a.building.localeCompare(b.building, "de");
});
}
function runBeamSearch(model, buildingResults, options = {}) {
const productsByKey = new Map(model.products.map((product) => [product.key, product]));
const orderedBuildingResults = orderBuildingResults(buildingResults, model);
const startedAt = Date.now();
const maxRuntimeMs = Math.max(safeNumber(options.maxRuntimeMs ?? model.settings.maxRuntimeMs, 3500), 250);
const beamWidth = Math.max(safeNumber(options.beamWidth ?? model.settings.beamWidth, 80), 10);
let stoppedByTime = false;
const stats = {
nodesVisited: 0,
combinationsEvaluated: 0,
prunedByUpperBound: 0,
prunedByMaterialFlow: 0,
prunedBeforeRecursionByMaterialFlow: 0,
prunedByBuildingCapacity: 0,
prunedByDominance: buildingResults.reduce((sum, result) => sum + (result.prunedByDominance || 0), 0),
prunedByStateDominance: 0,
seedAttempts: 0,
bestSeedValue: 0,
beamSearch: true,
beamWidth,
solverMode: options.phase || "fast",
beamExact: true,
beamDroppedStates: 0,
beamSelection: {
selectedByScore: 0,
selectedByValue: 0,
selectedByDiversity: 0
},
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
let slackScore = 0;
for (const [building, slots] of state.buildingSlots.entries()) {
slackScore += Math.max(0, getSlotsForBuilding(building, model.settings) - slots) * 4;
}
for (const [building, minutes] of state.buildingMinutes.entries()) {
slackScore += Math.max(0, getTimeLimitMinutes(model.settings) - minutes) * 0.02;
}
return state.value + slackScore;
}
function seedGreedyFeasibleSolution(sorter = null, combinationSorter = null) {
const seedSelection = new Map();
const seedSelectedCombinations = new Map();
let seedValue = 0;
let seedBuildingMinutes = new Map();
let seedBuildingSlots = new Map();
stats.seedAttempts += 1;
const seedBuildingResults = sorter ? [...orderedBuildingResults].sort(sorter) : orderedBuildingResults;
for (const buildingResult of seedBuildingResults) {
const seedCombinations = combinationSorter
? [...buildingResult.combinations].sort(combinationSorter)
: [...buildingResult.combinations].sort((a, b) =>
(b.guidedScore || b.globalScore || b.value) - (a.guidedScore || a.globalScore || a.value) ||
b.value - a.value
);
for (const combination of seedCombinations) {
const nextBuildingMinutes = cloneSelectionMap(seedBuildingMinutes);
const nextBuildingSlots = cloneSelectionMap(seedBuildingSlots);
mergeSelection(nextBuildingMinutes, combination.buildingMinutes);
mergeSelection(nextBuildingSlots, combination.buildingSlots);
if (usageFits(nextBuildingMinutes, nextBuildingSlots, model.settings)) {
mergeSelection(seedSelection, combination.sell);
seedBuildingMinutes = nextBuildingMinutes;
seedBuildingSlots = nextBuildingSlots;
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
seedGreedyFeasibleSolution(null, (a, b) => (b.guidedScore || b.globalScore || b.value) - (a.guidedScore || a.globalScore || a.value));
const remainingUpperBounds = new Array(orderedBuildingResults.length + 1).fill(0);
for (let index = orderedBuildingResults.length - 1; index >= 0; index -= 1) {
remainingUpperBounds[index] = remainingUpperBounds[index + 1] + orderedBuildingResults[index].upperValue;
}
let states = [{
selection: new Map(),
selectedCombinations: new Map(),
value: 0,
buildingMinutes: new Map(),
buildingSlots: new Map(),
signature: "empty"
}];
for (const [buildingIndex, buildingResult] of orderedBuildingResults.entries()) {
if (Date.now() - startedAt > maxRuntimeMs) {
stoppedByTime = true;
break;
}
const nextBySignature = new Map();
let candidateExpansions = 0;
let feasibleExpansions = 0;
let upperBoundPrunedThisLevel = 0;
let stateDominancePrunedThisLevel = 0;
for (const state of states) {
for (const combination of buildingResult.combinations) {
candidateExpansions += 1;
stats.combinationsEvaluated += 1;
const nextBuildingMinutes = cloneSelectionMap(state.buildingMinutes);
const nextBuildingSlots = cloneSelectionMap(state.buildingSlots);
mergeSelection(nextBuildingMinutes, combination.buildingMinutes);
mergeSelection(nextBuildingSlots, combination.buildingSlots);
if (!usageFits(nextBuildingMinutes, nextBuildingSlots, model.settings)) {
stats.prunedBeforeRecursionByMaterialFlow += 1;
continue;
}
feasibleExpansions += 1;
const nextSelection = cloneSelectionMap(state.selection);
mergeSelection(nextSelection, combination.sell);
const nextValue = state.value + combination.value;
if (nextValue + remainingUpperBounds[buildingIndex + 1] <= bestValue) {
stats.prunedByUpperBound += 1;
upperBoundPrunedThisLevel += 1;
continue;
}
const nextSelectedCombinations = new Map(state.selectedCombinations);
nextSelectedCombinations.set(buildingResult.building, combination);
const nextState = {
selection: nextSelection,
selectedCombinations: nextSelectedCombinations,
value: nextValue,
buildingMinutes: nextBuildingMinutes,
buildingSlots: nextBuildingSlots,
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
const statesBeforeDominance = nextStates.length;
if (nextStates.length > beamWidth) {
const dominanceInputLimit = Math.min(nextStates.length, beamWidth * 3);
const definitelyDropped = Math.max(0, nextStates.length - dominanceInputLimit);
const dominanceCandidates = nextStates.slice(0, dominanceInputLimit);
const dominanceResult = filterDominatedStates(dominanceCandidates);
nextStates = dominanceResult.states;
stateDominancePrunedThisLevel = dominanceResult.pruned + definitelyDropped;
stats.prunedByStateDominance += dominanceResult.pruned;
if (definitelyDropped > 0) {
stats.beamExact = false;
stats.beamDroppedStates += definitelyDropped;
}
nextStates = nextStates.sort((a, b) => stateScore(b) - stateScore(a) || b.value - a.value);
}
const statesBeforeTrim = nextStates.length;
let beamSelection = {
selectedByScore: nextStates.length,
selectedByValue: 0,
selectedByDiversity: 0
};
if (nextStates.length > beamWidth) {
const selectionResult = selectBeamStates(nextStates, beamWidth, stateScore);
nextStates = selectionResult.states;
beamSelection = selectionResult.selection;
stats.beamExact = false;
stats.beamDroppedStates += selectionResult.dropped;
stats.beamSelection.selectedByScore += beamSelection.selectedByScore;
stats.beamSelection.selectedByValue += beamSelection.selectedByValue;
stats.beamSelection.selectedByDiversity += beamSelection.selectedByDiversity;
}
stats.nodesVisited += candidateExpansions;
if (stats.beamLevels.length < 12) {
stats.beamLevels.push({
building: buildingResult.building,
statesBefore: states.length,
candidateExpansions,
feasibleExpansions,
upperBoundPruned: upperBoundPrunedThisLevel,
statesBeforeDominance,
stateDominancePruned: stateDominancePrunedThisLevel,
statesBeforeTrim,
statesAfter: nextStates.length,
droppedStates: Math.max(0, statesBeforeTrim - nextStates.length),
beamSelection,
bestValueAfter: bestValue,
worstKeptValueAfter: nextStates.length ? nextStates[nextStates.length - 1].value : 0
});
}
states = nextStates;
if (states.length === 0) break;
}
const requiredMake = requirementsFit(bestSell, model);
const usage = buildUsageFromMake(requiredMake, productsByKey);
const make = new Map();
const sell = new Map();
const usedAsIntermediate = new Map();
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
selectedCombinations: bestSelectedCombinations,
stats,
maxRuntimeMs,
runtimeMs: Date.now() - startedAt,
stoppedByTime
};
}
function mapToObject(map) {
return Object.fromEntries(Array.from((map || new Map()).entries()).sort(([a], [b]) => a.localeCompare(b, "de")));
}
function buildProbeGuidance(probeResult, model) {
const slotPressure = new Map();
const minutePressure = new Map();
const selectedCombinationSignatures = new Set();
const timeLimit = getTimeLimitMinutes(model.settings);
for (const [building, slots] of probeResult.buildingSlots.entries()) {
slotPressure.set(building, slots / Math.max(getSlotsForBuilding(building, model.settings), 1));
}
for (const [building, minutes] of probeResult.buildingMinutes.entries()) {
minutePressure.set(building, minutes / Math.max(timeLimit, 1));
}
for (const combination of probeResult.selectedCombinations.values()) {
selectedCombinationSignatures.add(selectionSignature(combination.sell || new Map()));
}
return { slotPressure, minutePressure, selectedCombinationSignatures };
}
function summarizeProbeSearch(probeResult, guidance) {
return {
objectiveValue: probeResult.objectiveValue,
solverStatus: probeResult.solverStatus,
runtimeMs: probeResult.runtimeMs,
beamWidth: probeResult.stats.beamWidth,
beamExact: probeResult.stats.beamExact,
beamDroppedStates: probeResult.stats.beamDroppedStates,
visitedNodes: probeResult.stats.nodesVisited,
bestSeedValue: probeResult.stats.bestSeedValue,
slotPressure: mapToObject(guidance.slotPressure),
minutePressure: mapToObject(guidance.minutePressure)
};
}
export function solveOptimizationModel(model) {
const beamWidth = Math.max(safeNumber(model.settings.beamWidth, 80), 10);
const maxRuntimeMs = Math.max(safeNumber(model.settings.maxRuntimeMs, 3500), 250);
const probeSettings = {
...model.settings,
maxCombinationsPerBuilding: Math.min(Math.max(safeNumber(model.settings.maxCombinationsPerBuilding, 24), 1), 12)
};
const probeModel = { ...model, settings: probeSettings };
const probeBuildingResults = buildBuildingResults(probeModel);
const probeResult = runBeamSearch(probeModel, probeBuildingResults, {
beamWidth: Math.max(20, Math.min(60, Math.floor(beamWidth * 0.35))),
maxRuntimeMs: Math.max(500, Math.min(1200, Math.floor(maxRuntimeMs * 0.12))),
phase: "probe"
});
const guidance = buildProbeGuidance(probeResult, model);
const buildingResults = buildBuildingResults(model, guidance);
const finalResult = runBeamSearch(model, buildingResults, {
beamWidth,
maxRuntimeMs,
phase: "fast"
});
return {
solverStatus: finalResult.solverStatus,
objectiveValue: finalResult.objectiveValue,
make: finalResult.make,
sell: finalResult.sell,
usedAsIntermediate: finalResult.usedAsIntermediate,
buildingMinutes: finalResult.buildingMinutes,
buildingSlots: finalResult.buildingSlots,
variablesCount: model.variablesCount,
constraintsCount: model.constraintsCount,
infeasibleReasons: [],
raw: {
visitedNodes: finalResult.stats.nodesVisited,
maxRuntimeMs,
runtimeMs: finalResult.runtimeMs,
stoppedByTime: finalResult.stoppedByTime,
combinationSolver: true,
beamSearch: true,
solverMode: "fast",
beamWidth,
beamExact: finalResult.stats.beamExact,
beamDroppedStates: finalResult.stats.beamDroppedStates,
beamSelection: finalResult.stats.beamSelection,
combinationsEvaluated: finalResult.stats.combinationsEvaluated,
prunedByDominance: finalResult.stats.prunedByDominance,
prunedByStateDominance: finalResult.stats.prunedByStateDominance,
prunedBeforeRecursionByMaterialFlow: finalResult.stats.prunedBeforeRecursionByMaterialFlow,
prunedByUpperBound: finalResult.stats.prunedByUpperBound,
seedAttempts: finalResult.stats.seedAttempts,
bestSeedValue: finalResult.stats.bestSeedValue,
probeSearch: summarizeProbeSearch(probeResult, guidance)
},
combinationDebug: {
...buildCombinationSearchDebug(buildingResults, finalResult.stats, finalResult.selectedCombinations, finalResult.objectiveValue),
probeSearch: summarizeProbeSearch(probeResult, guidance)
}
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
