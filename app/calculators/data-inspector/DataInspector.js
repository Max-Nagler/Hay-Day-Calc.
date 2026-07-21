"use client";

import { useMemo } from "react";
import "./dataInspector.css";

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  return String(value);
}

function statusClass(value) {
  return value ? "ok" : "missing";
}

function buildRecipeGroups(recipes) {
  const grouped = new Map();

  for (const recipe of recipes || []) {
    const productKey = recipe.productKey || recipe.product || "unbekannt";
    const current = grouped.get(productKey) || {
      product: recipe.product || "Unbekannt",
      productKey,
      ingredients: [],
      ingredientSummary: ""
    };

    current.ingredients.push({
      name: recipe.ingredient || "Unbekannt",
      key: recipe.ingredientKey || "",
      amount: recipe.amount || 0
    });

    grouped.set(productKey, current);
  }

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      ingredients: group.ingredients.sort((a, b) => a.name.localeCompare(b.name, "de")),
      ingredientSummary: group.ingredients
        .sort((a, b) => a.name.localeCompare(b.name, "de"))
        .map((ingredient) => `${ingredient.amount}× ${ingredient.name}`)
        .join(", ")
    }))
    .sort((a, b) => a.product.localeCompare(b.product, "de"));
}

export default function DataInspector({ normalized, rawData }) {
  const products = normalized?.products || [];
  const recipes = normalized?.recipes || [];
  const buildings = normalized?.buildings || [];
  const recipeGroups = useMemo(() => buildRecipeGroups(recipes), [recipes]);

  return (
    <section className="dataInspector">
      <div className="dataInspectorHeader panel">
        <div>
          <p className="eyebrow">Datenkontrolle</p>
          <h2>Normalisierte Tabellen</h2>
          <p>
            Diese Seite zeigt die Daten so, wie die Rechner sie aktuell verwenden würden.
            Erst wenn hier Produkt, Icon, Gebäude, Zeit und Rezepte stimmen, sollte der Produktionsrechner darauf aufbauen.
          </p>
        </div>

        <div className="dataInspectorStats">
          <span><strong>{products.length}</strong> Produkte</span>
          <span><strong>{buildings.length}</strong> Gebäude</span>
          <span><strong>{recipes.length}</strong> Rezeptzeilen</span>
          <span><strong>{recipeGroups.length}</strong> Gesamtrezepte</span>
        </div>
      </div>

      <details className="panel dataInspectorPanel" open>
        <summary>Produkte prüfen</summary>
        <div className="tableScroller">
          <table className="dataInspectorTable">
            <thead>
              <tr>
                <th>Produkt</th>
                <th>Gebäude</th>
                <th>Zeit</th>
                <th>Icon-URL</th>
                <th>Icon-Quelle</th>
                <th>Kategorie</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id || product.key}>
                  <td><strong>{product.name}</strong></td>
                  <td className={statusClass(product.building)}>{formatValue(product.building)}</td>
                  <td className={statusClass(product.timeMin)}>{formatValue(product.timeMin)} min</td>
                  <td className={statusClass(product.iconUrl)}>
                    {product.iconUrl ? <a href={product.iconUrl} target="_blank" rel="noreferrer">öffnen</a> : "—"}
                  </td>
                  <td>{formatValue(product.iconSource)}</td>
                  <td>{formatValue(product.categories)}</td>
                  <td><code>{product.id}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="panel dataInspectorPanel" open>
        <summary>Gesamtrezepte prüfen</summary>
        <div className="tableScroller">
          <table className="dataInspectorTable recipeSummaryTable">
            <thead>
              <tr>
                <th>Produkt</th>
                <th>Gesamtrezept</th>
                <th>Zutaten-Anzahl</th>
                <th>Produkt-Key</th>
              </tr>
            </thead>
            <tbody>
              {recipeGroups.map((group) => (
                <tr key={group.productKey}>
                  <td className={statusClass(group.product)}><strong>{formatValue(group.product)}</strong></td>
                  <td className={statusClass(group.ingredients.length)}>
                    <div className="recipeIngredientList">
                      {group.ingredients.map((ingredient) => (
                        <span key={`${group.productKey}-${ingredient.key || ingredient.name}`}>
                          <strong>{ingredient.amount}×</strong> {ingredient.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{group.ingredients.length}</td>
                  <td><code>{group.productKey}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="panel dataInspectorPanel">
        <summary>Gebäude prüfen</summary>
        <div className="tableScroller">
          <table className="dataInspectorTable">
            <thead>
              <tr>
                <th>Gebäude</th>
                <th>Slots</th>
                <th>Icon-URL</th>
                <th>Icon-Quelle</th>
                <th>Kategorie</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {buildings.map((building) => (
                <tr key={building.id || building.key}>
                  <td><strong>{building.name}</strong></td>
                  <td className={statusClass(building.slots)}>{formatValue(building.slots)}</td>
                  <td className={statusClass(building.iconUrl)}>
                    {building.iconUrl ? <a href={building.iconUrl} target="_blank" rel="noreferrer">öffnen</a> : "—"}
                  </td>
                  <td>{formatValue(building.iconSource)}</td>
                  <td>{formatValue(building.categories)}</td>
                  <td><code>{building.id}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="panel dataInspectorPanel">
        <summary>Einzelne Rezeptzeilen prüfen</summary>
        <div className="tableScroller">
          <table className="dataInspectorTable">
            <thead>
              <tr>
                <th>Produkt</th>
                <th>Zutat</th>
                <th>Menge</th>
                <th>Produkt-Key</th>
                <th>Zutat-Key</th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((recipe) => (
                <tr key={recipe.id || `${recipe.productKey}-${recipe.ingredientKey}`}>
                  <td className={statusClass(recipe.product)}><strong>{formatValue(recipe.product)}</strong></td>
                  <td className={statusClass(recipe.ingredient)}>{formatValue(recipe.ingredient)}</td>
                  <td>{formatValue(recipe.amount)}</td>
                  <td><code>{recipe.productKey}</code></td>
                  <td><code>{recipe.ingredientKey}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
