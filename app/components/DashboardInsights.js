"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateProductionPlan } from "../../lib/calculator";

const dashboardPages = [
  { id: "overview", label: "Übersicht" },
  { id: "comparisons", label: "Vergleiche" },
  { id: "charts", label: "Diagramme" }
];

const defaultSlotCosts = { 3: 6, 4: 9, 5: 12, 6: 15, 7: 18, 8: 21, 9: 24 };
const fishingSlotCosts = { 3: 10, 4: 20, 5: 45, 6: 90, 7: 130, 8: 260, 9: 415 };
const fishingBuildingNames = ["Angelplatz", "Fischernetzmacher", "Hummerbecken", "Entensalon"];

function formatNumber(value) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(
    Math.round(Number(value || 0))
  );
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
  return { delta, percent, next };
}

function getMetricTotal(result, mode) {
  return mode === "xp" ? Number(result?.totals?.xp || 0) : Number(result?.totals?.coins || 0);
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

  return (isFishingBuilding ? fishingSlotCosts : defaultSlotCosts)[nextSlot] || null;
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
  return getMetricTotal(result, mode) / slotHours;
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

function buildHourComparison(result, settings, hoursToAdd, mode) {
  if (!result || !settings) return null;

  const simulated = simulatePlan(settings, {
    hours: Math.max(1, Number(settings.hours || 0) + hoursToAdd)
  });

  if (!simulated) return null;

  return {
    hoursToAdd,
    hours: Math.max(1, Number(settings.hours || 0) + hoursToAdd),
    slotHours: getDelta(calculateSlotHours(simulated), calculateSlotHours(result)),
    metric: getDelta(getMetricTotal(simulated, mode), getMetricTotal(result, mode)),
    products: getDelta(simulated.totals.products, result.totals.products),
    coins: getDelta(simulated.totals.coins, result.totals.coins),
    xp: getDelta(simulated.totals.xp, result.totals.xp)
  };
}

function buildComparisonRange(result, settings, start, end, mode) {
  const min = Math.min(start, end);
  const max = Math.max(start, end);

  return Array.from({ length: max - min + 1 }, (_, index) => min + index)
    .map((hoursToAdd) =>
      hoursToAdd === 0
        ? {
            hoursToAdd: 0,
            hours: Number(settings?.hours || 0),
            slotHours: getDelta(calculateSlotHours(result), calculateSlotHours(result)),
            metric: getDelta(getMetricTotal(result, mode), getMetricTotal(result, mode)),
            products: getDelta(result.totals.products, result.totals.products),
            coins: getDelta(result.totals.coins, result.totals.coins),
            xp: getDelta(result.totals.xp, result.totals.xp),
            isCurrent: true
          }
        : buildHourComparison(result, settings, hoursToAdd, mode)
    )
    .filter(Boolean);
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

      const metric = getMetricTotal(simulated, settings.mode) - getMetricTotal(result, settings.mode);

      return {
        buildingName,
        currentSlots,
        nextSlot,
        cost,
        metric,
        score: metric / cost,
        productsDelta: Number(simulated.totals.products || 0) - Number(result.totals.products || 0)
      };
    })
    .filter(Boolean)
    .filter((item) => item.metric > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0] || null;
}

function buildBuildingIconLookup(normalized) {
  return new Map((normalized?.buildings || []).map((building) => [building.name, building.iconUrl || ""]));
}

function buildBuildingUtilization(result, normalized) {
  const iconLookup = buildBuildingIconLookup(normalized);
  const rows = (result?.productionByBuilding || [])
    .map((group) => {
      const usedSlots = group.items.reduce((total, entry) => total + Number(entry.slotsUsed || 0), 0);
      const availableSlots = Math.max(...group.items.map((entry) => Number(entry.slots || 0)), usedSlots, 1);
      const percent = Math.min(100, (usedSlots / availableSlots) * 100);

      return {
        building: group.building,
        iconUrl: iconLookup.get(group.building) || "",
        usedSlots,
        availableSlots,
        percent: Math.round(percent)
      };
    })
    .sort((a, b) => b.percent - a.percent);

  const grouped = new Map();

  for (const row of rows) {
    if (!grouped.has(row.percent)) {
      grouped.set(row.percent, {
        percent: row.percent,
        buildings: [],
        usedSlots: 0,
        availableSlots: 0
      });
    }

    const group = grouped.get(row.percent);
    group.buildings.push(row);
    group.usedSlots += row.usedSlots;
    group.availableSlots += row.availableSlots;
  }

  return Array.from(grouped.values()).sort((a, b) => b.percent - a.percent);
}

