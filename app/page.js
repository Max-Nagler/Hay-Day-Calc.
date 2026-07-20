"use client";

import { useEffect, useMemo, useState } from "react";

const fallbackData = {
  syncedAt: null,
  mainDatabase: [
    {
      id: "brot",
      title: "Brot",
      properties: {
        Level: { type: "number", number: 2 },
        XP: { type: "number", number: 3 },
        MaxPreis: { type: "number", number: 21 },
        Produktionszeit: {
          type: "rich_text",
          rich_text: [{ plain_text: "4 min" }]
        },
        Gebäude: {
          type: "rich_text",
          rich_text: [{ plain_text: "Bäckerei" }]
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
        Produktionszeit: {
          type: "rich_text",
          rich_text: [{ plain_text: "51 min" }]
        },
        Gebäude: {
          type: "rich_text",
          rich_text: [{ plain_text: "Molkerei" }]
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
        Produktionszeit: {
          type: "rich_text",
          rich_text: [{ plain_text: "12 min" }]
        },
        Gebäude: {
          type: "rich_text",
          rich_text: [{ plain_text: "Bäckerei" }]
        }
      }
    }
  ],
  recipeDatabase: [
    {
      id: "pizza-weizen",
      title: "Pizza – Weizen",
      product: "Pizza",
      ingredient: "Weizen",
      amount: 2
    },
    {
      id: "pizza-kaese",
      title: "Pizza – Käse",
      product: "Pizza",
      ingredient: "Käse",
      amount: 1
    },
    {
      id: "pizza-tomate",
      title: "Pizza – Tomate",
      product: "Pizza",
      ingredient: "Tomate",
      amount: 1
    },
    {
      id: "kaese-milch",
      title: "Käse – Milch",
      product: "Käse",
      ingredient: "Milch",
      amount: 3
    },
    {
      id: "brot-weizen",
      title: "Brot – Weizen",
      product: "Brot",
      ingredient: "Weizen",
      amount: 3
    }
  ]
};

function readNumber(properties, names) {
  for (const name of names) {
    const property = properties?.[name];

    if (!property) continue;

    if (property.type === "number") return property.number ?? null;

    if (property.type === "formula" && property.formula?.type === "number") {
      return property.formula.number ?? null;
    }
  }

  return null;
}

function readText(properties, names) {
  for (const name of names) {
    const property = properties?.[name];

    if (!property) continue;

    if (property.type === "rich_text") {
      return property.rich_text?.map((part) => part.plain_text).join("") || "";
    }

    if (property.type === "select") {
      return property.select?.name || "";
    }

    if (property.type === "status") {
      return property.status?.name || "";
    }

    if (property.type === "formula" && property.formula?.type === "string") {
      return property.formula.string || "";
    }
  }

  return "";
}

function normalizeProducts(data) {
  return (data.mainDatabase || [])
    .map((page) => ({
      id: page.id,
      name: page.title || "Ohne Name",
      level: readNumber(page.properties, ["Level", "level"]) ?? 0,
      xp: readNumber(page.properties, ["XP", "Erfahrungspunkte"]) ?? 0,
      coins: readNumber(page.properties, ["MaxPreis", "Verkaufspreis", "Preis"]) ?? 0,
      time: readText(page.properties, ["Produktionszeit", "Zeit"]) || "–",
      building: readText(page.properties, ["Gebäude", "Produktionsgebäude"]) || "–"
    }))
    .filter((product) => product.name && product.name !== "Ohne Name")
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

function normalizeRecipes(data) {
  return (data.recipeDatabase || [])
    .map((recipe) => ({
      product: recipe.product || recipe.Produkt || "",
      ingredient: recipe.ingredient || recipe.Zutat || "",
      amount: Number(recipe.amount || recipe.Menge || 0)
    }))
    .filter((recipe) => recipe.product && recipe.ingredient && recipe.amount > 0);
}

function calculateIngredients({ productName, quantity, recipes, recursive }) {
  const ingredients = new Map();
  const intermediate = new Map();
  const warnings = [];

  function addToMap(map, name, amount) {
    map.set(name, (map.get(name) || 0) + amount);
  }

  function resolve(name, amount, depth = 0) {
    if (depth > 12) {
      warnings.push(`Rekursion gestoppt bei ${name}.`);
      addToMap(ingredients, name, amount);
      return;
    }

    const recipeRows = recipes.filter((recipe) => recipe.product === name);

    if (!recipeRows.length) {
      addToMap(ingredients, name, amount);
      return;
    }

    if (depth > 0) {
      addToMap(intermediate, name, amount);
    }

    for (const row of recipeRows) {
      const neededAmount = row.amount * amount;

      if (recursive) {
        resolve(row.ingredient, neededAmount, depth + 1);
      } else {
        addToMap(ingredients, row.ingredient, neededAmount);
      }
    }
  }

  resolve(productName, quantity);

  return {
    ingredients: Array.from(ingredients.entries()).map(([name, amount]) => ({
      name,
      amount
    })),
    intermediate: Array.from(intermediate.entries()).map(([name, amount]) => ({
      name,
      amount
    })),
    warnings
  };
}

export default function Home() {
  const [data, setData] = useState(fallbackData);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("Pizza");
  const [quantity, setQuantity] = useState(1);
  const [recursive, setRecursive] = useState(true);
  const [levelFilter, setLevelFilter] = useState(999);

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

        setData(json);
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

  const products = useMemo(() => normalizeProducts(data), [data]);
  const recipes = useMemo(() => normalizeRecipes(data), [data]);

  const visibleProducts = useMemo(
    () => products.filter((product) => product.level <= levelFilter),
    [products, levelFilter]
  );

  const product = products.find((item) => item.name === selectedProduct) || products[0];

  const result = useMemo(() => {
    if (!product) {
      return {
        ingredients: [],
        intermediate: [],
        warnings: ["Kein Produkt ausgewählt."]
      };
    }

    return calculateIngredients({
      productName: product.name,
      quantity: Number(quantity) || 1,
      recipes,
      recursive
    });
  }, [product, quantity, recipes, recursive]);

  const totalXp = product ? product.xp * quantity : 0;
  const totalCoins = product ? product.coins * quantity : 0;

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Hay Day Calc.</p>
          <h1>Produkt planen, Zutaten berechnen.</h1>
          <p className="subtitle">
            Wähle ein Produkt und eine Menge. Der Rechner zeigt dir Zutaten,
            Zwischenprodukte und Gesamtwerte.
          </p>
        </div>

        <div className="syncBox">
          <span className={loadError ? "dot warning" : "dot"} />
          <div>
            <strong>{isLoading ? "Lade Daten…" : loadError ? "Demo-Modus" : "Live-Daten"}</strong>
            <small>
              {loadError ||
                `Datenstand: ${
                  data.syncedAt ? new Date(data.syncedAt).toLocaleString("de-DE") : "gerade geladen"
                }`}
            </small>
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="panel controls">
          <h2>Einstellungen</h2>

          <label>
            Produkt
            <select
              value={product?.name || ""}
              onChange={(event) => setSelectedProduct(event.target.value)}
            >
              {visibleProducts.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Menge
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>

          <label>
            Maximales Level
            <input
              type="number"
              min="1"
              value={levelFilter}
              onChange={(event) => setLevelFilter(Number(event.target.value))}
            />
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={recursive}
              onChange={(event) => setRecursive(event.target.checked)}
            />
            Zwischenprodukte auf Grundzutaten auflösen
          </label>
        </div>

        <div className="panel productCard">
          <h2>{product?.name || "Kein Produkt"}</h2>
          <div className="stats">
            <span>
              <strong>{product?.level ?? "–"}</strong>
              Level
            </span>
            <span>
              <strong>{product?.time ?? "–"}</strong>
              Zeit
            </span>
            <span>
              <strong>{product?.building ?? "–"}</strong>
              Gebäude
            </span>
            <span>
              <strong>{totalXp}</strong>
              XP gesamt
            </span>
            <span>
              <strong>{totalCoins}</strong>
              Coins gesamt
            </span>
          </div>
        </div>

        <div className="panel result">
          <h2>Benötigte Zutaten</h2>

          {result.ingredients.length ? (
            <ul className="itemList">
              {result.ingredients.map((item) => (
                <li key={item.name}>
                  <span>{item.name}</span>
                  <strong>{item.amount}×</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Keine Zutaten gefunden.</p>
          )}
        </div>

        <div className="panel result">
          <h2>Zwischenprodukte</h2>

          {result.intermediate.length ? (
            <ul className="itemList muted">
              {result.intermediate.map((item) => (
                <li key={item.name}>
                  <span>{item.name}</span>
                  <strong>{item.amount}×</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Keine Zwischenprodukte aufgelöst.</p>
          )}

          {result.warnings.length > 0 && (
            <div className="warnings">
              {result.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
