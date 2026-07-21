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

        <DataStatus
          isLoading={isLoading}
          isRefreshing={isRefreshing}
          loadError={loadError}
          syncedAt={syncedAt}
          onRefreshData={onRefreshData}
        />
      </section>

      <section className="calculatorTabs panel compactPanel">
        {calculators.map((calculator) => (
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
