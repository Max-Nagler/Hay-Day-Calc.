"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import DashboardInsights from "./components/DashboardInsights";
import "./components/dashboard.css";
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
  { id: "slots", label: "Slots" }
];

const colorPalettes = [
  { id: "hay", colors: ["#f7f3e8", "#fffaf0", "#46a171", "#2783de", "#d5803b", "#e9c46a"] },
  { id: "mono", colors: ["#f4f4f4", "#ffffff", "#8a8a8a", "#3f3f3f", "#111111", "#ffffff"] },
  { id: "berry", colors: ["#f8d8f1", "#fff0fb", "#bf55bf", "#7b1f73", "#4b124a", "#f2b5d4"] },
  { id: "ocean", colors: ["#d9f4ff", "#eefaff", "#18a0ce", "#0d5b78", "#0a3445", "#54d6c6"] },
  { id: "forest", colors: ["#d8f3d0", "#f1ffed", "#46a171", "#2d7a20", "#163f14", "#b6d957"] },
  { id: "sunset", colors: ["#fff0e3", "#fff8f1", "#ed6d2f", "#c64e12", "#7f2e0b", "#ffd166"] }
];

const paletteById = new Map(colorPalettes.map((palette) => [palette.id, palette]));

const defaultAppearance = {
  theme: "system",
  cardScale: 100,
  textScale: 100,
  iconScale: 100,
  palette: "hay",
  showMeta: true,
  iconsOnly: false
};

function normalizeAppearance(value) {
  return {
    ...defaultAppearance,
    ...value,
    palette: paletteById.has(value.palette) ? value.palette : "hay"
  };
}

