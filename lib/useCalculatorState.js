"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "hay-day-calculator-state";

export const defaultCalculatorState = {
  mode: "",
  level: 50,
  hours: 8,
  globalSlots: 4,
  slotsByBuilding: {},
  intermediateMustBeProduced: false,
  excludedIngredientNames: [],
  allowedBuildings: [],
  userChangedBuildings: false,
  calculationRequestedAt: null
};

export function loadCalculatorState() {
  if (typeof window === "undefined") {
    return defaultCalculatorState;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return defaultCalculatorState;
    }

    return {
      ...defaultCalculatorState,
      ...JSON.parse(stored)
    };
  } catch {
    return defaultCalculatorState;
  }
}

export function saveCalculatorState(nextState) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  window.dispatchEvent(new Event("hay-day-calculator-state-change"));
}

export function useCalculatorState() {
  const [state, setState] = useState(defaultCalculatorState);

  useEffect(() => {
    setState(loadCalculatorState());

    function handleStorageChange(event) {
      if (!event || event.key === STORAGE_KEY) {
        setState(loadCalculatorState());
      }
    }

    function handleCustomChange() {
      setState(loadCalculatorState());
    }

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("hay-day-calculator-state-change", handleCustomChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("hay-day-calculator-state-change", handleCustomChange);
    };
  }, []);

  function updateState(updater) {
    setState((current) => {
      const next =
        typeof updater === "function"
          ? updater(current)
          : {
              ...current,
              ...updater
            };

      saveCalculatorState(next);
      return next;
    });
  }

  function resetState() {
    saveCalculatorState(defaultCalculatorState);
    setState(defaultCalculatorState);
  }

  return {
    state,
    updateState,
    resetState
  };
}
