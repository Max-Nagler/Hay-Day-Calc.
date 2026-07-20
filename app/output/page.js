"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateProductionPlan } from "../../lib/calculator";
import { normalizeData } from "../../lib/normalize";
import { useCalculatorState } from "../../lib/useCalculatorState";

const fallbackRawData = {
  ok: true,
  syncedAt: null,
  mainDatabase: [],
  recipeDatabase: []
};

function formatMinutes(minutes) {
  if (!minutes) return "0 min";

  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);

  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

function ProductIcon({ item, size = "normal" }) {
  const className = size === "large" ? "visualIcon large" : "visualIcon";

  if (item?.iconUrl) {
    return <img className={className} src={item.iconUrl} alt="" />;
  }

  const firstLetter = item?.name?.slice(0, 1) || "?";
  return <span className={`${className} fallback`}>{firstLetter}</span>;
}

export default function OutputEmbed() {
  const { state } = useCalculatorState();

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

  const canCalculate =
    Boolean(state.mode) &&
    state.level >= 1 &&
    state.hours >= 1 &&
    state.globalSlots >= 1 &&
    state.allowedBuildings.length > 0;

  const result = useMemo(() => {
    if (!canCalculate) return null;

    return calculateProductionPlan({
      products: normalized.products,
      recipes: normalized.recipes,
      mode: state.mode,
      level: state.level,
      hours: state.hours,
      globalSlots: state.globalSlots,
      slotsByBuilding: state.slotsByBuilding,
      defaultSlotsByBuilding,
      allowedBuildings: state.allowedBuildings,
      intermediateMustBeProduced: state.intermediateMustBeProduced,
      excludedIngredientNames: state.excludedIngredientNames
    });
  }, [
    normalized.products,
    normalized.recipes,
    state,
    defaultSlotsByBuilding,
    canCalculate
  ]);

  return (
    <main className="embedShell outputEmbedShell">
      <section className="embedHeader">
        <div>
          <p className="eyebrow">Hay Day Calc.</p>
          <h1>Produkt- & Zutatenliste</h1>
        </div>

        <div className="miniStatus">
          {isLoading ? "Lädt…" : loadError || (result ? `${result.totals.products} Produkte` : "Bereit")}
        </div>
      </section>

      {!canCalculate && (
        <section className="panel compactPanel">
          <p className="empty">
            Fülle zuerst die Grundeinstellungen aus und wähle mindestens ein Produktionsgebäude.
          </p>
        </section>
      )}

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
                <p className="empty">Keine passenden Produkte gefunden.</p>
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
