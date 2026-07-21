"use client";

export default function DataStatus({ isLoading, isRefreshing, loadError, syncedAt, onRefreshData }) {
  const busy = isLoading || isRefreshing;

  return (
    <div className="syncBox compactSync">
      <span className={loadError ? "dot warning" : "dot"} />
      <div>
        <strong>{isLoading ? "Lade Daten…" : loadError ? "Demo-Modus" : isRefreshing ? "Aktualisiere…" : "Live-Daten"}</strong>
        <small>
          {loadError ||
            `Datenstand: ${
              syncedAt ? new Date(syncedAt).toLocaleString("de-DE") : "gerade geladen"
            }`}
        </small>
      </div>

      <button
        type="button"
        className="syncRefreshButton"
        onClick={onRefreshData}
        disabled={busy || !onRefreshData}
        title="Verwendete Daten neu laden"
      >
        {isRefreshing ? "…" : "↻"}
      </button>
    </div>
  );
}
