import ProductionCalculator from "./production/ProductionCalculator";
import ShipCalculator from "./ship/ShipCalculator";

export const calculators = [
  {
    id: "production",
    label: "Produktionsplan",
    description: "Optimiert Gebäude, Slots, Coins, XP und Zutaten.",
    component: ProductionCalculator
  },
  {
    id: "ship",
    label: "Schiff-Bestellung",
    description: "Berechnet Produkte, Zutaten und Machbarkeit für Schiffskisten.",
    component: ShipCalculator
  }
];

export function getCalculatorById(id) {
  return calculators.find((calculator) => calculator.id === id) || calculators[0];
}
