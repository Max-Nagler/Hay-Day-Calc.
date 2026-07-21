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

function formatDuration(minutes) {
  const totalMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(totalMinutes / 60);
  const restMinutes = totalMinutes % 60;

  if (hours > 0 && restMinutes > 0) return `${hours}h ${restMinutes}min`;
  if (hours > 0) return `${hours}h`;
  return `${restMinutes}min`;
}

function mapItemsFromMap(map, ingredientLookup) {
  return Array.from(map?.entries?.() || [])
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

function getEntryIngredients(entry, ingredientLookup) {
  return mapItemsFromMap(entry.displayIngredientsMap || entry.ingredientsMap, ingredientLookup);
}

function formatList(items, emptyText = "keine") {
  return items?.length ? items.join(", ") : emptyText;
}

function formatEntryItems(map, ingredientLookup) {
  const items = mapItemsFromMap(map, ingredientLookup);
  return items.length ? items.map((item) => `${item.amount}× ${item.name}`).join(", ") : "keine";
}

function mapCompactItemsFromMap(map, ingredientLookup) {
  return Array.from(map?.entries?.() || [])
    .map(([key, amount]) => {
      const product = ingredientLookup[key];

      return {
        name: product?.name || key,
        key,
        amount,
        level: product?.level || 0
      };
    })
    .filter((item) => item.name);
}

function sanitizeOrders(orders = []) {
  return orders.map((order) => ({
    product: order.product,
    role: order.role,
    minutes: order.minutes,
    coins: order.coins,
    intermediates: order.intermediates || []
  }));
}

function sanitizeBuildingComparisons(buildingComparisons = []) {
  return buildingComparisons.map((comparison) => {
    const chosenCombination = comparison.chosenCombination || {};
    const chosenCoins = Number(chosenCombination.totalCoins || 0);
    const topCombinations = (comparison.topCombinations || []).slice(0, 10).map((combo) => {
      const beatsChosen = Boolean(combo.feasible && Number(combo.totalCoins || 0) > chosenCoins);

      return {
        products: combo.products || [],
        totalCoins: combo.totalCoins || 0,
        usedSlots: combo.usedSlots || 0,
        slotCapacity: combo.slotCapacity || 0,
        totalMinutes: combo.totalMinutes || 0,
        capacityMinutes: combo.capacityMinutes || 0,
        coinsPerSlot: combo.coinsPerSlot || 0,
        feasible: Boolean(combo.feasible),
        rejectionReasons: combo.rejectionReasons || [],
        reason: combo.reason || "",
        globalUsage: combo.globalUsage || [],
        beatsChosen
      };
    });
    const betterAlternatives = topCombinations.filter((combo) => combo.beatsChosen);

    return {
      building: comparison.building,
      chosenCombination: {
        totalCoins: chosenCombination.totalCoins || 0,
        usedSlots: chosenCombination.usedSlots || 0,
        slotCapacity: chosenCombination.slotCapacity || 0,
        totalMinutes: chosenCombination.totalMinutes || 0,
        capacityMinutes: chosenCombination.capacityMinutes || 0,
        coinsPerSlot: chosenCombination.coinsPerSlot || 0,
        orders: sanitizeOrders(chosenCombination.orders)
      },
      topCombinations,
      hasBetterFeasibleAlternative: betterAlternatives.length > 0
    };
  });
}

function buildCompactDebugJson({ result, calculationSettings, ingredientLookup }) {
  const buildingComparisons = sanitizeBuildingComparisons(result.optimizationDebug?.buildingComparisons || []);
  const betterFeasibleAlternatives = buildingComparisons
    .filter((comparison) => comparison.hasBetterFeasibleAlternative)
    .map((comparison) => {
      const chosenCoins = Number(comparison.chosenCombination?.totalCoins || 0);
      const bestAlternative = [...(comparison.topCombinations || [])]
        .filter((combo) => combo.beatsChosen)
        .sort((a, b) => Number(b.totalCoins || 0) - Number(a.totalCoins || 0))[0];

      return {
        building: comparison.building,
        chosenCoins,
        bestAlternativeCoins: Number(bestAlternative?.totalCoins || 0),
        delta: Number(bestAlternative?.totalCoins || 0) - chosenCoins,
        products: bestAlternative?.products || []
      };
    });

  return {
    settings: {
      mode: calculationSettings?.mode,
      level: calculationSettings?.level,
      hours: calculationSettings?.hours,
      globalSlots: calculationSettings?.globalSlots,
      slotsByBuilding: calculationSettings?.slotsByBuilding || {},
      allowedBuildings: calculationSettings?.allowedBuildings || [],
      intermediateMustBeProduced: Boolean(calculationSettings?.intermediateMustBeProduced),
      excludedIngredientNames: calculationSettings?.excludedIngredientNames || []
    },
    totals: {
      coins: result.totals?.coins || 0,
      xp: result.totals?.xp || 0,
      products: result.totals?.products || 0,
      buildings: result.totals?.buildings || 0,
      effectiveTimeMin: result.totals?.effectiveTimeMin || 0
    },
    productionPlan: (result.productionPlan || []).map((entry) => ({
      building: entry.building,
      product: entry.product?.name,
      amount: entry.amount,
      role: entry.role,
      ownTimeMin: entry.ownTimeMin,
      totalCoins: entry.totalCoins,
      totalXp: entry.totalXp,
      slotsUsed: entry.slotsUsed,
      slots: entry.slots,
      ingredients: mapCompactItemsFromMap(entry.displayIngredientsMap || entry.ingredientsMap, ingredientLookup),
      intermediates: mapCompactItemsFromMap(entry.intermediateMap, ingredientLookup)
    })),
    optimizationDebug: {
      chosen: result.optimizationDebug?.chosen || [],
      rejected: result.optimizationDebug?.rejected || [],
      topCandidates: result.optimizationDebug?.topCandidates || [],
      buildingUsage: result.optimizationDebug?.buildingUsage || [],
      buildingComparisons
    },
    buildingComparisons,
    summary: {
      betterFeasibleAlternatives
    }
  };
}

function buildDebugMarkdown({ result, calculationSettings, ingredientLookup }) {
  const debug = result.optimizationDebug || {};
  const endProducts = result.productionPlan.filter((entry) => entry.role !== "intermediate");
  const intermediateProducts = result.productionPlan.filter((entry) => entry.role === "intermediate");
  const lines = [];

  lines.push("# Hay-Day-Calc Debug Export");
  lines.push("");
  lines.push("## Einstellungen");
  lines.push(`- Modus: ${result.mode || calculationSettings?.mode || "unbekannt"}`);
  lines.push(`- Level: ${result.level}`);
  lines.push(`- Zeitlimit: ${formatDuration((result.hours || calculationSettings?.hours || 0) * 60)}`);
  lines.push(`- Fallback-Slots: ${calculationSettings?.globalSlots ?? result.settings?.globalSlots ?? "unbekannt"}`);
  lines.push(`- Zwischenprodukte müssen hergestellt werden: ${calculationSettings?.intermediateMustBeProduced ? "ja" : "nein"}`);
  lines.push(`- Aktive Gebäude: ${formatList(calculationSettings?.allowedBuildings || [])}`);
  lines.push(`- Ausgeschlossene Zutaten: ${formatList(calculationSettings?.excludedIngredientNames || [])}`);
  lines.push("");

  lines.push("## Gesamtergebnis");
  lines.push(`- Gesamt-Coins: ${Math.round(result.totals?.coins || 0)}`);
  lines.push(`- Gesamt-XP: ${Math.round(result.totals?.xp || 0)}`);
  lines.push(`- Anzahl Endprodukte: ${endProducts.reduce((sum, entry) => sum + entry.amount, 0)}`);
  lines.push(`- Anzahl Zwischenprodukte: ${intermediateProducts.reduce((sum, entry) => sum + entry.amount, 0)}`);
  lines.push(`- Genutzte Gebäude: ${result.totals?.buildings || 0}`);
  lines.push(`- Warnungen: ${formatList(result.warnings || [])}`);
  lines.push("");

  lines.push("## Produktionsliste");
  for (const entry of result.productionPlan || []) {
    lines.push(`### ${entry.amount}× ${entry.product.name}`);
    lines.push(`- Gebäude: ${entry.building}`);
    lines.push(`- Rolle: ${entry.role === "intermediate" ? "Zwischenprodukt" : "Endprodukt"}`);
    lines.push(`- Produktionszeit: ${formatDuration(entry.ownTimeMin)}`);
    lines.push(`- Coins: ${Math.round(entry.totalCoins || 0)}`);
    lines.push(`- XP: ${Math.round(entry.totalXp || 0)}`);
    lines.push(`- Slots: ${entry.slotsUsed}/${entry.slots}`);
    lines.push(`- Zutaten: ${formatEntryItems(entry.displayIngredientsMap || entry.ingredientsMap, ingredientLookup)}`);
    lines.push(`- Zwischenprodukte: ${formatEntryItems(entry.intermediateMap, ingredientLookup)}`);
    lines.push("");
  }

  lines.push("## Debug: Gewählte Produkte");
  for (const item of debug.chosen || []) {
    lines.push(`- ${item.amount}× ${item.product}: ${item.reason}`);
  }
  if (!debug.chosen?.length) lines.push("- keine");
  lines.push("");

  lines.push("## Debug: Top-Kandidaten");
  for (const item of debug.topCandidates || []) {
    lines.push(`- ${item.product}: ${Math.round(item.score || 0)} Wert, Effizienz ${Number(item.efficiency || 0).toFixed(2)}, Engpass ${formatDuration(item.bottleneckMinutes || 0)}`);
    lines.push(`  - Gesamt-Kapazität: ${formatDuration(item.totalCapacityMinutes || 0)}`);
    lines.push(`  - Zwischenprodukt-Kapazität: ${formatDuration(item.intermediateCapacityMinutes || 0)}`);
    lines.push(`  - Zwischenprodukte: ${formatList(item.intermediates || [])}`);
    if (item.capacityMinutesByBuilding) {
      lines.push(`  - Gebäude-Minuten: ${Object.entries(item.capacityMinutesByBuilding).map(([building, minutes]) => `${building}: ${formatDuration(minutes)}`).join(", ")}`);
    }
  }
  if (!debug.topCandidates?.length) lines.push("- keine");
  lines.push("");

  lines.push("## Debug: Verworfen / Engpässe");
  for (const item of debug.rejected || []) {
    lines.push(`- ${item.product}: ${item.reason}`);
  }
  if (!debug.rejected?.length) lines.push("- keine");
  lines.push("");

  lines.push("## Debug pro Gebäude");
  for (const usage of debug.buildingUsage || []) {
    lines.push(`### ${usage.building}`);
    lines.push(`- Verfügbare Slots: ${usage.slotCapacity}`);
    lines.push(`- Genutzte Slots: ${usage.slots}`);
    lines.push(`- Zeitlimit: ${formatDuration(usage.capacityMinutes)}`);
    lines.push(`- Genutzte Kapazität: ${formatDuration(usage.minutes)}`);
    lines.push(`- Restkapazität: ${formatDuration(Math.max((usage.capacityMinutes || 0) - (usage.minutes || 0), 0))}`);
    lines.push("");
  }
  if (!debug.buildingUsage?.length) lines.push("- keine");
  lines.push("");

  lines.push("## Optimierungsvergleiche / Slot-Kombinationen");
  for (const comparison of debug.buildingComparisons || []) {
    lines.push(`### ${comparison.building}`);
    lines.push(`- Grund: ${comparison.reason}`);
    lines.push("- Gewählte Kombination:");
    const chosen = comparison.chosenCombination || {};
    lines.push(`  - Gesamt-Coins: ${Math.round(chosen.totalCoins || 0)}`);
    lines.push(`  - Coins/Slot: ${Number(chosen.coinsPerSlot || 0).toFixed(1)}`);
    lines.push(`  - Slots: ${chosen.usedSlots || 0}/${chosen.slotCapacity || 0}`);
    lines.push(`  - Zeit: ${formatDuration(chosen.totalMinutes || 0)} / ${formatDuration(chosen.capacityMinutes || 0)}`);
    for (const [index, order] of (chosen.orders || []).entries()) {
      lines.push(`  - Slot ${index + 1}: ${order.product} (${order.role}, ${formatDuration(order.minutes)}, ${order.coins} Coins)`);
      lines.push(`    - Zwischenprodukte: ${formatList(order.intermediates || [])}`);
    }

    lines.push("- Top-10 Alternativ-Kombinationen:");
    for (const [index, combo] of (comparison.topCombinations || []).entries()) {
      lines.push(`  ${index + 1}. ${combo.products.join(" + ")}`);
      lines.push(`     - Gesamt-Coins: ${Math.round(combo.totalCoins || 0)}`);
      lines.push(`     - Coins/Slot: ${Number(combo.coinsPerSlot || 0).toFixed(1)}`);
      lines.push(`     - Slots: ${combo.usedSlots}/${combo.slotCapacity}`);
      lines.push(`     - Zeit: ${formatDuration(combo.totalMinutes)} / ${formatDuration(combo.capacityMinutes)}`);
      lines.push(`     - Grund: ${combo.reason}`);
      lines.push(`     - Slot-Aufträge: ${(combo.orders || []).map((order) => `${order.product} (${order.role}, ${formatDuration(order.minutes)}, ${order.coins} Coins)`).join(" | ")}`);
    }
    lines.push("");
  }
  if (!debug.buildingComparisons?.length) lines.push("- keine");

  return lines.join("\n");
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
  const [isCalculating, setIsCalculating] = useState(false);
  const [hoverIngredients, setHoverIngredients] = useState(null);
  const [settingsColumnHeight, setSettingsColumnHeight] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [profileName, setProfileName] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [debugCopyStatus, setDebugCopyStatus] = useState("");

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

    setIsCalculating(false);
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
    if (!baseSettingsComplete || allowedBuildings.length === 0 || isCalculating) return;

    setIsCalculating(true);
    setCalculationStarted(false);
    setCalculationSettings(null);

    window.setTimeout(() => {
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
    }, 30);
  }

  function showIngredientOverlay(event, entry) {
    setHoverIngredients({
      x: event.clientX,
      y: event.clientY,
      productName: entry.product.name,
      ingredients: getEntryIngredients(entry, ingredientLookup)
    });
  }

  async function copyTextToClipboard(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      setDebugCopyStatus(successMessage);
      window.setTimeout(() => setDebugCopyStatus(""), 1800);
    } catch {
      setDebugCopyStatus("Kopieren fehlgeschlagen");
      window.setTimeout(() => setDebugCopyStatus(""), 2200);
    }
  }

  function copyDebugMarkdown() {
    if (!result?.optimizationDebug) return;

    copyTextToClipboard(
      buildDebugMarkdown({ result, calculationSettings, ingredientLookup }),
      "Debug kopiert"
    );
  }

  function copyDebugJson() {
    if (!result?.optimizationDebug) return;

    copyTextToClipboard(
      JSON.stringify(
        buildCompactDebugJson({ result, calculationSettings, ingredientLookup }),
        null,
        2
      ),
      "Debug JSON kopiert"
    );
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

          {isCalculating && (
            <div className="calculationLoadingDots" aria-live="polite" aria-label="Berechnung läuft">
              <span />
              <span />
              <span />
            </div>
          )}

          <button
            type="button"
            className="calculateButton compactCalculateButton"
            onClick={startCalculation}
            disabled={!baseSettingsComplete || allowedBuildings.length === 0 || isCalculating}
          >
            {isCalculating ? "Berechnung läuft" : "Berechnung starten"}
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
                    "--settings-column-height": `${settingsColumnHeight}px`
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
                            <small>
                              {entry.role === "intermediate" ? "Zwischenprodukt" : "Endprodukt"}
                              <br />
                              {formatDuration(entry.ownTimeMin)} · {entry.slotsUsed}/{entry.slots} Slots · {entry.totalCoins} Coins
                            </small>
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

            <details className="panel compactPanel">
              <summary>Optimierungs-Debug</summary>

              {result.optimizationDebug && (
                <div className="debugExportBar">
                  <button type="button" onClick={copyDebugMarkdown}>
                    Debug kopieren
                  </button>
                  <button type="button" onClick={copyDebugJson}>
                    Debug JSON kopieren
                  </button>
                  {debugCopyStatus && <span>{debugCopyStatus}</span>}
                </div>
              )}

              <div className="optimizationDebugGrid">
                <section>
                  <h3>Gewählt</h3>
                  {(result.optimizationDebug?.chosen || []).length ? (
                    result.optimizationDebug.chosen.map((item) => (
                      <p key={item.product}>
                        <strong>{item.amount}× {item.product}</strong>
                        <span>{item.reason}</span>
                      </p>
                    ))
                  ) : (
                    <p className="empty">Keine gewählten Produkte.</p>
                  )}
                </section>

                <section>
                  <h3>Top-Kandidaten</h3>
                  {(result.optimizationDebug?.topCandidates || []).slice(0, 12).map((item) => (
                    <p key={item.product}>
                      <strong>{item.product}</strong>
                      <span>{Math.round(item.score)} Wert · Effizienz {Number(item.efficiency || 0).toFixed(2)}</span>
                    </p>
                  ))}
                </section>

                <section>
                  <h3>Verworfen / Engpässe</h3>
                  {(result.optimizationDebug?.rejected || []).slice(0, 16).map((item, index) => (
                    <p key={`${item.product}-${index}`}>
                      <strong>{item.product}</strong>
                      <span>{item.reason}</span>
                    </p>
                  ))}
                </section>

                <section>
                  <h3>Gebäude-Auslastung</h3>
                  {(result.optimizationDebug?.buildingUsage || []).map((item) => (
                    <p key={item.building}>
                      <strong>{item.building}</strong>
                      <span>
                        {formatDuration(item.minutes)}/{formatDuration(item.capacityMinutes)} · {item.slots}/{item.slotCapacity} Slots
                      </span>
                    </p>
                  ))}
                </section>

                {(result.optimizationDebug?.buildingComparisons || []).map((comparison) => (
                  <section key={comparison.building} className="buildingComparisonDebug">
                    <h3>{comparison.building}-Slot-Kombinationen</h3>
                    <p>
                      <strong>Gewählte Lösung</strong>
                      <span>
                        {Math.round(comparison.chosenCombination?.totalCoins || 0)} Coins · {Number(comparison.chosenCombination?.coinsPerSlot || 0).toFixed(1)} Coins/Slot
                      </span>
                      <span>
                        {comparison.chosenCombination?.usedSlots || 0}/{comparison.chosenCombination?.slotCapacity || 0} Slots · {formatDuration(comparison.chosenCombination?.totalMinutes || 0)} / {formatDuration(comparison.chosenCombination?.capacityMinutes || 0)}
                      </span>
                      <span>{comparison.reason}</span>
                    </p>

                    {(comparison.chosenCombination?.orders || []).map((order, index) => (
                      <p key={`chosen-order-${comparison.building}-${index}`}>
                        <strong>Slot {index + 1}: {order.product}</strong>
                        <span>{order.role} · {formatDuration(order.minutes)} · {order.coins} Coins</span>
                        <span>Zwischenprodukte: {order.intermediates?.length ? order.intermediates.join(", ") : "keine"}</span>
                      </p>
                    ))}

                    <h3>Top-10 Kombinationen</h3>
                    {(comparison.topCombinations || []).map((combo, index) => (
                      <p key={`combo-${comparison.building}-${index}`}>
                        <strong>{combo.products.join(" + ")}</strong>
                        <span>
                          {Math.round(combo.totalCoins)} Coins · {Number(combo.coinsPerSlot || 0).toFixed(1)} Coins/Slot · {combo.usedSlots}/{combo.slotCapacity} Slots
                        </span>
                        <span>{formatDuration(combo.totalMinutes)} / {formatDuration(combo.capacityMinutes)} · {combo.reason}</span>
                        <span>
                          Slots: {combo.orders.map((order) => `${order.product} (${formatDuration(order.minutes)}, ${order.role})`).join(" | ")}
                        </span>
                      </p>
                    ))}
                  </section>
                ))}
              </div>
            </details>
          </section>
        </div>
      )}
    </>
  );
}
