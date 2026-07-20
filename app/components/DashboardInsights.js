"use client";

import { useMemo, useState } from "react";
import { calculateProductionPlan } from "../../lib/calculator";

const dashboardPages = [
  { id: "overview", label: "Übersicht" },
  { id: "comparisons", label: "Vergleiche" },
  { id: "charts", label: "Diagramme" }
];

const hourOptions = [1, 2, 4];

const defaultSlotCosts = {
  3: 6,
  4: 9,
  5: 12,
  6: 15,
  7: 18,
  8: 21,
  9: 24
};

const fishingSlotCosts = {
  3: 10,
  4: 20,
  5: 45,
  6: 90,
  7: 130,
  8: 260,
  9: 415
};

const fishingBuildingNames = [
  "Angelplatz",
  "Fischernetzmacher",
  "Hummerbecken",
  "Entensalon"
];

function formatNumber(value) {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 0
  }).format(Math.round(Number(value || 0)));
}

function formatDecimal(value, digits = 1) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number(value || 0));
}

function formatPercent(value) {
  const number = Number(value || 0);
  const sign = number > 0 ? "+" : "";
  return `${sign}${formatDecimal(number, 1)}%`;
}

function getDelta(nextValue, currentValue) {
  const current = Number(currentValue || 0);
  const next = Number(nextValue || 0);
  const delta = next - current;
  const percent = current > 0 ? (delta / current) * 100 : 0;

  return {
    delta,
    percent
  };
}

function getBuildingSlots(buildingName, settings) {
  return (
    settings?.slotsByBuilding?.[buildingName] ??
    settings?.defaultSlotsByBuilding?.[buildingName] ??
    settings?.globalSlots ??
    1
  );
}

function getSlotCost(buildingName, nextSlot) {
  const isFishingBuilding = fishingBuildingNames.some((name) =>
    buildingName.toLowerCase().includes(name.toLowerCase())
  );

  const costMap = isFishingBuilding ? fishingSlotCosts : defaultSlotCosts;
  return costMap[nextSlot] || null;
}

function calculateSlotHours(result) {
  return (result?.productionByBuilding || []).reduce((total, group) => {
    return (
      total +
      group.items.reduce((groupTotal, entry) => {
        const slotsUsed = Number(entry.slotsUsed || 1);
        const timeHours = Number(entry.effectiveTimeMin || 0) / 60;
        return groupTotal + slotsUsed * timeHours;
      }, 0)
    );
  }, 0);
}

function calculateEfficiency(result, mode) {
  const slotHours = calculateSlotHours(result);
  if (!slotHours) return 0;

  if (mode === "xp") return Number(result?.totals?.xp || 0) / slotHours;
  return Number(result?.totals?.coins || 0) / slotHours;
}

function simulatePlan(settings, overrides = {}) {
  if (!settings) return null;

  return calculateProductionPlan({
    products: settings.products,
    recipes: settings.recipes,
    mode: settings.mode,
    level: settings.level,
    hours: settings.hours,
    globalSlots: settings.globalSlots,
    slotsByBuilding: settings.slotsByBuilding,
    defaultSlotsByBuilding: settings.defaultSlotsByBuilding,
    allowedBuildings: settings.allowedBuildings,
    intermediateMustBeProduced: settings.intermediateMustBeProduced,
    excludedIngredientNames: settings.excludedIngredientNames,
    ...overrides
  });
}

function buildSimulationSettings({ normalized, calculationSettings }) {
  if (!normalized || !calculationSettings) return null;

  return {
    ...calculationSettings,
    products: normalized.products,
    recipes: normalized.recipes
  };
}

function buildHourComparison(result, settings, hoursToAdd) {
  if (!result || !settings) return null;

  const simulated = simulatePlan(settings, {
    hours: Number(settings.hours || 0) + hoursToAdd
  });

  if (!simulated) return null;

  return {
    hoursToAdd,
    products: getDelta(simulated.totals.products, result.totals.products),
    coins: getDelta(simulated.totals.coins, result.totals.coins),
    xp: getDelta(simulated.totals.xp, result.totals.xp)
  };
}

