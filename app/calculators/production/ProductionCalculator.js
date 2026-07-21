"use client";

import DashboardInsights from "../../components/DashboardInsights";
import "../../components/dashboard.css";
import "./production.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { calculateProductionPlan, getAvailableBuildings } from "./productionEngine";
import ProductIcon from "../../components/ProductIcon";
import BuildingIcon from "../../components/BuildingIcon";
import { productionCalculatorConfig } from "./productionConfig";

const oreNames = ["Silbererz", "Golderz", "Platinerz", "Kohle", "Eisenerz"];
const specialExcludedNames = ["Honig", "Bienenwachs", "Fischfilet", "Hummerschwanz", "Entenfeder"];
const specialExcludedBuildings = ["Mine", "Schmelzofen"];

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function createIngredientLookup(products) {
  return Object.fromEntries((products || []).map((product) => [product.key, product]));
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
  const settingsColumnRef = useRef(null);
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
  const [settingsColumnHeight, setSettingsColumnHeight] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [profileName, setProfileName] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");

  const baseSettingsComplete = Boolean(mode) && level >= 1 && hours >= 1 && globalSlots >= 1;

  useEffect(() => {
    try {
      const storedProfiles = JSON.parse(localStorage.getItem("hayDayCalcProfiles") || "[]");
      setProfiles(Array.isArray(storedProfiles) ? storedProfiles : []);
    } catch {
      setProfiles([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("hayDayCalcProfiles", JSON.stringify(profiles));
  }, [profiles]);

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

  const selectableExcludedProducts = useMemo(() => {
    return uniqueByName(
      normalized.products.filter((product) => {
        const building = normalizeName(product.building);
        const name = normalizeName(product.name);

        return (
          specialExcludedBuildings.some((item) => normalizeName(item) === building) ||
          specialExcludedNames.some((item) => normalizeName(item) === name) ||
          oreNames.some((item) => normalizeName(item) === name)
        );
      })
    );
  }, [normalized.products]);

  const excludedProductByName = useMemo(() => {
    const map = new Map();

    for (const product of selectableExcludedProducts) {
      map.set(product.name, product);
    }

    return map;
  }, [selectableExcludedProducts]);

  const excludedGroups = useMemo(() => {
    const productsByBuilding = new Map();

    for (const product of selectableExcludedProducts) {
      const building = product.building || "";

      if (!productsByBuilding.has(building)) {
        productsByBuilding.set(building, []);
      }

      productsByBuilding.get(building).push(product.name);
    }

    const buildingIconByName = new Map(
      (normalized.buildings || []).map((building) => [building.name, building])
    );

    return [
      {
        key: "ores",
        label: "Erze",
        names: oreNames.filter((name) => excludedProductByName.has(name)),
        iconItem: buildingIconByName.get("Mine") || excludedProductByName.get("Silbererz")
      },
      {
        key: "smelter",
        label: "Schmelzofen",
        names: productsByBuilding.get("Schmelzofen") || [],
        iconItem: buildingIconByName.get("Schmelzofen")
      },
      ...specialExcludedNames.map((name) => ({
        key: name,
        label: name,
        names: excludedProductByName.has(name) ? [name] : [],
        iconItem: excludedProductByName.get(name)
      }))
    ].filter((group) => group.names.length);
  }, [excludedProductByName, normalized.buildings, selectableExcludedProducts]);

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

  function updateSettingsColumnHeight() {
    const node = settingsColumnRef.current;
    if (!node) return;

    setSettingsColumnHeight(node.getBoundingClientRect().height);
  }

  function scheduleSettingsColumnHeightUpdate() {
    const updateSoon = () => requestAnimationFrame(updateSettingsColumnHeight);

    updateSoon();
    requestAnimationFrame(updateSoon);
    window.setTimeout(updateSettingsColumnHeight, 80);
    window.setTimeout(updateSettingsColumnHeight, 180);
    window.setTimeout(updateSettingsColumnHeight, 260);
  }

  useLayoutEffect(() => {
    const node = settingsColumnRef.current;
    if (!node) return;

    updateSettingsColumnHeight();

    const observer = new ResizeObserver(updateSettingsColumnHeight);
    observer.observe(node);

    return () => observer.disconnect();
  }, [baseSettingsComplete, excludedIngredientNames.length, profiles.length]);

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

  function toggleExcludedGroup(names) {
    setExcludedIngredientNames((current) => {
      const allActive = names.every((name) => current.includes(name));

      if (allActive) {
        return current.filter((item) => !names.includes(item));
      }

      return Array.from(new Set([...current, ...names]));
    });
  }

  function addCustomExcludedIngredient() {
    const value = customExcludedIngredient.trim();
    if (!value) return;

    setExcludedIngredientNames((current) =>
      current.some((item) => item.toLowerCase() === value.toLowerCase()) ? current : [...current, value]
    );
    setCustomExcludedIngredient("");
  }

  function createProfileSnapshot() {
    return {
      mode,
      level,
      hours,
      globalSlots,
      slotsByBuilding,
      intermediateMustBeProduced,
      excludedIngredientNames,
      allowedBuildings,
      userChangedBuildings
    };
  }

  function saveProfile() {
    const trimmedName = profileName.trim() || `Profil ${profiles.length + 1}`;
    const id = selectedProfileId || crypto.randomUUID();

    const nextProfile = {
      id,
      name: trimmedName,
      updatedAt: new Date().toISOString(),
      settings: createProfileSnapshot()
    };

    setProfiles((current) => {
      const withoutCurrent = current.filter((profile) => profile.id !== id);
      return [...withoutCurrent, nextProfile].sort((a, b) => a.name.localeCompare(b.name));
    });

    setSelectedProfileId(id);
    setProfileName(trimmedName);
  }

  function loadProfile(profileId) {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;

    const settings = profile.settings || {};

    setSelectedProfileId(profile.id);
    setProfileName(profile.name || "");
    setMode(settings.mode || "");
    setLevel(Number(settings.level || 50));
    setHours(Number(settings.hours || 8));
    setGlobalSlots(Number(settings.globalSlots || 4));
    setSlotsByBuilding(settings.slotsByBuilding || {});
    setIntermediateMustBeProduced(Boolean(settings.intermediateMustBeProduced));
    setExcludedIngredientNames(settings.excludedIngredientNames || []);
    setAllowedBuildings(settings.allowedBuildings || []);
    setUserChangedBuildings(Boolean(settings.userChangedBuildings));
  }

  function deleteProfile() {
    if (!selectedProfileId) return;

    setProfiles((current) => current.filter((profile) => profile.id !== selectedProfileId));
    setSelectedProfileId("");
    setProfileName("");
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
        <div className="settingsColumn" ref={settingsColumnRef}>
          <details open className="panel compactPanel" onToggle={scheduleSettingsColumnHeightUpdate}>
            <summary>Profile</summary>

            <div className="profileBox">
              <div className="profileSection">
                <strong>Neues Profil speichern</strong>
                <div className="profileRow">
                  <input
                    type="text"
                    placeholder="Profilname"
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                  />

                  <button type="button" onClick={saveProfile}>
                    Speichern
                  </button>
                </div>
              </div>

              <div className="profileSection">
                <strong>Vorhandenes Profil laden</strong>
                <div className="profileRow">
                  <select
                    value={selectedProfileId}
                    onChange={(event) => {
                      const profile = profiles.find((item) => item.id === event.target.value);
                      setSelectedProfileId(event.target.value);
                      setProfileName(profile?.name || "");
                    }}
                  >
                    <option value="">Profil wählen</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>

                  <button type="button" onClick={() => loadProfile(selectedProfileId)} disabled={!selectedProfileId}>
                    Laden
                  </button>
                </div>
              </div>

              {selectedProfileId && (
                <button type="button" className="profileDeleteButton" onClick={deleteProfile}>
                  Profil löschen
                </button>
              )}
            </div>
          </details>

          <details className="panel compactPanel" onToggle={scheduleSettingsColumnHeightUpdate}>
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
                <input type="range" min="1" max="48" step="1" value={hours} onChange={(event) => setHours(Number(event.target.value))} />
              </label>

              <label className="field compactField">
                <span>Fallback-Slots: {globalSlots}</span>
                <input type="range" min="1" max="10" step="1" value={globalSlots} onChange={(event) => setGlobalSlots(Number(event.target.value))} />
              </label>
            </div>

            {!baseSettingsComplete && <p className="helperText inlineHelper">Wähle einen Rechenmodus.</p>}
          </details>

          <details
            className={baseSettingsComplete ? "panel compactPanel" : "panel compactPanel disabled"}
            onToggle={scheduleSettingsColumnHeightUpdate}
          >
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

          <details
            className={baseSettingsComplete ? "panel compactPanel" : "panel compactPanel disabled"}
            onToggle={scheduleSettingsColumnHeightUpdate}
          >
            <summary>Zutaten ausschließen</summary>
            {baseSettingsComplete ? (
              <div className="excludedBox exclusionStandaloneBox">
                <div className="excludedHeader">
                  <strong>Ausgeschlossene Zutaten</strong>
                  <small>{excludedIngredientNames.length} aktiv</small>
                </div>

                <div className="excludedSmartGrid">
                  {excludedGroups.map((group) => {
                    const active = group.names.every((name) => excludedIngredientNames.includes(name));
                    const representativeProduct = group.iconItem || excludedProductByName.get(group.names[0]);

                    return (
                      <button
                        key={group.key}
                        type="button"
                        className={active ? "excludedSmartChip active" : "excludedSmartChip"}
                        onClick={() => toggleExcludedGroup(group.names)}
                        title={group.names.join(", ")}
                      >
                        <ProductIcon item={representativeProduct} />
                        <span>{group.label}</span>
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
                  <button type="button" onClick={addCustomExcludedIngredient}>+</button>
                </div>

                {excludedIngredientNames.length > 0 && (
                  <div className="activeExcludedList">
                    {excludedIngredientNames.map((ingredient) => (
                      <button key={ingredient} type="button" onClick={() => toggleExcludedIngredient(ingredient)}>
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

          {baseSettingsComplete && allowedBuildings.length === 0 && (
            <p className="helperText inlineHelper">
              Wähle mindestens ein Gebäude aus.
            </p>
          )}
        </div>

        <div className="buildingsColumn equalBuildingsColumn">
          <section
            className={baseSettingsComplete ? "panel compactPanel equalBuildingsPanel buildingPanelNoToggle" : "panel compactPanel disabled equalBuildingsPanel buildingPanelNoToggle"}
            style={
              settingsColumnHeight
                ? {
                    "--settings-column-height": `${settingsColumnHeight}px`,
                    height: settingsColumnHeight
                  }
                : undefined
            }
          >
            <div className="panelStaticHeader">Produktionsgebäude</div>

            {!baseSettingsComplete ? (
              <p className="empty">Gebäude erscheinen nach den Grunddaten.</p>
            ) : (
              <>
                <div className="buildingActions compactActions">
                  <button type="button" onClick={selectAllBuildings}>Alle</button>
                  <button type="button" onClick={clearAllBuildings}>Keine</button>
                  <span>{allowedBuildings.length}/{availableBuildings.length} aktiv</span>
                </div>

                <div className="buildingVisualGrid withSlotControls equalBuildingsGrid">
                  {availableBuildings.map((building) => {
                    const isAllowed = allowedBuildings.includes(building.name);
                    const buildingSlots = getBuildingSlots(building.name);
                    const hasCustomSlots = slotsByBuilding[building.name] !== undefined;
                    const hasDatabaseSlots = defaultSlotsByBuilding[building.name] !== undefined;

                    return (
                      <div key={building.name} className={isAllowed ? "buildingVisualCard active" : "buildingVisualCard"}>
                        <button type="button" className="buildingVisualButton" onClick={() => toggleBuilding(building.name)} title={`ab Level ${building.level}`}>
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
                              onChange={(event) => updateBuildingSlots(building.name, event.target.value)}
                            />
                          </label>

                          {hasCustomSlots && (
                            <button type="button" onClick={() => resetBuildingSlots(building.name)}>
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
