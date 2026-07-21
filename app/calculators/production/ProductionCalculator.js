"use client";

import DashboardInsights from "../../components/DashboardInsights";
import "../../components/dashboard.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { calculateProductionPlan, getAvailableBuildings } from "./productionEngine";
import ProductIcon from "../../components/ProductIcon";
import BuildingIcon from "../../components/BuildingIcon";
import { productionCalculatorConfig } from "./productionConfig";

function createIngredientLookup(products) {
  return Object.fromEntries((products || []).map((product) => [product.key, product]));
}

function getEntryIngredients(entry, ingredientLookup) {
  return Array.from(entry.ingredientsMap?.entries?.() || [])
    .map(([key, amount]) => {
      const product = ingredientLookup[key];

      return {
        key,
        amount,
        name: product?.name || key,
        iconUrl: product?.iconUrl || "",
        level: product?.level || 0
      };
    })
    .filter((item) => item.name);
}

function mergeBuildingData(availableBuildings, normalizedBuildings) {
  const buildingByName = new Map();

  for (const building of normalizedBuildings || []) {
    if (!building?.name) continue;
    buildingByName.set(building.name, building);
  }

  return availableBuildings.map((building) => {
    const fullBuilding = buildingByName.get(building.name);

    return {
      ...building,
      iconUrl: building.iconUrl || fullBuilding?.iconUrl || "",
      slots: fullBuilding?.slots || building.slots || 0,
      level: Math.min(
        building.level || fullBuilding?.level || 0,
        fullBuilding?.level || building.level || 0
      )
    };
  });
}

function IngredientFloatingOverlay({ hover }) {
  if (!hover) return null;

  const left = Math.min(Math.max(hover.x, 130), window.innerWidth - 130);
  const top = Math.max(hover.y - 14, 80);

  return (
    <div className="floatingIngredientPanel" style={{ left, top }}>
      <strong>{hover.productName}</strong>

      {hover.ingredients.length ? (
        <div className="floatingIngredientGrid">
          {hover.ingredients.map((item) => (
            <div key={item.key} className="floatingIngredientItem">
              <ProductIcon item={item} />
              <span>{item.amount}×</span>
              <small>{item.name}</small>
            </div>
          ))}
        </div>
      ) : (
        <span className="ingredientHoverEmpty">Keine Zutaten</span>
      )}
    </div>
  );
}