function buildBestSlotRecommendation(result, settings) {
  if (!result || !settings || !["coins", "xp"].includes(settings.mode)) return null;

  const candidates = (settings.allowedBuildings || [])
    .map((buildingName) => {
      const currentSlots = Number(getBuildingSlots(buildingName, settings));
      const nextSlot = currentSlots + 1;
      const cost = getSlotCost(buildingName, nextSlot);

      if (!cost) return null;

      const simulated = simulatePlan(settings, {
        slotsByBuilding: {
          ...(settings.slotsByBuilding || {}),
          [buildingName]: nextSlot
        }
      });

      if (!simulated) return null;

      const metric =
        settings.mode === "xp"
          ? Number(simulated.totals.xp || 0) - Number(result.totals.xp || 0)
          : Number(simulated.totals.coins || 0) - Number(result.totals.coins || 0);

      const score = metric / cost;

      return {
        buildingName,
        currentSlots,
        nextSlot,
        cost,
        metric,
        score,
        productsDelta:
          Number(simulated.totals.products || 0) - Number(result.totals.products || 0)
      };
    })
    .filter(Boolean)
    .filter((item) => item.metric > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0] || null;
}

function buildBuildingUtilization(result) {
  return (result?.productionByBuilding || [])
    .map((group) => {
      const usedSlots = group.items.reduce((total, entry) => {
        return total + Number(entry.slotsUsed || 0);
      }, 0);

      const availableSlots = Math.max(
        ...group.items.map((entry) => Number(entry.slots || 0)),
        usedSlots,
        1
      );

      const percent = Math.min(100, (usedSlots / availableSlots) * 100);

      return {
        building: group.building,
        usedSlots,
        availableSlots,
        percent
      };
    })
    .sort((a, b) => b.percent - a.percent);
}

function buildProgressCurve(result, totalHours) {
  const entries = (result?.productionByBuilding || []).flatMap((group) => group.items || []);
  const totalProducts = entries.reduce((total, entry) => total + Number(entry.amount || 0), 0);

  if (!entries.length || !totalProducts || !totalHours) {
    return [];
  }

  return Array.from({ length: Math.ceil(totalHours) + 1 }, (_, hour) => {
    const finishedProducts = entries.reduce((total, entry) => {
      const productTimeHours = Number(entry.effectiveTimeMin || 0) / 60;
      const slots = Math.max(1, Number(entry.slotsUsed || entry.slots || 1));
      const productsPerHour = productTimeHours > 0 ? slots / productTimeHours : 0;
      const finished = Math.min(Number(entry.amount || 0), Math.floor(productsPerHour * hour));

      return total + finished;
    }, 0);

    return {
      hour,
      percent: Math.min(100, (finishedProducts / totalProducts) * 100)
    };
  });
}

function KpiCard({ label, value, helper }) {
  return (
    <article className="dashboardKpiCard">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper && <small>{helper}</small>}
    </article>
  );
}

function DeltaCard({ label, delta }) {
  return (
    <article className="dashboardDeltaCard">
      <span>{label}</span>
      <strong>
        {delta.delta >= 0 ? "+" : ""}
        {formatNumber(delta.delta)}
      </strong>
      <small>{formatPercent(delta.percent)} gegenüber aktuell</small>
      <div className="dashboardMiniBar">
        <span style={{ width: `${Math.min(100, Math.abs(delta.percent) * 4)}%` }} />
      </div>
    </article>
  );
}

