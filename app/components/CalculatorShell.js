"use client";

import "./shell.css";
import DataStatus from "./DataStatus";

export default function CalculatorShell({
  calculators,
  activeCalculatorId,
  onCalculatorChange,
  isLoading,
  loadError,
  syncedAt,
  isRefreshing,
  onRefreshData,
  children
}) {
  const dataInspector = calculators.find((calculator) => calculator.id === "data-inspector");
  const calculatorTabs = calculators.filter((calculator) => calculator.id !== "data-inspector");

  return (
    <main className="shell compactShell">
      <section className="hero compactHero">
        <div>
          <p className="eyebrow">Hay Day Calc.</p>
          <h1>Rechner-Zentrale</h1>
          <p className="subtitle">
            Modulare Rechner für Produktionsplanung, Schiff-Bestellungen und zukünftige Hay-Day-Aufgaben.
          </p>
        </div>

        <div className="heroStatusActions">
          {dataInspector && (
            <button
              type="button"
              className={activeCalculatorId === dataInspector.id ? "dataInspectorQuickTab active" : "dataInspectorQuickTab"}
              onClick={() => onCalculatorChange(dataInspector.id)}
            >
              Datenprüfung
            </button>
          )}

          <DataStatus
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            loadError={loadError}
            syncedAt={syncedAt}
            onRefreshData={onRefreshData}
          />
        </div>
      </section>

      <section className="calculatorTabs panel compactPanel">
        {calculatorTabs.map((calculator) => (
          <button
            key={calculator.id}
            type="button"
            className={activeCalculatorId === calculator.id ? "active" : ""}
            onClick={() => onCalculatorChange(calculator.id)}
          >
            <strong>{calculator.label}</strong>
            <span>{calculator.description}</span>
          </button>
        ))}
      </section>

      {children}
    </main>
  );
}
