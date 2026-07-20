"use client";

import { useState } from "react";
import { useCalculatorState } from "../../lib/useCalculatorState";

const modes = [
  { id: "coins", label: "Coins" },
  { id: "xp", label: "XP" },
  { id: "slots", label: "Slots" }
];

const defaultExcludedIngredients = [
  "Diamanten",
  "Honig",
  "Goldbarren",
  "Bienenwachs",
  "Fischfilet",
  "Hummer"
];

export default function SettingsEmbed() {
  const { state, updateState, resetState } = useCalculatorState();
  const [customExcludedIngredient, setCustomExcludedIngredient] = useState("");

  const baseSettingsComplete =
    Boolean(state.mode) &&
    state.level >= 1 &&
    state.hours >= 1 &&
    state.globalSlots >= 1;

  function toggleExcludedIngredient(name) {
    updateState((current) => {
      const exists = current.excludedIngredientNames.includes(name);

      return {
        ...current,
        excludedIngredientNames: exists
          ? current.excludedIngredientNames.filter((item) => item !== name)
          : [...current.excludedIngredientNames, name]
      };
    });
  }

  function addCustomExcludedIngredient() {
    const value = customExcludedIngredient.trim();
    if (!value) return;

    updateState((current) => {
      const exists = current.excludedIngredientNames.some(
        (item) => item.toLowerCase() === value.toLowerCase()
      );

      if (exists) return current;

      return {
        ...current,
        excludedIngredientNames: [...current.excludedIngredientNames, value]
      };
    });

    setCustomExcludedIngredient("");
  }

  function removeExcludedIngredient(name) {
    updateState((current) => ({
      ...current,
      excludedIngredientNames: current.excludedIngredientNames.filter((item) => item !== name)
    }));
  }

  function requestCalculation() {
    updateState((current) => ({
      ...current,
      calculationRequestedAt: Date.now()
    }));
  }

  return (
    <main className="embedShell">
      <section className="embedHeader">
        <div>
          <p className="eyebrow">Hay Day Calc.</p>
          <h1>Grundeinstellungen</h1>
        </div>

        <button type="button" className="ghostButton" onClick={resetState}>
          Zurücksetzen
        </button>
      </section>

      <section className="panel compactPanel">
        <div className="modeSegment">
          {modes.map((item) => (
            <button
              key={item.id}
              type="button"
              className={state.mode === item.id ? "segmentButton active" : "segmentButton"}
              onClick={() =>
                updateState({
                  mode: item.id,
                  calculationRequestedAt: null
                })
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        <label className="field compactField">
          <span>Level: {state.level}</span>
          <input
            type="range"
            min="1"
            max="126"
            step="1"
            value={state.level}
            onChange={(event) =>
              updateState({
                level: Number(event.target.value),
                userChangedBuildings: false,
                calculationRequestedAt: null
              })
            }
          />
        </label>

        <div className="dualRange">
          <label className="field compactField">
            <span>Zeit: {state.hours} h</span>
            <input
              type="range"
              min="1"
              max="48"
              step="1"
              value={state.hours}
              onChange={(event) =>
                updateState({
                  hours: Number(event.target.value),
                  calculationRequestedAt: null
                })
              }
            />
          </label>

          <label className="field compactField">
            <span>Fallback-Slots: {state.globalSlots}</span>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={state.globalSlots}
              onChange={(event) =>
                updateState({
                  globalSlots: Number(event.target.value),
                  calculationRequestedAt: null
                })
              }
            />
          </label>
        </div>

        {!baseSettingsComplete && (
          <p className="helperText inlineHelper">Wähle einen Rechenmodus.</p>
        )}
      </section>

      <section className={baseSettingsComplete ? "panel compactPanel" : "panel compactPanel disabled"}>
        <h2>Zusätzliche Einstellungen</h2>

        {!baseSettingsComplete ? (
          <p className="empty">Wird nach den Grunddaten freigeschaltet.</p>
        ) : (
          <>
            <label className="checkbox compactCheckbox singleCheckbox">
              <input
                type="checkbox"
                checked={state.intermediateMustBeProduced}
                onChange={(event) =>
                  updateState({
                    intermediateMustBeProduced: event.target.checked,
                    calculationRequestedAt: null
                  })
                }
              />
              Zwischenprodukte müssen hergestellt werden
            </label>

            <div className="excludedBox">
              <div className="excludedHeader">
                <strong>Zutaten ausschließen</strong>
                <small>{state.excludedIngredientNames.length} aktiv</small>
              </div>

              <div className="excludedQuickGrid">
                {defaultExcludedIngredients.map((ingredient) => (
                  <button
                    key={ingredient}
                    type="button"
                    className={
                      state.excludedIngredientNames.includes(ingredient)
                        ? "excludedChip active"
                        : "excludedChip"
                    }
                    onClick={() => toggleExcludedIngredient(ingredient)}
                  >
                    {ingredient}
                  </button>
                ))}
              </div>

              <div className="excludedInputRow">
                <input
                  type="text"
                  placeholder="Weitere Zutat"
                  value={customExcludedIngredient}
                  onChange={(event) => setCustomExcludedIngredient(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomExcludedIngredient();
                    }
                  }}
                />
                <button type="button" onClick={addCustomExcludedIngredient}>
                  +
                </button>
              </div>

              {state.excludedIngredientNames.length > 0 && (
                <div className="activeExcludedList">
                  {state.excludedIngredientNames.map((ingredient) => (
                    <button
                      key={ingredient}
                      type="button"
                      onClick={() => removeExcludedIngredient(ingredient)}
                    >
                      {ingredient} ×
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="button" className="calculateButton" onClick={requestCalculation}>
              Berechnung starten
            </button>
          </>
        )}
      </section>
    </main>
  );
}