export default function ProductionCalculator({ normalized }) {
  const outputRef = useRef(null);
  const config = productionCalculatorConfig;

  const [mode, setMode] = useState(config.defaultState.mode);
  const [level, setLevel] = useState(config.defaultState.level);
  const [hours, setHours] = useState(config.defaultState.hours);
  const [globalSlots, setGlobalSlots] = useState(config.defaultState.globalSlots);
  const [slotsByBuilding, setSlotsByBuilding] = useState(config.defaultState.slotsByBuilding);
  const [intermediateMustBeProduced, setIntermediateMustBeProduced] = useState(
    config.defaultState.intermediateMustBeProduced
  );
  const [excludedIngredientNames, setExcludedIngredientNames] = useState(
    config.defaultState.excludedIngredientNames
  );
  const [customExcludedIngredient, setCustomExcludedIngredient] = useState("");
  const [allowedBuildings, setAllowedBuildings] = useState(config.defaultState.allowedBuildings);
  const [userChangedBuildings, setUserChangedBuildings] = useState(config.defaultState.userChangedBuildings);
  const [calculationSettings, setCalculationSettings] = useState(null);
  const [calculationStarted, setCalculationStarted] = useState(false);
  const [hoverIngredients, setHoverIngredients] = useState(null);

  const baseSettingsComplete = Boolean(mode) && level >= 1 && hours >= 1 && globalSlots >= 1;

  const availableBuildingsFromProducts = useMemo(
    () => getAvailableBuildings(normalized.products, level || 0),
    [normalized.products, level]
  );

  const availableBuildings = useMemo(
    () => mergeBuildingData(availableBuildingsFromProducts, normalized.buildings),
    [availableBuildingsFromProducts, normalized.buildings]
  );

  const availableBuildingNames = useMemo(
    () => availableBuildings.map((building) => building.name),
    [availableBuildings]
  );

  const defaultSlotsByBuilding = useMemo(() => {
    const map = {};

    for (const building of normalized.buildings || []) {
      if (building.name && building.slots) map[building.name] = building.slots;
    }

    for (const product of normalized.products || []) {
      if (product.building && product.buildingSlots) map[product.building] = product.buildingSlots;
    }

    return map;
  }, [normalized.buildings, normalized.products]);

  const ingredientLookup = useMemo(
    () => createIngredientLookup(normalized.products),
    [normalized.products]
  );

  useEffect(() => {
    if (!baseSettingsComplete) {
      setAllowedBuildings([]);
      setUserChangedBuildings(false);
      return;
    }

    setAllowedBuildings((current) => {
      const stillAvailable = current.filter((name) => availableBuildingNames.includes(name));
      return userChangedBuildings ? stillAvailable : availableBuildingNames;
    });
  }, [availableBuildingNames, baseSettingsComplete, userChangedBuildings]);

  useEffect(() => {
    setCalculationStarted(false);
    setCalculationSettings(null);
  }, [
    mode,
    level,
    hours,
    globalSlots,
    slotsByBuilding,
    intermediateMustBeProduced,
    excludedIngredientNames,
    allowedBuildings
  ]);

  const result = useMemo(() => {
    if (!calculationStarted || !calculationSettings) return null;

    return calculateProductionPlan({
      products: normalized.products,
      recipes: normalized.recipes,
      ...calculationSettings
    });
  }, [normalized.products, normalized.recipes, calculationStarted, calculationSettings]);

  useEffect(() => {
    if (!result) return;
    requestAnimationFrame(() => outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [result]);

  function getBuildingSlots(buildingName) {
    return slotsByBuilding[buildingName] ?? defaultSlotsByBuilding[buildingName] ?? globalSlots;
  }

  function toggleBuilding(buildingName) {
    setUserChangedBuildings(true);
    setAllowedBuildings((current) =>
      current.includes(buildingName)
        ? current.filter((name) => name !== buildingName)
        : [...current, buildingName]
    );
  }

  function addCustomExcludedIngredient() {
    const value = customExcludedIngredient.trim();
    if (!value) return;

    setExcludedIngredientNames((current) =>
      current.some((item) => item.toLowerCase() === value.toLowerCase()) ? current : [...current, value]
    );
    setCustomExcludedIngredient("");
  }

  function startCalculation() {
    if (!baseSettingsComplete || allowedBuildings.length === 0) return;

    setCalculationSettings({
      mode,
      level,
      hours,
      globalSlots,
      slotsByBuilding,
      defaultSlotsByBuilding,
      allowedBuildings,
      intermediateMustBeProduced,
      excludedIngredientNames
    });
    setCalculationStarted(true);
  }

  function showIngredientOverlay(event, entry) {
    setHoverIngredients({
      x: event.clientX,
      y: event.clientY,
      productName: entry.product.name,
      ingredients: getEntryIngredients(entry, ingredientLookup)
    });
  }

  function moveIngredientOverlay(event) {
    setHoverIngredients((current) => current && { ...current, x: event.clientX, y: event.clientY });
  }

  return (
    <>
      <IngredientFloatingOverlay hover={hoverIngredients} />

      <section className="settingsGrid compactSettingsGrid equalSettingsGrid">
        <div className="settingsColumn">
          <details open className="panel compactPanel">
            <summary>Grunddaten</summary>

            <div className="modeSegment">
              {config.modes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={mode === item.id ? "segmentButton active" : "segmentButton"}
                  onClick={() => setMode(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <label className="field compactField">
              <span>Level: {level}</span>
              <input type="range" min="1" max="126" step="1" value={level} onChange={(event) => setLevel(Number(event.target.value))} />
            </label>

            <div className="dualRange">
              <label className="field compactField">
                <span>Zeit: {hours} h</span>
                <input type="range" min="1" max="48" step="1" value={hours} onChange={(event) => setHours(Number(event.target.value))} />
              </label>

              <label className="field compactField">
                <span>Fallback-Slots: {globalSlots}</span>
                <input type="range" min="1" max="10" step="1" value={globalSlots} onChange={(event) => setGlobalSlots(Number(event.target.value))} />
              </label>
            </div>

            {!baseSettingsComplete && <p className="helperText inlineHelper">Wähle einen Rechenmodus.</p>}
          </details>

          <details className={baseSettingsComplete ? "panel compactPanel" : "panel compactPanel disabled"}>
            <summary>Zusatzeinstellungen</summary>
            {baseSettingsComplete ? (
              <label className="checkbox compactCheckbox singleCheckbox">
                <input type="checkbox" checked={intermediateMustBeProduced} onChange={(event) => setIntermediateMustBeProduced(event.target.checked)} />
                Zwischenprodukte müssen hergestellt werden
              </label>
            ) : (
              <p className="empty">Wird nach den Grunddaten freigeschaltet.</p>
            )}
          </details>

          <details className={baseSettingsComplete ? "panel compactPanel" : "panel compactPanel disabled"}>
            <summary>Zutaten ausschließen</summary>
            {baseSettingsComplete ? (
              <div className="excludedBox exclusionStandaloneBox">
                <div className="excludedHeader">
                  <strong>Ausgeschlossene Zutaten</strong>
                  <small>{excludedIngredientNames.length} aktiv</small>
                </div>

                <div className="excludedInputRow">
                  <input
                    type="text"
                    placeholder="Zutat ausschließen"
                    value={customExcludedIngredient}
                    onChange={(event) => setCustomExcludedIngredient(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCustomExcludedIngredient();
                      }
                    }}
                  />
                  <button type="button" onClick={addCustomExcludedIngredient}>+</button>
                </div>

                {excludedIngredientNames.length > 0 && (
                  <div className="activeExcludedList">
                    {excludedIngredientNames.map((ingredient) => (
                      <button
                        key={ingredient}
                        type="button"
                        onClick={() => setExcludedIngredientNames((current) => current.filter((item) => item !== ingredient))}
                      >
                        {ingredient} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="empty">Wird nach den Grunddaten freigeschaltet.</p>
            )}
          </details>

          <button
            type="button"
            className="calculateButton compactCalculateButton"
            onClick={startCalculation}
            disabled={!baseSettingsComplete || allowedBuildings.length === 0}
          >
            Berechnung starten
          </button>
        </div>

        <div className="buildingsColumn equalBuildingsColumn">
          <section className={baseSettingsComplete ? "panel compactPanel equalBuildingsPanel buildingPanelNoToggle" : "panel compactPanel disabled equalBuildingsPanel buildingPanelNoToggle"}>
            <div className="panelStaticHeader">Produktionsgebäude</div>

            {!baseSettingsComplete ? (
              <p className="empty">Gebäude erscheinen nach den Grunddaten.</p>
            ) : (
              <>
                <div className="buildingActions compactActions">
                  <button type="button" onClick={() => { setUserChangedBuildings(false); setAllowedBuildings(availableBuildingNames); }}>Alle</button>
                  <button type="button" onClick={() => { setUserChangedBuildings(true); setAllowedBuildings([]); }}>Keine</button>
                  <span>{allowedBuildings.length}/{availableBuildings.length} aktiv</span>
                </div>

                <div className="buildingVisualGrid withSlotControls equalBuildingsGrid">
                  {availableBuildings.map((building) => {
                    const isAllowed = allowedBuildings.includes(building.name);
                    const buildingSlots = getBuildingSlots(building.name);

                    return (
                      <div key={building.name} className={isAllowed ? "buildingVisualCard active" : "buildingVisualCard"}>
                        <button type="button" className="buildingVisualButton" onClick={() => toggleBuilding(building.name)}>
                          <BuildingIcon item={building} />
                          <span className="buildingVisualName">{building.name}</span>
                          <span className="buildingVisualMeta">Lv. {building.level}<br />{buildingSlots} Slots</span>
                        </button>

                        <div className="buildingSlotHover">
                          <label>
                            <span>{buildingSlots} Slots</span>
                            <input
                              type="range"
                              min="1"
                              max="10"
                              step="1"
                              value={buildingSlots}
                              onChange={(event) =>
                                setSlotsByBuilding((current) => ({
                                  ...current,
                                  [building.name]: Number(event.target.value)
                                }))
                              }
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      </section>

      {result && (
        <div ref={outputRef}>
          <DashboardInsights result={result} normalized={normalized} calculationSettings={calculationSettings} mode={calculationSettings.mode} />

          <section className="output belowSettings">
            <details open className="panel compactPanel">
              <summary>Produktionsliste</summary>

              {result.productionByBuilding.length ? (
                <div className="visualProductionGrid">
                  {result.productionByBuilding.map((group) => (
                    <div key={group.building} className="visualGroup">
                      <h3>{group.building}</h3>
                      <div className="visualItemGrid">
                        {group.items.map((entry) => (
                          <article
                            key={`${entry.building}-${entry.product.key}-${entry.role}`}
                            className={entry.role === "intermediate" ? "visualItem intermediateItem" : "visualItem"}
                            onMouseEnter={(event) => showIngredientOverlay(event, entry)}
                            onMouseMove={moveIngredientOverlay}
                            onMouseLeave={() => setHoverIngredients(null)}
                          >
                            <ProductIcon item={entry.product} size="large" />
                            <strong>{entry.amount}×</strong>
                            <span>{entry.product.name}</span>
                            <small>Lv. {entry.product.level} · {entry.slotsUsed}/{entry.slots} Slots</small>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">Keine passenden Produkte gefunden.</p>
              )}
            </details>
          </section>
        </div>
      )}
    </>
  );
}
