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

function StepperButton({ children, onClick }) {
  return (
    <button className="stepperButton" type="button" onClick={onClick}>
      {children}
    </button>
  );
}

export default function Home() {
  const [rawData, setRawData] = useState(fallbackRawData);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [mode, setMode] = useState("coins");
  const [level, setLevel] = useState(33);
  const [hours, setHours] = useState(8);
  const [globalSlots, setGlobalSlots] = useState(5);

  const [resolveToBaseIngredients, setResolveToBaseIngredients] = useState(true);
  const [assumeIntermediateStock, setAssumeIntermediateStock] = useState(false);

  const [allowedBuildings, setAllowedBuildings] = useState([]);
  const [userChangedBuildings, setUserChangedBuildings] = useState(false);

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

  const availableBuildings = useMemo(
    () => getAvailableBuildings(normalized.products, level),
    [normalized.products, level]
  );

  const availableBuildingNames = useMemo(
    () => availableBuildings.map((building) => building.name),
    [availableBuildings]
  );

  useEffect(() => {
    setAllowedBuildings((current) => {
      const stillAvailable = current.filter((name) => availableBuildingNames.includes(name));

      if (!userChangedBuildings) {
        return availableBuildingNames;
      }

      return stillAvailable;
    });
  }, [availableBuildingNames, userChangedBuildings]);

  const result = useMemo(() => {
    return calculateProductionPlan({
      products: normalized.products,
      recipes: normalized.recipes,
      mode,
      level,
      hours,
      globalSlots,
      allowedBuildings,
      assumeIntermediateStock,
      resolveToBaseIngredients
    });
  }, [
    normalized.products,
    normalized.recipes,
    mode,
    level,
    hours,
    globalSlots,
    allowedBuildings,
    assumeIntermediateStock,
    resolveToBaseIngredients
  ]);

  function changeLevel(delta) {
    setLevel((current) => Math.max(1, current + delta));
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

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Hay Day Calc.</p>
          <h1>Produktionsplan für deine Farm.</h1>
          <p className="subtitle">
            Wähle Modus, Level, Zeitfenster und Gebäude. Der Rechner erstellt
            für jedes ausgewählte Gebäude eine eigene Warteschlange.
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
                  value={level}
                  onChange={(event) => {
                    setLevel(Math.max(1, Number(event.target.value)));
                    setUserChangedBuildings(false);
                  }}
                />
                <div className="stepper">
                  <StepperButton onClick={() => changeLevel(-10)}>-10</StepperButton>
                  <StepperButton onClick={() => changeLevel(-5)}>-5</StepperButton>
                  <StepperButton onClick={() => changeLevel(-1)}>-1</StepperButton>
                  <StepperButton onClick={() => changeLevel(1)}>+1</StepperButton>
                  <StepperButton onClick={() => changeLevel(5)}>+5</StepperButton>
                  <StepperButton onClick={() => changeLevel(10)}>+10</StepperButton>
                </div>
              </div>
            </label>

            <label className="field">
              <span>Produktionsdauer: {hours} h</span>
              <input
                type="range"
                min="1"
                max="48"
                step="1"
                value={hours}
                onChange={(event) => setHours(Number(event.target.value))}
              />
            </label>

            <label className="field">
              <span>Freie Slots pro Warteschlange: {globalSlots}</span>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={globalSlots}
                onChange={(event) => setGlobalSlots(Number(event.target.value))}
              />
            </label>
          </details>

          <details className="panel">
            <summary>Zusätzliche Einstellungen</summary>

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
          </details>
        </div>

        <div className="buildingsColumn">
          <details className="panel">
            <summary>Produktionsgebäude</summary>

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
          </details>
        </div>
      </section>

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
                            Level {entry.product.level} · {formatMinutes(entry.effectiveTimeMin)} inkl.
                            Vorprodukte · {entry.slots} Slots · {Math.round(entry.totalCoins)} Coins ·{" "}
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
    </main>
  );
}
