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
    userChangedBuildings: false
  },
  modes: [
    { id: "coins", label: "Coins" },
    { id: "slots", label: "Slots" }
  ]
};
