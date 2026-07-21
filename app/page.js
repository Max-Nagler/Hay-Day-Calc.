"use client";

import { useMemo, useState } from "react";
import CalculatorShell from "./components/CalculatorShell";
import { calculators, getCalculatorById } from "./calculators/registry";
import { useHayDayData } from "../lib/data/useHayDayData";

export default function Home() {
  const [activeCalculatorId, setActiveCalculatorId] = useState("data-inspector");
  const { rawData, normalized, isLoading, isRefreshing, loadError, refreshData } = useHayDayData();

  const activeCalculator = useMemo(
    () => getCalculatorById(activeCalculatorId),
    [activeCalculatorId]
  );

  const CalculatorComponent = activeCalculator.component;

  return (
    <CalculatorShell
      calculators={calculators}
      activeCalculatorId={activeCalculatorId}
      onCalculatorChange={setActiveCalculatorId}
      isLoading={isLoading}
      loadError={loadError}
      syncedAt={rawData?.syncedAt}
      isRefreshing={isRefreshing}
      onRefreshData={refreshData}
    >
      <CalculatorComponent normalized={normalized} rawData={rawData} />
    </CalculatorShell>
  );
}