function buildUtilizationSummary(groups) {
  const flatBuildings = groups.flatMap((group) => group.buildings);
  const fullGroups = groups.filter((group) => group.percent >= 100);
  const topGroup = groups[0];

  return {
    buildingCount: flatBuildings.length,
    fullBuildingCount: fullGroups.reduce((total, group) => total + group.buildings.length, 0),
    topPercent: topGroup?.percent || 0,
    averagePercent:
      flatBuildings.length > 0
        ? flatBuildings.reduce((total, building) => total + building.percent, 0) / flatBuildings.length
        : 0
  };
}

function buildProgressCurve(result) {
  const entries = (result?.productionByBuilding || []).flatMap((group) =>
    (group.items || []).map((entry) => ({
      ...entry,
      building: group.building
    }))
  );
  const totalProducts = entries.reduce((total, entry) => total + Number(entry.amount || 0), 0);

  if (!entries.length || !totalProducts) return [];

  const events = [];

  for (const entry of entries) {
    const amount = Number(entry.amount || 0);
    const slots = Math.max(1, Number(entry.slotsUsed || entry.slots || 1));
    const durationHours = Math.max(0.01, Number(entry.effectiveTimeMin || 0) / 60);

    for (let index = 1; index <= amount; index += 1) {
      const batch = Math.ceil(index / slots);
      events.push({
        time: batch * durationHours,
        amount: 1,
        productName: entry.product?.name || "Produkt",
        building: entry.building
      });
    }
  }

  events.sort((a, b) => a.time - b.time);

  let finished = 0;
  const points = [{ time: 0, percent: 0, finished: 0, total: totalProducts }];

  for (const event of events) {
    finished += event.amount;
    points.push({
      ...event,
      finished,
      total: totalProducts,
      percent: Math.min(100, (finished / totalProducts) * 100)
    });
  }

  return points;
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

function ComparisonTooltip({ comparison, side, position }) {

  return (
    <div
      className={side === "left" ? "comparisonTooltipCard left" : "comparisonTooltipCard right"}
      style={{
        left: side === "right" ? position.x + 12 : undefined,
        right: side === "left" ? `calc(100% - ${position.x - 12}px)` : undefined,
        top: position.y
      }}
    >
      <h3>
        {comparison.isCurrent
          ? "Aktuell"
          : `${comparison.hoursToAdd > 0 ? "+" : ""}${comparison.hoursToAdd} h`}
      </h3>
      <DeltaCard label="Coins" delta={comparison.coins} />
      <DeltaCard label="XP" delta={comparison.xp} />
      <DeltaCard label="Slot-Auslastung" delta={comparison.slotHours} />
    </div>
  );
}

function ComparisonChart({ comparisons, mode }) {
  const [hoveredComparison, setHoveredComparison] = useState(null);

  if (!comparisons.length) return <p className="dashboardEmpty">Kein Vergleichsbereich gewählt.</p>;

  const width = 560;
  const height = 190;
  const padding = { top: 14, right: 22, bottom: 42, left: 68 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = comparisons.map((item) => item.metric.next);
  const minX = Math.min(...comparisons.map((item) => item.hoursToAdd));
  const maxX = Math.max(...comparisons.map((item) => item.hoursToAdd));
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const rangeX = Math.max(1, maxX - minX);
  const rangeY = Math.max(1, maxY - minY || maxY);
  const yTicks = Array.from({ length: 5 }, (_, index) => minY + (rangeY / 4) * index);
  const xTicks = Array.from({ length: 16 }, (_, index) => minX + (rangeX / 15) * index);

  const getX = (value) => padding.left + ((value - minX) / rangeX) * chartWidth;
  const getY = (value) => padding.top + chartHeight - ((value - minY) / rangeY) * chartHeight;

  const path = comparisons
    .map((item, index) => `${index === 0 ? "M" : "L"} ${getX(item.hoursToAdd)} ${getY(item.metric.next)}`)
    .join(" ");
  const hoveredX = hoveredComparison ? getX(hoveredComparison.hoursToAdd) : 0;
  const hoveredY = hoveredComparison ? getY(hoveredComparison.metric.next) : 0;
  const tooltipSide = hoveredX > width / 2 ? "left" : "right";

  return (
    <div className="dashboardChartBox comparisonChartBox">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stundenvergleich">
        {yTicks.map((tick) => (
          <g key={tick}>
            <path className="dashboardChartGrid" d={`M ${padding.left} ${getY(tick)} H ${width - padding.right}`} />
            <text className="chartAxisText" x={padding.left - 8} y={getY(tick) + 4} textAnchor="end">
              {formatNumber(tick)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <g key={tick}>
            <path className="dashboardChartGrid subtle" d={`M ${getX(tick)} ${padding.top} V ${height - padding.bottom}`} />
            <text className="chartAxisText" x={getX(tick)} y={height - 24} textAnchor="middle">
              {tick > 0 ? "+" : ""}{formatDecimal(tick, tick % 1 === 0 ? 0 : 1)}h
            </text>
          </g>
        ))}
        <path className="chartAxisLine" d={`M ${padding.left} ${padding.top} V ${height - padding.bottom} H ${width - padding.right}`} />
        <text className="chartAxisLabel" x={padding.left + chartWidth / 2} y={height - 6} textAnchor="middle">
          Stunden-Abweichung
        </text>
        <text className="chartAxisLabel" x="12" y={padding.top + chartHeight / 2} textAnchor="middle" transform={`rotate(-90 12 ${padding.top + chartHeight / 2})`}>
          {mode === "xp" ? "XP" : "Coins"} absolut
        </text>
        <path className="dashboardChartLine" d={path} />
        {comparisons.map((item) => (
          <circle
            key={item.hoursToAdd}
            className={item.isCurrent ? "currentComparisonPoint" : ""}
            cx={getX(item.hoursToAdd)}
            cy={getY(item.metric.next)}
            r={item.isCurrent ? (hoveredComparison === item ? 8 : 6) : hoveredComparison === item ? 7 : 5}
            onMouseEnter={() => setHoveredComparison(item)}
            onMouseLeave={() => setHoveredComparison(null)}
          />
        ))}
      </svg>
      {hoveredComparison && (
        <ComparisonTooltip
          comparison={hoveredComparison}
          side={tooltipSide}
          position={{ x: hoveredX, y: hoveredY }}
        />
      )}
    </div>
  );
}

function ProgressChart({ points, large = false }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  if (!points.length) return <p className="dashboardEmpty">Noch keine Diagrammdaten.</p>;

  const width = large ? 860 : 520;
  const height = large ? 320 : 170;
  const maxTime = Math.max(...points.map((point) => point.time), 1);
  const getX = (time) => (time / maxTime) * width;
  const getY = (percent) => height - (percent / 100) * height;

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${getX(point.time)} ${getY(point.percent)}`)
    .join(" ");

  return (
    <div className={large ? "dashboardChartBox progressChartBox large" : "dashboardChartBox progressChartBox"}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Produktionsfortschritt">
        <path className="dashboardChartGrid" d={`M 0 ${height} H ${width}`} />
        <path className="dashboardChartLine" d={path} />
        {points.map((point, index) => (
          <circle
            key={`${point.time}-${index}`}
            cx={getX(point.time)}
            cy={getY(point.percent)}
            r={hoveredPoint === point ? 6 : 3.5}
            onMouseEnter={() => setHoveredPoint(point)}
            onMouseLeave={() => setHoveredPoint(null)}
          />
        ))}
      </svg>

      {hoveredPoint && (
        <div className="chartTooltip">
          <strong>{formatDecimal(hoveredPoint.time, 1)} h</strong>
          <span>
            {formatNumber(hoveredPoint.finished)} / {formatNumber(hoveredPoint.total)} Produkte
          </span>
          {hoveredPoint.productName && <small>{hoveredPoint.productName}</small>}
        </div>
      )}

      <div className="dashboardChartLegend">
        <span>0 h</span>
        <span>{formatDecimal(maxTime, 1)} h</span>
      </div>
    </div>
  );
}

function BuildingIcon({ building }) {
  if (building.iconUrl) return <img src={building.iconUrl} alt="" />;
  return <span>{building.building.slice(0, 1)}</span>;
}

export default function DashboardInsights({ result, normalized, calculationSettings, mode }) {
  const [activePage, setActivePage] = useState("overview");
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(5);
  const [progressModalOpen, setProgressModalOpen] = useState(false);

  const settings = useMemo(
    () => buildSimulationSettings({ normalized, calculationSettings }),
    [normalized, calculationSettings]
  );

  const efficiency = useMemo(() => calculateEfficiency(result, mode), [result, mode]);
  const rangeComparisons = useMemo(
    () => buildComparisonRange(result, settings, Number(rangeStart || 0), Number(rangeEnd || 0), mode),
    [result, settings, rangeStart, rangeEnd, mode]
  );
  const slotRecommendation = useMemo(() => buildBestSlotRecommendation(result, settings), [result, settings]);
  const utilizationGroups = useMemo(() => buildBuildingUtilization(result, normalized), [result, normalized]);
  const utilizationSummary = useMemo(() => buildUtilizationSummary(utilizationGroups), [utilizationGroups]);
  const progressCurve = useMemo(() => buildProgressCurve(result), [result]);

  useEffect(() => {
    if (!progressModalOpen) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setProgressModalOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [progressModalOpen]);

  if (!result || !calculationSettings) return null;

  const efficiencyLabel = mode === "xp" ? "XP/Slot-h" : "Coins/Slot-h";
  const recommendationUnit = mode === "xp" ? "XP/Diamant" : "Coins/Diamant";
  const updateRangeStart = (value) => {
    const nextStart = Number(value || 0);
    const currentEnd = Number(rangeEnd || 0);
    setRangeStart(Math.min(nextStart, currentEnd));
    setRangeEnd(Math.max(nextStart, currentEnd));
  };
  const updateRangeEnd = (value) => {
    const nextEnd = Number(value || 0);
    const currentStart = Number(rangeStart || 0);
    setRangeStart(Math.min(currentStart, nextEnd));
    setRangeEnd(Math.max(currentStart, nextEnd));
  };

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
            <KpiCard label={efficiencyLabel} value={formatDecimal(efficiency, 1)} helper="Effizienz pro Slot-Stunde" />
          </div>

          <article className="slotRecommendationCard">
            <span className="dashboardEyebrow">Slot-Empfehlung</span>
            {slotRecommendation ? (
              <>
                <strong>{slotRecommendation.buildingName}</strong>
                <p>
                  +1 Slot ({slotRecommendation.currentSlots} → {slotRecommendation.nextSlot}) für {slotRecommendation.cost} Diamanten
                </p>
                <div className="slotRecommendationStats">
                  <span>{formatDecimal(slotRecommendation.score, 1)} {recommendationUnit}</span>
                  <span>+{formatNumber(slotRecommendation.metric)} {mode === "xp" ? "XP" : "Coins"}</span>
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
          <article className="dashboardChartCard">
            <h3 className="comparisonRangeTitle">Stundenbereich</h3>
            <div className="comparisonRangeHeader">
              <div className="comparisonQuickActions left">
                {[-10, -5, -3].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setRangeStart((current) => Number(current || 0) + amount)}
                  >
                    {amount}
                  </button>
                ))}
              </div>
              <div className="comparisonRangeInputs">
                <label>
                  Von
                  <input type="number" value={rangeStart} onChange={(event) => updateRangeStart(event.target.value)} />
                </label>
                <label>
                  Bis
                  <input type="number" value={rangeEnd} onChange={(event) => updateRangeEnd(event.target.value)} />
                </label>
              </div>
              <div className="comparisonQuickActions right">
                {[3, 5, 10].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setRangeEnd((current) => Number(current || 0) + amount)}
                  >
                    +{amount}
                  </button>
                ))}
              </div>
            </div>
            <ComparisonChart comparisons={rangeComparisons} mode={mode} />
          </article>
        </div>
      )}

      {activePage === "charts" && (
        <div className="dashboardPage dashboardChartsGrid">
          <article className="dashboardChartCard">
            <div className="dashboardChartTitleRow">
              <h3>Produktionsfortschritt</h3>
              <button type="button" onClick={() => setProgressModalOpen(true)}>
                Groß öffnen
              </button>
            </div>
            <ProgressChart points={progressCurve} />
          </article>

          <article className="dashboardChartCard">
            <h3>Gebäude-Auslastung</h3>
            <div className="buildingUtilizationKpis">
              <KpiCard label="Gebäude" value={formatNumber(utilizationSummary.buildingCount)} />
              <KpiCard label="Voll ausgelastet" value={formatNumber(utilizationSummary.fullBuildingCount)} />
              <KpiCard label="Ø Auslastung" value={`${formatDecimal(utilizationSummary.averagePercent, 0)}%`} />
            </div>
            <div className="utilizationIconGroups">
              {utilizationGroups.map((group) => (
                <div key={group.percent} className="utilizationIconGroup">
                  <strong>{group.percent}%</strong>
                  <div>
                    {group.buildings.map((building) => (
                      <span key={building.building} className="utilizationIcon" title={`${building.building}: ${group.percent}%`}>
                        <BuildingIcon building={building} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>

          {progressModalOpen && (
            <div className="chartModalOverlay" role="dialog" aria-modal="true">
              <div className="chartModal">
                <div className="dashboardChartTitleRow">
                  <h3>Produktionsfortschritt</h3>
                  <button type="button" onClick={() => setProgressModalOpen(false)}>
                    Schließen
                  </button>
                </div>
                <ProgressChart points={progressCurve} large />
                <p className="dashboardEmpty">Mit Esc schließen.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
