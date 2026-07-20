"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateProductionPlan, getAvailableBuildings } from "../lib/calculator";
import { normalizeData } from "../lib/normalize";

const fallbackRawData = {
  ok: true,
  syncedAt: null,
  mainDatabase: [],
  recipeDatabase: []
};

const modes = [
  { id: "coins", label: "Coins" },
  { id: "xp", label: "XP" },
  { id: "slots", label: "Slots" }
];

const specialExcludedNames = [
  "Fischfilet",
  "Hummerschwanz",
  "Entenfeder"
];

const specialExcludedBuildings = [
  "Mine",
  "Schmelzofen",
  "Honigschleuder"
];

function formatMinutes(minutes) {
  if (!minutes) return "0 min";

  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);

  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function ProductIcon({ item, size = "normal" }) {
  const className = size === "large" ? "visualIcon large" : "visualIcon";

  if (item?.iconUrl) {
    return <img className={className} src={item.iconUrl} alt="" />;
  }

  const firstLetter = item?.name?.slice(0, 1) || "?";
  return <span className={`${className} fallback`}>{firstLetter}</span>;
}

function BuildingIcon({ item }) {
  if (item?.iconUrl) {
    return <img className="buildingVisualIcon" src={item.iconUrl} alt="" />;
  }

  const firstLetter = item?.name?.slice(0, 1) || "?";
  return <span className="buildingVisualIcon fallback">{firstLetter}</span>;
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

function uniqueByName(items) {
  const map = new Map();

  for (const item of items || []) {
    if (!item?.name) continue;
    map.set(item.name, item);
  }

  return Array.from(map.values()).sort((a, b) => {
    return (a.level || 0) - (b.level || 0) || a.name.localeCompare(b.name);
  });
}

function createIngredientLookup(products) {
  const map = {};

  for (const product of products || []) {
    map[product.key] = product;
  }

  return map;
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

function IngredientFloatingOverlay({ hover }) {
  if (!hover) return null;

  const left = Math.min(Math.max(hover.x, 130), window.innerWidth - 130);
  const top = Math.max(hover.y - 14, 80);

  return (
    <div
      className="floatingIngredientPanel"
      style={{
        left,
        top
      }}
    >
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

export default function Home() {
  const [rawData, setRawData] = useState(fallbackRawData);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [mode, setMode] = useState("");
  const [level, setLevel] = useState(50);
  const [hours, setHours] = useState(8);
  const [globalSlots, setGlobalSlots] = useState(4);

  const [slotsByBuilding, setSlotsByBuilding] = useState({});
  const [intermediateMustBeProduced, setIntermediateMustBeProduced] = useState(false);

  const [excludedIngredientNames, setExcludedIngredientNames] = useState([]);
  const [customExcludedIngredient, setCustomExcludedIngredient] = useState("");

  const [allowedBuildings, setAllowedBuildings] = useState([]);
  const [userChangedBuildings, setUserChangedBuildings] = useState(false);

  const [calculationStarted, setCalculationStarted] = useState(false);
  const [calculationSettings, setCalculationSettings] = useState(null);

  const [hoverIngredients, setHoverIngredients] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch("/api/data", {
          cache: "no-store"
        });

        const json = await response.json();

        if (!json.ok) {
          throw new Error(json.error || "API konnte nicht geladen werden.");
        }

        setRawData(json);
      } catch (error) {
        setLoadError(
          "Demo-Daten aktiv. Echte Notion-Daten werden genutzt, sobald die API bereit ist."
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const normalized = useMemo(() => normalizeData(rawData), [rawData]);

  const ingredientLookup = useMemo(
    () => createIngredientLookup(normalized.products),
    [normalized.products]
  );

  const selectableExcludedProducts = useMemo(() => {
    return uniqueByName(
      normalized.products.filter((product) => {
        const building = normalizeName(product.building);
        const name = normalizeName(product.name);

        return (
          specialExcludedBuildings.some((item) => normalizeName(item) === building) ||
          specialExcludedNames.some((item) => normalizeName(item) === name)
        );
      })
    );
  }, [normalized.products]);

  const baseSettingsComplete =
    Boolean(mode) &&
    level >= 1 &&
    hours >= 1 &&
    globalSlots >= 1;

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
      if (building.name && building.slots) {
        map[building.name] = building.slots;
      }
    }

    for (const product of normalized.products || []) {
      if (product.building && product.buildingSlots) {
        map[product.building] = product.buildingSlots;
      }
    }

    return map;
  }, [normalized.buildings, normalized.products]);

  useEffect(() => {
    if (!baseSettingsComplete) {
      setAllowedBuildings([]);
      setUserChangedBuildings(false);
      return;
    }

    setAllowedBuildings((current) => {
      const stillAvailable = current.filter((name) => availableBuildingNames.includes(name));

      if (!userChangedBuildings) {
        return availableBuildingNames;
      }

      return stillAvailable;
    });

    setSlotsByBuilding((current) => {
      const next = {};

      for (const buildingName of availableBuildingNames) {
        if (current[buildingName] !== undefined) {
          next[buildingName] = current[buildingName];
        }
      }

      return next;
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
      mode: calculationSettings.mode,
      level: calculationSettings.level,
      hours: calculationSettings.hours,
      globalSlots: calculationSettings.globalSlots,
      slotsByBuilding: calculationSettings.slotsByBuilding,
      defaultSlotsByBuilding: calculationSettings.defaultSlotsByBuilding,
      allowedBuildings: calculationSettings.allowedBuildings,
      intermediateMustBeProduced: calculationSettings.intermediateMustBeProduced,
      excludedIngredientNames: calculationSettings.excludedIngredientNames
    });
  }, [
    normalized.products,
    normalized.recipes,
    calculationStarted,
    calculationSettings
  ]);

  function getBuildingSlots(buildingName) {
    return slotsByBuilding[buildingName] ?? defaultSlotsByBuilding[buildingName] ?? globalSlots;
  }

  function toggleBuilding(buildingName) {
    setUserChangedBuildings(true);

    setAllowedBuildings((current) => {
      if (current.includes(buildingName)) {
        return current.filter((name) => name !== buildingName);
      }

      return [...current, buildingName];
    });
  }

  function selectAllBuildings() {
    setUserChangedBuildings(false);
    setAllowedBuildings(availableBuildingNames);
  }

  function clearAllBuildings() {
    setUserChangedBuildings(true);
    setAllowedBuildings([]);
  }

  function updateBuildingSlots(buildingName, value) {
    setSlotsByBuilding((current) => ({
      ...current,
      [buildingName]: Number(value)
    }));
  }

  function resetBuildingSlots(buildingName) {
    setSlotsByBuilding((current) => {
      const next = { ...current };
      delete next[buildingName];
      return next;
    });
  }

  function toggleExcludedIngredient(name) {
    setExcludedIngredientNames((current) => {
      if (current.includes(name)) {
        return current.filter((item) => item !== name);
      }

      return [...current, name];
    });
  }

  function addCustomExcludedIngredient() {
    const value = customExcludedIngredient.trim();
    if (!value) return;

    setExcludedIngredientNames((current) => {
      if (current.some((item) => item.toLowerCase() === value.toLowerCase())) {
        return current;
      }

      return [...current, value];
    });

    setCustomExcludedIngredient("");
  }

  function removeExcludedIngredient(name) {
    setExcludedIngredientNames((current) => current.filter((item) => item !== name));
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
    const ingredients = getEntryIngredients(entry, ingredientLookup);

    setHoverIngredients({
      x: event.clientX,
      y: event.clientY,
      productName: entry.product.name,
      ingredients
    });
  }

  function moveIngredientOverlay(event) {
    setHoverIngredients((current) => {
      if (!current) return current;

      return {
        ...current,
        x: event.clientX,
        y: event.clientY
      };
    });
  }

  return (
    <main className="shell compactShell">
      <IngredientFloatingOverlay hover={hoverIngredients} />

      <section className="hero compactHero">
        <div>
          <p className="eyebrow">Hay Day Calc.</p>
          <h1>Produktionsplan</h1>
          <p className="subtitle">
            Kompakter Rechner für Gebäude, Warteschlangen und Zutaten.
          </p>
        </div>

        <div className="syncBox compactSync">
          <span className={loadError ? "dot warning" : "dot"} />
          <div>
            <strong>
              {isLoading ? "Lade Daten…" : loadError ? "Demo-Modus" : "Live-Daten"}
            </strong>
            <small>
              {loadError ||
                `Datenstand: ${
                  rawData.syncedAt
                    ? new Date(rawData.syncedAt).toLocaleString("de-DE")
                    : "gerade geladen"
                }`}
            </small>
          </div>
        </div>
      </section>

      <section className="settingsGrid compactSettingsGrid equalSettingsGrid">
        <div className="settingsColumn">
          <details open className="panel compactPanel">
            <summary>Grunddaten</summary>

            <div className="modeSegment">
              {modes.map((item) => (
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
              <input
                type="range"
                min="1"
                max="126"
                step="1"
                value={level}
                onChange={(event) => {
                  setLevel(Number(event.target.value));
                  setUserChangedBuildings(false);
                }}
              />
            </label>

            <div className="dualRange">
              <label className="field compactField">
                <span>Zeit: {hours} h</span>
                <input
                  type="range"
                  min="1"
                  max="48"
                  step="1"
                  value={hours}
                  onChange={(event) => setHours(Number(event.target.value))}
                />
              </label>

              <label className="field compactField">
                <span>Fallback-Slots: {globalSlots}</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={globalSlots}
                  onChange={(event) => setGlobalSlots(Number(event.target.value))}
                />
              </label>
            </div>

            {!baseSettingsComplete && (
              <p className="helperText inlineHelper">
                Wähle einen Rechenmodus.
              </p>
            )}
          </details>

          <details
            open={baseSettingsComplete}
            className={baseSettingsComplete ? "panel compactPanel" : "panel compactPanel disabled"}
          >
            <summary>Zusätzliche Einstellungen</summary>

            {!baseSettingsComplete ? (
              <p className="empty">Wird nach den Grunddaten freigeschaltet.</p>
            ) : (
              <>
                <label className="checkbox compactCheckbox singleCheckbox">
                  <input
                    type="checkbox"
                    checked={intermediateMustBeProduced}
                    onChange={(event) => setIntermediateMustBeProduced(event.target.checked)}
                  />
                  Zwischenprodukte müssen hergestellt werden
                </label>

                <div className="excludedBox">
                  <div className="excludedHeader">
                    <strong>Produkte ausschließen</strong>
                    <small>{excludedIngredientNames.length} aktiv</small>
                  </div>

                  <div className="excludedSmartGrid">
                    {selectableExcludedProducts.map((product) => {
                      const active = excludedIngredientNames.includes(product.name);

                      return (
                        <button
                          key={product.key}
                          type="button"
                          className={active ? "excludedSmartChip active" : "excludedSmartChip"}
                          onClick={() => toggleExcludedIngredient(product.name)}
                        >
                          <ProductIcon item={product} />
                          <span>{product.name}</span>
                        </button>
                      );
                    })}
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

                  {excludedIngredientNames.length > 0 && (
                    <div className="activeExcludedList">
                      {excludedIngredientNames.map((ingredient) => (
                        <button
                          key={ingredient}
                          type="button"
                          onClick={() => removeExcludedIngredient(ingredient)}
                          title="Entfernen"
                        >
                          {ingredient} ×
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="calculateButton"
                  onClick={startCalculation}
                  disabled={allowedBuildings.length === 0}
                >
                  Berechnung starten
                </button>

                {allowedBuildings.length === 0 && (
                  <p className="helperText inlineHelper">
                    Wähle mindestens ein Gebäude aus.
                  </p>
                )}
              </>
            )}
          </details>
        </div>

        <div className="buildingsColumn equalBuildingsColumn">
          <section className={baseSettingsComplete ? "panel compactPanel equalBuildingsPanel buildingPanelNoToggle" : "panel compactPanel disabled equalBuildingsPanel buildingPanelNoToggle"}>
            <div className="panelStaticHeader">Produktionsgebäude</div>

            {!baseSettingsComplete ? (
              <p className="empty">Gebäude erscheinen nach den Grunddaten.</p>
            ) : (
              <>
                <div className="buildingActions compactActions">
                  <button type="button" onClick={selectAllBuildings}>
                    Alle
                  </button>
                  <button type="button" onClick={clearAllBuildings}>
                    Keine
                  </button>
                  <span>{allowedBuildings.length}/{availableBuildings.length} aktiv</span>
                </div>

                <div className="buildingVisualGrid withSlotControls equalBuildingsGrid">
                  {availableBuildings.map((building) => {
                    const isAllowed = allowedBuildings.includes(building.name);
                    const buildingSlots = getBuildingSlots(building.name);
                    const hasCustomSlots = slotsByBuilding[building.name] !== undefined;
                    const hasDatabaseSlots = defaultSlotsByBuilding[building.name] !== undefined;

                    return (
                      <div
                        key={building.name}
                        className={isAllowed ? "buildingVisualCard active" : "buildingVisualCard"}
                      >
                        <button
                          type="button"
                          className="buildingVisualButton"
                          onClick={() => toggleBuilding(building.name)}
                          title={`ab Level ${building.level}`}
                        >
                          <BuildingIcon item={building} />
                          <span className="buildingVisualName">{building.name}</span>
                          <span className="buildingVisualMeta">
                            Lv. {building.level}
                            <br />
                            {buildingSlots} Slot{buildingSlots === 1 ? "" : "s"}
                            {hasCustomSlots ? " individuell" : hasDatabaseSlots ? " DB" : " fallback"}
                          </span>
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
                                updateBuildingSlots(building.name, event.target.value)
                              }
                            />
                          </label>

                          {hasCustomSlots && (
                            <button
                              type="button"
                              onClick={() => resetBuildingSlots(building.name)}
                            >
                              Standard
                            </button>
                          )}
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
        <>
          <section className="summaryGrid compactSummary belowSettings">
            <div className="summaryCard">
              <strong>{result.totals.products}</strong>
              Produkte
            </div>
            <div className="summaryCard">
              <strong>{Math.round(result.totals.coins)}</strong>
              Coins
            </div>
            <div className="summaryCard">
              <strong>{Math.round(result.totals.xp)}</strong>
              XP
            </div>
            <div className="summaryCard">
              <strong>{result.totals.buildings}</strong>
              Gebäude
            </div>
          </section>

          <section className="output belowSettings">
            <details className="panel compactPanel">
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
                            className={
                              entry.role === "intermediate"
                                ? "visualItem intermediateItem"
                                : "visualItem"
                            }
                            onMouseEnter={(event) => showIngredientOverlay(event, entry)}
                            onMouseMove={moveIngredientOverlay}
                            onMouseLeave={() => setHoverIngredients(null)}
                          >
                            <ProductIcon item={entry.product} size="large" />
                            <strong>{entry.amount}×</strong>
                            <span>{entry.product.name}</span>
                            <small>
                              {entry.role === "intermediate" ? "Zwischenprodukt · " : ""}
                              Lv. {entry.product.level} · {formatMinutes(entry.effectiveTimeMin)}
                              <br />
                              {entry.slotsUsed}/{entry.slots} Slots ·{" "}
                              {Math.round(entry.totalCoins)} Coins ·{" "}
                              {Math.round(entry.totalXp)} XP
                            </small>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">
                  Keine passenden Produkte gefunden.
                </p>
              )}
            </details>

            <details className="panel compactPanel">
              <summary>Zutatenliste</summary>

              {result.ingredientGroups.length ? (
                <div className="visualProductionGrid">
                  {result.ingredientGroups.map((group) => (
                    <div key={group.title} className="visualGroup">
                      <h3>{group.title}</h3>

                      <div className="visualItemGrid">
                        {group.items.map((item) => (
                          <article key={item.key} className="visualItem ingredientItem">
                            <ProductIcon item={item} size="large" />
                            <strong>{item.amount}×</strong>
                            <span>{item.name}</span>
                            <small>
                              {item.level ? `Lv. ${item.level}` : "ohne Level"}
                              {item.building ? ` · ${item.building}` : ""}
                            </small>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">Keine Zutaten gefunden.</p>
              )}
            </details>

            {result.intermediateProducts.length > 0 && (
              <details className="panel compactPanel">
                <summary>Zwischenprodukte</summary>

                <div className="visualItemGrid standalone">
                  {result.intermediateProducts.map((item) => (
                    <article key={item.key} className="visualItem intermediateItem">
                      <ProductIcon item={item} size="large" />
                      <strong>{item.amount}×</strong>
                      <span>{item.name}</span>
                      <small>{item.building || "Zwischenprodukt"}</small>
                    </article>
                  ))}
                </div>
              </details>
            )}

            {result.warnings.length > 0 && (
              <section className="warnings">
                {result.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </section>
            )}
          </section>
        </>
      )}
    </main>
  );
}