function getEffectiveTheme(theme) {
  if (theme !== "system") return theme;

  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function colorMix(color, baseColor, weight = 0.2) {
  const hex = color.replace("#", "");
  const baseHex = baseColor.replace("#", "");
  const value = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
  const baseValue =
    baseHex.length === 3 ? baseHex.split("").map((part) => part + part).join("") : baseHex;

  const colorRgb = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  const baseRgb = [0, 2, 4].map((index) => parseInt(baseValue.slice(index, index + 2), 16));

  const mixed = colorRgb.map((channel, index) =>
    Math.round(channel * weight + baseRgb[index] * (1 - weight))
  );

  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function readStoredAppearance() {
  if (typeof window === "undefined") return defaultAppearance;

  try {
    return normalizeAppearance(JSON.parse(localStorage.getItem("hayDayCalcAppearance") || "{}"));
  } catch {
    return defaultAppearance;
  }
}

function applyAppearance(appearance) {
  if (typeof document === "undefined") return;

  const effectiveTheme = getEffectiveTheme(appearance.theme);

  document.documentElement.dataset.theme = effectiveTheme;
  document.documentElement.dataset.iconsOnly = appearance.iconsOnly ? "true" : "false";
  document.documentElement.dataset.showMeta = appearance.showMeta ? "true" : "false";
  const palette = paletteById.get(appearance.palette) || colorPalettes[0];

  const isDark = effectiveTheme === "dark";
  const canvas = isDark ? colorMix(palette.colors[4], "#090907", 0.42) : palette.colors[0];
  const surface = isDark ? colorMix(palette.colors[4], "#191714", 0.28) : palette.colors[1];
  const surfaceStrong = isDark ? colorMix(palette.colors[3], "#201d19", 0.2) : "#ffffff";
  const surfaceSoft = isDark ? colorMix(palette.colors[3], "#2b2721", 0.18) : "#f9f8f7";
  const border = isDark ? colorMix(palette.colors[2], "#5a4d3d", 0.22) : "#e6e5e3";
  const borderWarm = isDark ? colorMix(palette.colors[4], "#5a4d3d", 0.28) : "#eadcc3";
  const text = isDark ? "#f6efe4" : "#2c2c2b";
  const muted = isDark ? "#b8ad9f" : "#7d7a75";

  document.documentElement.dataset.palette = palette.id;
  document.documentElement.style.setProperty("--canvas", canvas);
  document.documentElement.style.setProperty("--surface", surface);
  document.documentElement.style.setProperty("--surface-strong", surfaceStrong);
  document.documentElement.style.setProperty("--surface-soft", surfaceSoft);
  document.documentElement.style.setProperty("--border", border);
  document.documentElement.style.setProperty("--border-warm", borderWarm);
  document.documentElement.style.setProperty("--text", text);
  document.documentElement.style.setProperty("--muted", muted);
  document.documentElement.style.setProperty("--green", palette.colors[2]);
  document.documentElement.style.setProperty("--blue", palette.colors[3]);
  document.documentElement.style.setProperty("--orange", palette.colors[4]);
  document.documentElement.style.setProperty("--accent-extra", palette.colors[5]);
  document.documentElement.style.setProperty("--green-soft", colorMix(palette.colors[2], surfaceStrong, isDark ? 0.24 : 0.14));
  document.documentElement.style.setProperty("--blue-soft", colorMix(palette.colors[3], surfaceStrong, isDark ? 0.24 : 0.14));
  document.documentElement.style.setProperty("--orange-soft", colorMix(palette.colors[4], surfaceStrong, isDark ? 0.24 : 0.14));
  document.documentElement.style.setProperty("--card-scale", String(appearance.cardScale / 100));
  document.documentElement.style.setProperty("--text-scale", String(appearance.textScale / 100));
  document.documentElement.style.setProperty("--icon-scale", String(appearance.iconScale / 100));
}

const oreNames = ["Silbererz", "Golderz", "Platinerz", "Kohle", "Eisenerz"];

const specialExcludedNames = ["Honig", "Bienenwachs", "Fischfilet", "Hummerschwanz", "Entenfeder"];

const specialExcludedBuildings = ["Mine", "Schmelzofen"];

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
  const outputRef = useRef(null);
  const settingsColumnRef = useRef(null);

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
  const [settingsColumnHeight, setSettingsColumnHeight] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [profileName, setProfileName] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [appearance, setAppearance] = useState(defaultAppearance);

  useEffect(() => {
    const storedAppearance = readStoredAppearance();
    setAppearance(storedAppearance);
    applyAppearance(storedAppearance);

    function syncAppearance() {
      const nextAppearance = readStoredAppearance();
      setAppearance(nextAppearance);
      applyAppearance(nextAppearance);
    }

    function handleStorage(event) {
      if (event.key !== "hayDayCalcAppearance") return;
      syncAppearance();
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener("hayDayCalcAppearanceChange", syncAppearance);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("hayDayCalcAppearanceChange", syncAppearance);
    };
  }, []);

  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);

  useEffect(() => {
    try {
      const storedProfiles = JSON.parse(localStorage.getItem("hayDayCalcProfiles") || "[]");
      if (Array.isArray(storedProfiles)) {
        setProfiles(storedProfiles);
      }
    } catch {
      setProfiles([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("hayDayCalcProfiles", JSON.stringify(profiles));
  }, [profiles]);

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

  function updateSettingsColumnHeight() {
    const node = settingsColumnRef.current;
    if (!node) return;

    setSettingsColumnHeight(node.getBoundingClientRect().height);
  }

  function scheduleSettingsColumnHeightUpdate() {
    requestAnimationFrame(() => {
      requestAnimationFrame(updateSettingsColumnHeight);
    });
  }

  useLayoutEffect(() => {
    const node = settingsColumnRef.current;
    if (!node) return;

    updateSettingsColumnHeight();

    const observer = new ResizeObserver(updateSettingsColumnHeight);
    observer.observe(node);

    return () => observer.disconnect();
  }, [baseSettingsComplete, excludedIngredientNames.length]);

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
  }, [normalized.products, normalized.recipes, calculationStarted, calculationSettings]);

  useEffect(() => {
    if (!result) return;

    requestAnimationFrame(() => {
      outputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }, [result]);

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
            className={baseSettingsComplete ? "panel compactPanel" : "panel compactPanel disabled"}
            onToggle={scheduleSettingsColumnHeightUpdate}
          >
            <summary>Zusatzeinstellungen</summary>

            {!baseSettingsComplete ? (
              <p className="empty">Wird nach den Grunddaten freigeschaltet.</p>
            ) : (
              <label className="checkbox compactCheckbox singleCheckbox">
                <input
                  type="checkbox"
                  checked={intermediateMustBeProduced}
                  onChange={(event) => setIntermediateMustBeProduced(event.target.checked)}
                />
                Zwischenprodukte müssen hergestellt werden
              </label>
            )}
          </details>

          <details
            className={baseSettingsComplete ? "panel compactPanel" : "panel compactPanel disabled"}
            onToggle={scheduleSettingsColumnHeightUpdate}
          >
            <summary>Zutaten ausschließen</summary>

            {!baseSettingsComplete ? (
              <p className="empty">Wird nach den Grunddaten freigeschaltet.</p>
            ) : (
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
            className={
              baseSettingsComplete
                ? "panel compactPanel equalBuildingsPanel buildingPanelNoToggle"
                : "panel compactPanel disabled equalBuildingsPanel buildingPanelNoToggle"
            }
            style={settingsColumnHeight ? { height: settingsColumnHeight } : undefined}
          >
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
                          {!appearance.iconsOnly && (
                            <>
                              <span className="buildingVisualName">{building.name}</span>
                              {appearance.showMeta && (
                                <span className="buildingVisualMeta">
                                  Lv. {building.level}
                                  <br />
                                  {buildingSlots} Slot{buildingSlots === 1 ? "" : "s"}
                                  {hasCustomSlots ? " individuell" : hasDatabaseSlots ? " DB" : " fallback"}
                                </span>
                              )}
                            </>
                          )}
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
        <div ref={outputRef}>
          <DashboardInsights
            result={result}
            normalized={normalized}
            calculationSettings={calculationSettings}
            mode={calculationSettings.mode}
          />

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
                            {!appearance.iconsOnly && (
                              <>
                                <strong>{entry.amount}×</strong>
                                <span>{entry.product.name}</span>
                                {appearance.showMeta && (
                                  <small>
                                    {entry.role === "intermediate" ? "Zwischenprodukt · " : ""}
                                    Lv. {entry.product.level} · {formatMinutes(entry.effectiveTimeMin)}
                                    <br />
                                    {entry.slotsUsed}/{entry.slots} Slots ·{" "}
                                    {Math.round(entry.totalCoins)} Coins
                                  </small>
                                )}
                              </>
                            )}
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
                            {!appearance.iconsOnly && (
                              <>
                                <strong>{item.amount}×</strong>
                                <span>{item.name}</span>
                                {appearance.showMeta && (
                                  <small>
                                    {item.level ? `Lv. ${item.level}` : "ohne Level"}
                                    {item.building ? ` · ${item.building}` : ""}
                                  </small>
                                )}
                              </>
                            )}
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
                      {!appearance.iconsOnly && (
                        <>
                          <strong>{item.amount}×</strong>
                          <span>{item.name}</span>
                          {appearance.showMeta && <small>{item.building || "Zwischenprodukt"}</small>}
                        </>
                      )}
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
        </div>
      )}
    </main>
  );
}
