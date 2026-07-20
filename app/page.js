"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateProductionPlan, getAvailableBuildings } from "../lib/calculator";
import { normalizeData } from "../lib/normalize";

const fallbackRawData = {
  ok: true,
  syncedAt: null,
  mainDatabase: [
    {
      id: "brot",
      title: "Brot",
      properties: {
        Level: { type: "number", number: 2 },
        XP: { type: "number", number: 3 },
        MaxPreis: { type: "number", number: 21 },
        "Produktionszeit Minuten": { type: "number", number: 4 },
        Gebäude: {
          type: "rich_text",
          rich_text: [{ plain_text: "Bäckerei" }]
        },
        Typ: {
          type: "select",
          select: { name: "Produktionsgebäude" }
        }
      }
    },
    {
      id: "kaese",
      title: "Käse",
      properties: {
        Level: { type: "number", number: 12 },
        XP: { type: "number", number: 15 },
        MaxPreis: { type: "number", number: 122 },
        "Produktionszeit Minuten": { type: "number", number: 51 },
        Gebäude: {
          type: "rich_text",
          rich_text: [{ plain_text: "Molkerei" }]
        },
        Typ: {
          type: "select",
          select: { name: "Produktionsgebäude" }
        }
      }
    },
    {
      id: "pizza",
      title: "Pizza",
      properties: {
        Level: { type: "number", number: 33 },
        XP: { type: "number", number: 23 },
        MaxPreis: { type: "number", number: 190 },
        "Produktionszeit Minuten": { type: "number", number: 12 },
        Gebäude: {
          type: "rich_text",
          rich_text: [{ plain_text: "Bäckerei" }]
        },
        Typ: {
          type: "select",
          select: { name: "Produktionsgebäude" }
        }
      }
    },
    {
      id: "weizen",
      title: "Weizen",
      properties: {
        Level: { type: "number", number: 1 },
        XP: { type: "number", number: 1 },
        MaxPreis: { type: "number", number: 3.6 },
        "Produktionszeit Minuten": { type: "number", number: 2 },
        Typ: {
          type: "select",
          select: { name: "Feld" }
        }
      }
    },
    {
      id: "milch",
      title: "Milch",
      properties: {
        Level: { type: "number", number: 6 },
        XP: { type: "number", number: 3 },
        MaxPreis: { type: "number", number: 32 },
        "Produktionszeit Minuten": { type: "number", number: 60 },
        Typ: {
          type: "select",
          select: { name: "Tiergehege" }
        }
      }
    },
    {
      id: "tomate",
      title: "Tomate",
      properties: {
        Level: { type: "number", number: 30 },
        XP: { type: "number", number: 8 },
        MaxPreis: { type: "number", number: 43.2 },
        "Produktionszeit Minuten": { type: "number", number: 360 },
        Typ: {
          type: "select",
          select: { name: "Feld" }
        }
      }
    }
  ],
  recipeDatabase: [
    {
      id: "pizza-weizen",
      title: "Pizza – Weizen",
      properties: {
        Produkt: {
          type: "rich_text",
          rich_text: [{ plain_text: "Pizza" }]
        },
        Zutat: {
          type: "rich_text",
          rich_text: [{ plain_text: "Weizen" }]
        },
        Menge: { type: "number", number: 2 }
      }
    },
    {
      id: "pizza-kaese",
      title: "Pizza – Käse",
      properties: {
        Produkt: {
          type: "rich_text",
          rich_text: [{ plain_text: "Pizza" }]
        },
        Zutat: {
          type: "rich_text",
          rich_text: [{ plain_text: "Käse" }]
        },
        Menge: { type: "number", number: 1 }
      }
    },
    {
      id: "pizza-tomate",
      title: "Pizza – Tomate",
      properties: {
        Produkt: {
          type: "rich_text",
          rich_text: [{ plain_text: "Pizza" }]
        },
        Zutat: {
          type: "rich_text",
          rich_text: [{ plain_text: "Tomate" }]
        },
        Menge: { type: "number", number: 1 }
      }
    },
    {
      id: "kaese-milch",
      title: "Käse – Milch",
      properties: {
        Produkt: {
          type: "rich_text",
          rich_text: [{ plain_text: "Käse" }]
        },
        Zutat: {
          type: "rich_text",
          rich_text: [{ plain_text: "Milch" }]
        },
        Menge: { type: "number", number: 3 }
      }
    },
    {
      id: "brot-weizen",
      title: "Brot – Weizen",
      properties: {
        Produkt: {
          type: "rich_text",
          rich_text: [{ plain_text: "Brot" }]
        },
        Zutat: {
          type: "rich_text",
          rich_text: [{ plain_text: "Weizen" }]
        },
        Menge: { type: "number", number: 3 }
      }
    }
  ]
};

const modes = [
  { id: "coins", label: "Coins" },
  { id: "xp", label: "XP" },
  { id: "slots", label: "Slots" }
];

function formatMinutes(minutes) {
  if (!minutes) return "0 min";

  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);

  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

function ProductIcon({ item }) {
  if (item?.iconUrl) {
    return <img className="iconImage" src={item.iconUrl} alt="" />;
  }

  const firstLetter = item?.name?.slice(0, 1) || "?";
  return <span className="iconFallback">{firstLetter}</span>;
}

