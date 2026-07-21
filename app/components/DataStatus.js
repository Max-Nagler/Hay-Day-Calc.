"use client";

export default function DataStatus({ isLoading, loadError, syncedAt }) {
  return (
    <div className="syncBox compactSync">
      <span className={loadError ? "dot warning" : "dot"} />
      <div>
        <strong>{isLoading ? "Lade Daten…" : loadError ? "Demo-Modus" : "Live-Daten"}</strong>
        <small>
          {loadError ||
            `Datenstand: ${
              syncedAt ? new Date(syncedAt).toLocaleString("de-DE") : "gerade geladen"
            }`}
        </small>
      </div>
    </div>
  );
}
