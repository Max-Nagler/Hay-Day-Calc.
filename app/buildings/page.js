"use client";

import { useEffect, useMemo, useState } from "react";
import { getAvailableBuildings } from "../../lib/calculator";
import { normalizeData } from "../../lib/normalize";
import { useCalculatorState } from "../../lib/useCalculatorState";

const fallbackRawData = {
  ok: true,
  syncedAt: null,
  mainDatabase: [],
  recipeDatabase: []
};

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

export default function BuildingsEmbed() {
  const { state, updateState } = useCalculatorState();

  const [rawData, setRawData] = useState(fallbackRawData);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

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
        setLoadError("Daten konnten nicht geladen werden.");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const normalized = useMemo(() => normalizeData(rawData), [rawData]);

  const availableBuildingsFromProducts = useMemo(
    () => getAvailableBuildings(normalized.products, state.level || 0),
    [normalized.products, state.level]
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
    if (!state.mode) return;

    updateState((current) => {
      const stillAvailable = current.allowedBuildings.filter((name) =>
        availableBuildingNames.includes(name)
      );

      return {
        ...current,
        allowedBuildings: current.userChangedBuildings ? stillAvailable : availableBuildingNames
      };
    });
  }, [availableBuildingNames.join("|")]);

  function getBuildingSlots(buildingName) {
    return state.slotsByBuilding[buildingName] ?? defaultSlotsByBuilding[buildingName] ?? state.globalSlots;
  }

  function toggleBuilding(buildingName) {
    updateState((current) => {
      const isSelected = current.allowedBuildings.includes(buildingName);

      return {
        ...current,
        userChangedBuildings: true,
        allowedBuildings: isSelected
          ? current.allowedBuildings.filter((name) => name !== buildingName)
          : [...current.allowedBuildings, buildingName],
        calculationRequestedAt: null
      };
    });
  }

  function selectAllBuildings() {
    updateState({
      userChangedBuildings: false,
      allowedBuildings: availableBuildingNames,
      calculationRequestedAt: null
    });
  }

  function clearAllBuildings() {
    updateState({
      userChangedBuildings: true,
      allowedBuildings: [],
      calculationRequestedAt: null
    });
  }

  function updateBuildingSlots(buildingName, value) {
    updateState((current) => ({
      ...current,
      slotsByBuilding: {
        ...current.slotsByBuilding,
        [buildingName]: Number(value)
      },
      calculationRequestedAt: null
    }));
  }

  function resetBuildingSlots(buildingName) {
    updateState((current) => {
      const nextSlots = { ...current.slotsByBuilding };
      delete nextSlots[buildingName];

      return {
        ...current,
        slotsByBuilding: nextSlots,
        calculationRequestedAt: null
      };
    });
  }

  return (
    <main className="embedShell">
      <section className="embedHeader">
        <div>
          <p className="eyebrow">Hay Day Calc.</p>
          <h1>Produktionsgebäude</h1>
        </div>

        <div className="miniStatus">
          {isLoading ? "Lädt…" : loadError || `${state.allowedBuildings.length}/${availableBuildings.length} aktiv`}
        </div>
      </section>

      <section className="panel compactPanel">
        <div className="buildingActions compactActions">
          <button type="button" onClick={selectAllBuildings}>
            Alle
          </button>
          <button type="button" onClick={clearAllBuildings}>
            Keine
          </button>
          <span>{state.allowedBuildings.length}/{availableBuildings.length} aktiv</span>
        </div>

        {!state.mode ? (
          <p className="empty">Wähle zuerst in den Grundeinstellungen einen Rechenmodus.</p>
        ) : (
          <div className="buildingVisualGrid withSlotControls">
            {availableBuildings.map((building) => {
              const isAllowed = state.allowedBuildings.includes(building.name);
              const buildingSlots = getBuildingSlots(building.name);
              const hasCustomSlots = state.slotsByBuilding[building.name] !== undefined;
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
                      <button type="button" onClick={() => resetBuildingSlots(building.name)}>
                        Standard
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
