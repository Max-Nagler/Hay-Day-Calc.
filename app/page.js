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
  const m = minutes % 60;

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
  const [resolveToBaseIngredients, setResolveToBaseIngredients] = useState(true);
  const [allowedBuildings, setAllowedBuildings] = useState([]);
  const [slotsByBuilding, setSlotsByBuilding] = useState({});

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

  useEffect(() => {
    setAllowedBuildings((current) => {
      if (current.length > 0) {
        return current.filter((building) =>
          availableBuildings.some((item) => item.name === building)
        );
      }

      return availableBuildings.map((building) => building.name);
    });

    setSlotsByBuilding((current) => {
      const next = { ...current };

      for (const building of availableBuildings) {
        if (!next[building.name]) {
          next[building.name] = 1;
        }
      }

      return next;
    });
  }, [availableBuildings]);

  const canShowAdvanced = level > 0 && hours > 0;

  const result = useMemo(() => {
    return calculateProductionPlan({
      products: normalized.products,
      recipes: normalized.recipes,
      mode,
      level,
      hours,
      allowedBuildings,
      slotsByBuilding,
      resolveToBaseIngredients
    });
  }, [
    normalized.products,
    normalized.recipes,
    mode,
    level,
    hours,
    allowedBuildings,
    slotsByBuilding,
    resolveToBaseIngredients
  ]);

  function changeLevel(delta) {
    setLevel((current) => Math.max(1, current + delta));
  }

  function toggleBuilding(buildingName) {
    setAllowedBuildings((current) => {
      if (current.includes(buildingName)) {
        return current.filter((name) => name !== buildingName);
      }

      return [...current, buildingName];
    });
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Hay Day Calc.</p>
          <h1>Produktionsplan für deine Farm.</h1>
          <p className="subtitle">
            Wähle Modus, Level, Zeitfenster und Gebäude. Der Rechner erstellt
            eine Produktionsliste und summiert die benötigten Zutaten.
          </p>
        </div>

        <div className="syncBox">
          <span className={loadError ? "dot warning" : "dot"} />
          <div>
            <strong>{isLoading ? "Lade Daten…" : loadError ? "Demo-Modus" : "Live-Daten"}</strong>
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

      <section className="layout">
        <aside className="settings">
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
                  onChange={(event) => setLevel(Math.max(1, Number(event.target.value)))}
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
          </details>

          <details open={canShowAdvanced} className={canShowAdvanced ? "panel" : "panel disabled"}>
            <summary>Zusätzliche Einstellungen</summary>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={resolveToBaseIngredients}
                onChange={(event) => setResolveToBaseIngredients(event.target.checked)}
              />
              Bis auf Grundzutaten zurückrechnen
            </label>

            <div className="buildingList">
              {availableBuildings.map((building) => {
                const isAllowed = allowedBuildings.includes(building.name);

                return (
                  <div key={building.name} className={isAllowed ? "buildingCard active" : "buildingCard"}>
                    <button type="button" onClick={() => toggleBuilding(building.name)}>
                      <span className="iconFallback small">
                        {building.name.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{building.name}</strong>
                        <small>ab Level {building.level}</small>
                      </span>
                    </button>

                    {isAllowed && (
                      <label>
                        Slots: {slotsByBuilding[building.name] || 1}
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="1"
                          value={slotsByBuilding[building.name] || 1}
                          onChange={(event) =>
                            setSlotsByBuilding((current) => ({
                              ...current,
                              [building.name]: Number(event.target.value)
                            }))
                          }
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        </aside>

        <section className="output">
          <div className="summaryGrid">
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
              <strong>{allowedBuildings.length}</strong>
              Gebäude
            </div>
          </div>

          <section className="panel">
            <h2>Produktionsliste</h2>

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
                            <strong>{entry.amount}× {entry.product.name}</strong>
                            <small>
                              Level {entry.product.level} · {formatMinutes(entry.product.timeMin)} ·{" "}
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
              <p className="empty">Keine passenden Produkte gefunden.</p>
            )}
          </section>

          <section className="panel">
            <h2>Zutatenliste</h2>

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
                            <strong>{item.amount}× {item.name}</strong>
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
          </section>

          {result.intermediateProducts.length > 0 && (
            <section className="panel">
              <h2>Zwischenprodukte</h2>

              <ul className="itemList compact">
                {result.intermediateProducts.map((item) => (
                  <li key={item.key}>
                    <ProductIcon item={item} />
                    <span>
                      <strong>{item.amount}× {item.name}</strong>
                      <small>{item.building || "Zwischenprodukt"}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.warnings.length > 0 && (
            <section className="warnings">
              {result.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </section>
          )}
        </section>
      </section>
    </main>
  );
}
