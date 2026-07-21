"use client";

import { useMemo, useState } from "react";
import ProductIcon from "../../components/ProductIcon";
import { calculateShipOrder } from "./shipEngine";
import { createEmptyCrate, shipCalculatorConfig } from "./shipConfig";

function getDefaultSlotsByBuilding(normalized) {
  const map = {};

  for (const building of normalized.buildings || []) {
    if (building.name && building.slots) map[building.name] = building.slots;
  }

  for (const product of normalized.products || []) {
    if (product.building && product.buildingSlots) map[product.building] = product.buildingSlots;
  }

  return map;
}

export default function ShipCalculator({ normalized }) {
  const config = shipCalculatorConfig;
  const [level, setLevel] = useState(config.defaultState.level);
  const [hoursUntilDeparture, setHoursUntilDeparture] = useState(config.defaultState.hoursUntilDeparture);
  const [globalSlots, setGlobalSlots] = useState(config.defaultState.globalSlots);
  const [intermediateMustBeProduced, setIntermediateMustBeProduced] = useState(config.defaultState.intermediateMustBeProduced);
  const [crates, setCrates] = useState([createEmptyCrate()]);
  const [stockByProductKey, setStockByProductKey] = useState({});
  const [result, setResult] = useState(null);

  const products = useMemo(
    () => [...(normalized.products || [])].sort((a, b) => (a.level || 0) - (b.level || 0) || a.name.localeCompare(b.name)),
    [normalized.products]
  );

  const productsByKey = useMemo(
    () => new Map(products.map((product) => [product.key, product])),
    [products]
  );

  const defaultSlotsByBuilding = useMemo(() => getDefaultSlotsByBuilding(normalized), [normalized]);

  function updateCrate(crateId, patch) {
    setCrates((current) =>
      current.map((crate) => (crate.id === crateId ? { ...crate, ...patch } : crate))
    );
  }

  function removeCrate(crateId) {
    setCrates((current) => current.filter((crate) => crate.id !== crateId));
  }

  function calculate() {
    setResult(
      calculateShipOrder({
        products: normalized.products,
        recipes: normalized.recipes,
        level,
        hoursUntilDeparture,
        crates,
        stockByProductKey,
        globalSlots,
        defaultSlotsByBuilding,
        intermediateMustBeProduced
      })
    );
  }

  return (
    <section className="shipCalculator">
      <div className="settingsGrid compactSettingsGrid">
        <div className="settingsColumn">
          <details open className="panel compactPanel">
            <summary>Schiffsdaten</summary>

            <label className="field compactField">
              <span>Level: {level}</span>
              <input type="range" min="1" max="126" value={level} onChange={(event) => setLevel(Number(event.target.value))} />
            </label>

            <label className="field compactField">
              <span>Zeit bis Abfahrt: {hoursUntilDeparture} h</span>
              <input type="range" min="1" max="48" value={hoursUntilDeparture} onChange={(event) => setHoursUntilDeparture(Number(event.target.value))} />
            </label>

            <label className="field compactField">
              <span>Fallback-Slots: {globalSlots}</span>
              <input type="range" min="1" max="10" value={globalSlots} onChange={(event) => setGlobalSlots(Number(event.target.value))} />
            </label>

            <label className="checkbox compactCheckbox singleCheckbox">
              <input type="checkbox" checked={intermediateMustBeProduced} onChange={(event) => setIntermediateMustBeProduced(event.target.checked)} />
              Zwischenprodukte selbst herstellen
            </label>
          </details>

          <button type="button" className="calculateButton compactCalculateButton" onClick={calculate}>
            Schiff berechnen
          </button>
        </div>

        <div className="panel compactPanel">
          <div className="panelStaticHeader">Schiffskisten</div>

          <div className="shipCrateList">
            {crates.map((crate, index) => {
              const product = productsByKey.get(crate.productKey);

              return (
                <div key={crate.id} className="shipCrateRow">
                  <span className="shipCrateNumber">#{index + 1}</span>

                  <select value={crate.productKey} onChange={(event) => updateCrate(crate.id, { productKey: event.target.value })}>
                    <option value="">Produkt wählen</option>
                    {products.map((item) => (
                      <option key={item.key} value={item.key}>
                        Lv. {item.level} · {item.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="1"
                    value={crate.amount}
                    onChange={(event) => updateCrate(crate.id, { amount: Number(event.target.value) })}
                  />

                  <input
                    type="number"
                    min="0"
                    placeholder="Lager"
                    value={stockByProductKey[crate.productKey] || ""}
                    disabled={!crate.productKey}
                    onChange={(event) =>
                      setStockByProductKey((current) => ({
                        ...current,
                        [crate.productKey]: Number(event.target.value)
                      }))
                    }
                  />

                  <div className="shipCrateProductIcon">
                    <ProductIcon item={product} />
                  </div>

                  <button type="button" onClick={() => removeCrate(crate.id)} disabled={crates.length <= 1}>
                    ×
                  </button>
                </div>
              );
            })}

            <button type="button" className="shipAddCrateButton" onClick={() => setCrates((current) => [...current, createEmptyCrate()])}>
              Kiste hinzufügen
            </button>
          </div>
        </div>
      </div>

      {result && (
        <section className="output belowSettings">
          <div className={result.possible ? "panel compactPanel shipResult possible" : "panel compactPanel shipResult warning"}>
            <div className="panelStaticHeader">
              {result.possible ? "Schiff ist machbar" : "Schiff braucht Anpassung"}
            </div>

            <div className="summaryGrid">
              <article className="summaryCard">
                <strong>{result.summary.crateCount}</strong>
                Kisten
              </article>
              <article className="summaryCard">
                <strong>{result.summary.missingProductCount}</strong>
                zu produzieren
              </article>
              <article className="summaryCard">
                <strong>{Math.round(result.totalRequiredTimeMin / 60)} h</strong>
                Produktionszeit
              </article>
              <article className="summaryCard">
                <strong>{result.summary.requiredBuildings}</strong>
                Gebäude
              </article>
            </div>

            {result.warnings.length > 0 && (
              <section className="warnings">
                {result.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </section>
            )}
          </div>

          <details open className="panel compactPanel">
            <summary>Benötigte Produkte</summary>
            <div className="visualProductionGrid">
              {result.requiredProducts.map((item) => (
                <article key={item.key} className="visualItem">
                  <ProductIcon item={item.product} size="large" />
                  <strong>{item.missingAmount}×</strong>
                  <span>{item.name}</span>
                  <small>{item.stockAmount} im Lager · {item.amount} angefragt</small>
                </article>
              ))}
            </div>
          </details>

          <details className="panel compactPanel">
            <summary>Zutatenliste</summary>
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
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </section>
      )}
    </section>
  );
}
