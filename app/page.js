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
  {
    id: "coins",
    label: "Coins",
    description: "Maximaler Verkaufspreis pro Zeit"
  },
  {
    id: "xp",
    label: "XP",
    description: "Erfahrungspunkte pro Zeit"
  },
  {
    id: "slots",
    label: "Slotauslastung",
    description: "Lange Produktion für Warteschlangen"
  }
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

function StepperButton({ children, onClick, disabled }) {
  return (
    <button className="stepperButton" type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function parseNumberInput(value) {
  if (value === "" || value === null || value === undefined) return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export default function Home() {
  const [rawData, setRawData] = useState(fallbackRawData);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [mode, setMode] = useState("");
  const [levelInput, setLevelInput] = useState("");
  const [hoursInput, setHoursInput] = useState("");
  const [globalSlotsInput, setGlobalSlotsInput] = useState("");

  const [resolveToBaseIngredients, setResolveToBaseIngredients] = useState(false);
  const [assumeIntermediateStock, setAssumeIntermediateStock] = useState(false);

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

  const level = parseNumberInput(levelInput);
  const hours = parseNumberInput(hoursInput);
  const globalSlots = parseNumberInput(globalSlotsInput);

  const baseSettingsComplete =
    Boolean(mode) &&
    level !== null &&
    level >= 1 &&
    hours !== null &&
    hours >= 1 &&
    globalSlots !== null &&
    globalSlots >= 1;

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
  }, [
    mode,
    levelInput,
    hoursInput,
    globalSlotsInput,
    resolveToBaseIngredients,
    assumeIntermediateStock,
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
      allowedBuildings: calculationSettings.allowedBuildings,
      assumeIntermediateStock: calculationSettings.assumeIntermediateStock,
      resolveToBaseIngredients: calculationSettings.resolveToBaseIngredients
    });
  }, [normalized.products, normalized.recipes, calculationStarted, calculationSettings]);

  function changeLevel(delta) {
    const current = parseNumberInput(levelInput) || 1;
    setLevelInput(String(Math.max(1, current + delta)));
    setUserChangedBuildings(false);
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

  function startCalculation() {
    if (!baseSettingsComplete) return;

    setCalculationSettings({
      mode,
      level,
      hours,
      globalSlots,
      allowedBuildings,
      assumeIntermediateStock,
      resolveToBaseIngredients
    });

    setCalculationStarted(true);
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Hay Day Calc.</p>
          <h1>Produktionsplan für deine Farm.</h1>
          <p className="subtitle">
            Gib zuerst die Grunddaten ein. Danach öffnet sich der nächste Schritt
            und du kannst die Berechnung starten.
          </p>
        </div>

        <div className="syncBox">
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

      <section className="settingsGrid">
        <div className="settingsColumn">
          <details open className="panel">
            <summary>Grunddaten</summary>

            <div className="modeGrid">
              {modes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={mode === item.id ? "modeButton active" : "modeButton"}
                  onClick={() => setMode(item.id)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>

            <label className="field">
              <span>Farm-Level</span>
              <div className="levelControl">
                <input
                  type="number"
                  min="1"
                  placeholder="z. B. 33"
                  value={levelInput}
                  onChange={(event) => {
                    setLevelInput(event.target.value);
                    setUserChangedBuildings(false);
                  }}
                />
                <div className="stepper">
                  <StepperButton onClick={() => changeLevel(-10)} disabled={!levelInput}>
                    -10
                  </StepperButton>
                  <StepperButton onClick={() => changeLevel(-5)} disabled={!levelInput}>
                    -5
                  </StepperButton>
                  <StepperButton onClick={() => changeLevel(-1)} disabled={!levelInput}>
                    -1
                  </StepperButton>
                  <StepperButton onClick={() => changeLevel(1)}>+1</StepperButton>
                  <StepperButton onClick={() => changeLevel(5)}>+5</StepperButton>
                  <StepperButton onClick={() => changeLevel(10)}>+10</StepperButton>
                </div>
              </div>
            </label>

            <label className="field">
              <span>Produktionsdauer in Stunden</span>
              <input
                type="number"
                min="1"
                max="48"
                placeholder="1–48"
                value={hoursInput}
                onChange={(event) => setHoursInput(event.target.value)}
              />
            </label>

            {hours !== null && hours >= 1 && (
              <label className="field">
                <span>Produktionsdauer: {hours} h</span>
                <input
                  type="range"
                  min="1"
                  max="48"
                  step="1"
                  value={hours}
                  onChange={(event) => setHoursInput(event.target.value)}
                />
              </label>
            )}

            <label className="field">
              <span>Freie Slots pro Warteschlange</span>
              <input
                type="number"
                min="1"
                max="10"
                placeholder="1–10"
                value={globalSlotsInput}
                onChange={(event) => setGlobalSlotsInput(event.target.value)}
              />
            </label>

            {globalSlots !== null && globalSlots >= 1 && (
              <label className="field">
                <span>Freie Slots: {globalSlots}</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={globalSlots}
                  onChange={(event) => setGlobalSlotsInput(event.target.value)}
                />
              </label>
            )}

            {!baseSettingsComplete && (
              <p className="helperText inlineHelper">
                Wähle einen Rechenmodus und gib Level, Produktionsdauer und freie
                Slots ein.
              </p>
            )}
          </details>

          <details open={baseSettingsComplete} className={baseSettingsComplete ? "panel" : "panel disabled"}>
            <summary>Zusätzliche Einstellungen</summary>

            {!baseSettingsComplete ? (
              <p className="empty">
                Wird freigeschaltet, sobald die Grunddaten vollständig sind.
              </p>
            ) : (
              <>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={resolveToBaseIngredients}
                    onChange={(event) => setResolveToBaseIngredients(event.target.checked)}
                  />
                  Bis auf Grundzutaten zurückrechnen
                </label>

                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={assumeIntermediateStock}
                    onChange={(event) => setAssumeIntermediateStock(event.target.checked)}
                  />
                  Zwischenprodukte sind bereits auf Lager
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
                    Wähle mindestens ein Produktionsgebäude aus.
                  </p>
                )}
              </>
            )}
          </details>
        </div>

        <div className="buildingsColumn">
          <details className={baseSettingsComplete ? "panel" : "panel disabled"}>
            <summary>Produktionsgebäude</summary>

            {!baseSettingsComplete ? (
              <p className="empty">
                Gebäude werden angezeigt, sobald die Grunddaten vollständig sind.
              </p>
            ) : (
              <>
                <div className="buildingActions">
                  <button type="button" onClick={selectAllBuildings}>
                    Alle auswählen
                  </button>
                  <button type="button" onClick={clearAllBuildings}>
                    Keine
                  </button>
                </div>

                <p className="helperText">
                  Standardmäßig sind alle Gebäude ausgewählt, die bei Level {level} verfügbar sind.
                </p>

                <div className="buildingList">
                  {availableBuildings.map((building) => {
                    const isAllowed = allowedBuildings.includes(building.name);

                    return (
                      <div
                        key={building.name}
                        className={isAllowed ? "buildingCard active" : "buildingCard"}
                      >
                        <button type="button" onClick={() => toggleBuilding(building.name)}>
                          <span className="iconFallback small">
                            {building.name.slice(0, 1)}
                          </span>
                          <span>
                            <strong>{building.name}</strong>
                            <small>
                              ab Level {building.level} · {isAllowed ? "aktiv" : "ausgeschlossen"}
                            </small>
                          </span>
                        </button>

                        {isAllowed && (
                          <p className="buildingHint">
                            nutzt globale Sloteinstellung: {globalSlots}
                          </p>
                        )}
                      </div>
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
          <section className="summaryGrid belowSettings">
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
            <details className="panel">
              <summary>Produktionsliste</summary>

              {result.productionByBuilding.length ? (
                <div className="productionGroups">
                  {result.productionByBuilding.map((group) => (
                    <div key={group.building} className="productionGroup">
                      <h3>{group.building}</h3>

                      <ul className="itemList">
                        {group.items.map((entry) => (
                          <li key={`${entry.building}-${entry.product.key}`}>
                            <ProductIcon item={entry.product} />
                            <span>
                              <strong>
                                {entry.amount}× {entry.product.name}
                              </strong>
                              <small>
                                Level {entry.product.level} ·{" "}
                                {formatMinutes(entry.effectiveTimeMin)} inkl. Vorprodukte ·{" "}
                                {entry.slots} Slots · {Math.round(entry.totalCoins)} Coins ·{" "}
                                {Math.round(entry.totalXp)} XP
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
                  Keine passenden Produkte gefunden. Prüfe Level, Gebäudeauswahl oder Datenbankdaten.
                </p>
              )}
            </details>

            <details className="panel">
              <summary>Zutatenliste</summary>

              {result.ingredientGroups.length ? (
                <div className="ingredientGroups">
                  {result.ingredientGroups.map((group) => (
                    <div key={group.title} className="ingredientGroup">
                      <h3>{group.title}</h3>

                      <ul className="itemList compact">
                        {group.items.map((item) => (
                          <li key={item.key}>
                            <ProductIcon item={item} />
                            <span>
                              <strong>
                                {item.amount}× {item.name}
                              </strong>
                              <small>
                                {item.level ? `Level ${item.level}` : "ohne Level"}
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
              <details className="panel">
                <summary>Zwischenprodukte</summary>

                <ul className="itemList compact">
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
