export const productionCalculatorConfig = {
  id: "production",
  label: "Produktionsplan",
  defaultState: {
    mode: "",
    level: 50,
    hours: 8,
    globalSlots: 4,
    slotsByBuilding: {},
    intermediateMustBeProduced: false,
    excludedIngredientNames: [],
    allowedBuildings: [],
    userChangedBuildings: false,
    beamWidth: 80,
    maxRuntimeMs: 3500,
    maxCombinationsPerBuilding: 24
  },
  modes: [
    { id: "coins", label: "Coins" },
    { id: "slots", label: "Slots" }
  ]
};