function ProgressChart({ points }) {
  if (!points.length) {
    return <p className="dashboardEmpty">Noch keine Diagrammdaten.</p>;
  }

  const width = 520;
  const height = 160;
  const maxHour = Math.max(...points.map((point) => point.hour), 1);

  const path = points
    .map((point, index) => {
      const x = (point.hour / maxHour) * width;
      const y = height - (point.percent / 100) * height;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className="dashboardChartBox">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Produktionsfortschritt">
        <path className="dashboardChartGrid" d={`M 0 ${height} H ${width}`} />
        <path className="dashboardChartLine" d={path} />
        {points.map((point) => {
          const x = (point.hour / maxHour) * width;
          const y = height - (point.percent / 100) * height;

          return <circle key={point.hour} cx={x} cy={y} r="4" />;
        })}
      </svg>
      <div className="dashboardChartLegend">
        <span>0 h</span>
        <span>{maxHour} h</span>
      </div>
    </div>
  );
}

export default function DashboardInsights({
  result,
  normalized,
  calculationSettings,
  mode
}) {
  const [activePage, setActivePage] = useState("overview");
  const [activeHourDelta, setActiveHourDelta] = useState(1);

  const settings = useMemo(
    () => buildSimulationSettings({ normalized, calculationSettings }),
    [normalized, calculationSettings]
  );

  const efficiency = useMemo(() => calculateEfficiency(result, mode), [result, mode]);

  const hourComparisons = useMemo(() => {
    return Object.fromEntries(
      hourOptions.map((hoursToAdd) => [
        hoursToAdd,
        buildHourComparison(result, settings, hoursToAdd)
      ])
    );
  }, [result, settings]);

  const slotRecommendation = useMemo(
    () => buildBestSlotRecommendation(result, settings),
    [result, settings]
  );

  const utilization = useMemo(() => buildBuildingUtilization(result), [result]);

  const progressCurve = useMemo(
    () => buildProgressCurve(result, calculationSettings?.hours || 0),
    [result, calculationSettings?.hours]
  );

  if (!result || !calculationSettings) return null;

  const activeComparison = hourComparisons[activeHourDelta];
  const efficiencyLabel = mode === "xp" ? "XP/Slot-h" : "Coins/Slot-h";
  const recommendationUnit = mode === "xp" ? "XP/Diamant" : "Coins/Diamant";

  return (
    <section className="dashboardPanel panel compactPanel">
      <div className="dashboardHeader">
        <div>
          <span className="dashboardEyebrow">Analyse</span>
          <h2>Dashboard</h2>
        </div>

        <div className="dashboardTabs">
          {dashboardPages.map((page) => (
            <button
              key={page.id}
              type="button"
              className={activePage === page.id ? "active" : ""}
              onClick={() => setActivePage(page.id)}
            >
              {page.label}
            </button>
          ))}
        </div>
      </div>

      {activePage === "overview" && (
        <div className="dashboardPage">
          <div className="dashboardKpiGrid">
            <KpiCard label="Produkte" value={formatNumber(result.totals.products)} />
            <KpiCard label="Coins" value={formatNumber(result.totals.coins)} />
            <KpiCard label="XP" value={formatNumber(result.totals.xp)} />
            <KpiCard
              label={efficiencyLabel}
              value={formatDecimal(efficiency, 1)}
              helper="Effizienz pro Slot-Stunde"
            />
          </div>

          <article className="slotRecommendationCard">
            <span className="dashboardEyebrow">Slot-Empfehlung</span>
            {slotRecommendation ? (
              <>
                <strong>{slotRecommendation.buildingName}</strong>
                <p>
                  +1 Slot ({slotRecommendation.currentSlots} → {slotRecommendation.nextSlot}) für{" "}
                  {slotRecommendation.cost} Diamanten
                </p>
                <div className="slotRecommendationStats">
                  <span>
                    {formatDecimal(slotRecommendation.score, 1)} {recommendationUnit}
                  </span>
                  <span>
                    +{formatNumber(slotRecommendation.metric)}{" "}
                    {mode === "xp" ? "XP" : "Coins"}
                  </span>
                  <span>+{formatNumber(slotRecommendation.productsDelta)} Produkte</span>
                </div>
              </>
            ) : (
              <p>Für den aktuellen Modus wurde kein sinnvoller Slot-Kauf gefunden.</p>
            )}
          </article>
        </div>
      )}

      {activePage === "comparisons" && (
        <div className="dashboardPage">
          <div className="dashboardSubTabs">
            {hourOptions.map((hoursToAdd) => (
              <button
                key={hoursToAdd}
                type="button"
                className={activeHourDelta === hoursToAdd ? "active" : ""}
                onClick={() => setActiveHourDelta(hoursToAdd)}
              >
                +{hoursToAdd} h
              </button>
            ))}
          </div>

          {activeComparison && (
            <div className="dashboardDeltaGrid">
              <DeltaCard label="Produkte" delta={activeComparison.products} />
              <DeltaCard label="Coins" delta={activeComparison.coins} />
              <DeltaCard label="XP" delta={activeComparison.xp} />
            </div>
          )}
        </div>
      )}

      {activePage === "charts" && (
        <div className="dashboardPage dashboardChartsGrid">
          <article className="dashboardChartCard">
            <h3>Produktionsfortschritt</h3>
            <ProgressChart points={progressCurve} />
          </article>

          <article className="dashboardChartCard">
            <h3>Gebäude-Auslastung</h3>
            <div className="utilizationList">
              {utilization.map((item) => (
                <div key={item.building} className="utilizationRow">
                  <span>{item.building}</span>
                  <div className="utilizationBar">
                    <span style={{ width: `${item.percent}%` }} />
                  </div>
                  <strong>{formatDecimal(item.percent, 0)}%</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