export default function Home() {
  const [rawData, setRawData] = useState(fallbackRawData);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [mode, setMode] = useState("");
  const [level, setLevel] = useState(33);
  const [hours, setHours] = useState(8);
  const [globalSlots, setGlobalSlots] = useState(5);

  const [intermediateMustBeProduced, setIntermediateMustBeProduced] = useState(false);

  const [allowedBuildings, setAllowedBuildings] = useState([]);
  const [userChangedBuildings, setUserChangedBuildings] = useState(false);

  const [calculationStarted, setCalculationStarted] = useState(false);
  const [calculationSettings, setCalculationSettings] = useState(null);

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

  const baseSettingsComplete = Boolean(mode) && level >= 1 && hours >= 1 && globalSlots >= 1;

  const normalized = useMemo(() => normalizeData(rawData), [rawData]);

  const availableBuildings = useMemo(
    () => getAvailableBuildings(normalized.products, level || 0),
    [normalized.products, level]
  );

  const availableBuildingNames = useMemo(
    () => availableBuildings.map((building) => building.name),
    [availableBuildings]
  );

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
  }, [availableBuildingNames, baseSettingsComplete, userChangedBuildings]);

  useEffect(() => {
    setCalculationStarted(false);
    setCalculationSettings(null);
  }, [mode, level, hours, globalSlots, intermediateMustBeProduced, allowedBuildings]);

  const result = useMemo(() => {
    if (!calculationStarted || !calculationSettings) return null;

    return calculateProductionPlan({
      products: normalized.products,
      recipes: normalized.recipes,
      mode: calculationSettings.mode,
      level: calculationSettings.level,
      hours: calculationSettings.hours,
      globalSlots: calculationSettings.globalSlots,
      allowedBuildings: calculationSettings.allowedBuildings,
      intermediateMustBeProduced: calculationSettings.intermediateMustBeProduced
    });
  }, [normalized.products, normalized.recipes, calculationStarted, calculationSettings]);

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

  function startCalculation() {
    if (!baseSettingsComplete || allowedBuildings.length === 0) return;

    setCalculationSettings({
      mode,
      level,
      hours,
      globalSlots,
      allowedBuildings,
      intermediateMustBeProduced
    });

    setCalculationStarted(true);
  }

  return (
    <main className="shell compactShell">
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

      <section className="settingsGrid compactSettingsGrid">
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
                <span>Slots: {globalSlots}</span>
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

        <div className="buildingsColumn">
          <details className={baseSettingsComplete ? "panel compactPanel" : "panel compactPanel disabled"}>
            <summary>Produktionsgebäude</summary>

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

                <div className="buildingChipGrid">
                  {availableBuildings.map((building) => {
                    const isAllowed = allowedBuildings.includes(building.name);

                    return (
                      <button
                        key={building.name}
                        type="button"
                        className={isAllowed ? "buildingChip active" : "buildingChip"}
                        onClick={() => toggleBuilding(building.name)}
                        title={`ab Level ${building.level}`}
                      >
                        <span>{building.name}</span>
                        <small>Lv. {building.level}</small>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </details>
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
                <div className="compactProductionGrid">
                  {result.productionByBuilding.map((group) => (
                    <div key={group.building} className="compactGroup">
                      <h3>{group.building}</h3>

                      <ul className="itemList compactItems">
                        {group.items.map((entry) => (
                          <li
                            key={`${entry.building}-${entry.product.key}-${entry.role}`}
                            className={entry.role === "intermediate" ? "intermediateItem" : ""}
                          >
                            <ProductIcon item={entry.product} />
                            <span>
                              <strong>
                                {entry.amount}× {entry.product.name}
                              </strong>
                              <small>
                                {entry.role === "intermediate" ? "Zwischenprodukt · " : ""}
                                Lv. {entry.product.level} · {formatMinutes(entry.effectiveTimeMin)} ·{" "}
                                {entry.slotsUsed}/{entry.slots} Slots ·{" "}
                                {Math.round(entry.totalCoins)} Coins · {Math.round(entry.totalXp)} XP
                              </small>
                            </span>
                          </li>
                        ))}
                      </ul>
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
                <div className="compactProductionGrid">
                  {result.ingredientGroups.map((group) => (
                    <div key={group.title} className="compactGroup">
                      <h3>{group.title}</h3>

                      <ul className="itemList compactItems">
                        {group.items.map((item) => (
                          <li key={item.key}>
                            <ProductIcon item={item} />
                            <span>
                              <strong>
                                {item.amount}× {item.name}
                              </strong>
                              <small>
                                {item.level ? `Lv. ${item.level}` : "ohne Level"}
                                {item.building ? ` · ${item.building}` : ""}
                              </small>
                            </span>
                          </li>
                        ))}
                      </ul>
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

                <ul className="itemList compactItems">
                  {result.intermediateProducts.map((item) => (
                    <li key={item.key}>
                      <ProductIcon item={item} />
                      <span>
                        <strong>
                          {item.amount}× {item.name}
                        </strong>
                        <small>{item.building || "Zwischenprodukt"}</small>
                      </span>
                    </li>
                  ))}
                </ul>
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
