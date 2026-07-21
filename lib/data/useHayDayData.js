"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeData } from "../normalize";

const fallbackRawData = {
  ok: true,
  syncedAt: null,
  mainDatabase: [],
  recipeDatabase: []
};

export function useHayDayData() {
  const [rawData, setRawData] = useState(fallbackRawData);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function loadData({ silent = false } = {}) {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      setLoadError("");

      const response = await fetch(`/api/data?ts=${Date.now()}`, {
        cache: "no-store"
      });

      const json = await response.json();

      if (!json.ok) {
        throw new Error(json.error || "API konnte nicht geladen werden.");
      }

      setRawData(json);
    } catch {
      setLoadError(
        "Demo-Daten aktiv. Echte Notion-Daten werden genutzt, sobald die API bereit ist."
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const normalized = useMemo(() => normalizeData(rawData), [rawData]);

  return {
    rawData,
    normalized,
    isLoading,
    isRefreshing,
    loadError,
    refreshData: () => loadData({ silent: true })
  };
}
