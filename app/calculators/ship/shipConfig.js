export const shipCalculatorConfig = {
  id: "ship",
  label: "Schiff-Bestellung",
  defaultState: {
    level: 50,
    hoursUntilDeparture: 16,
    crates: [],
    stockByProductKey: {},
    globalSlots: 4,
    slotsByBuilding: {},
    allowedBuildings: [],
    intermediateMustBeProduced: true,
    excludedIngredientNames: []
  }
};

export function createEmptyCrate() {
  return {
    id: crypto.randomUUID(),
    productKey: "",
    amount: 1
  };
}
