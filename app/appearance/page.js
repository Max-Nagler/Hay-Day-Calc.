"use client";

import { useEffect, useState } from "react";

const defaultAppearance = {
  compactMode: true,
  cardScale: 100,
  cornerRadius: 16,
  accent: "#46a171",
  panelOpacity: 94,
  showMeta: true
};

function readStoredAppearance() {
  if (typeof window === "undefined") return defaultAppearance;

  try {
    const stored = JSON.parse(localStorage.getItem("hayDayCalcAppearance") || "{}");
    return {
      ...defaultAppearance,
      ...stored
    };
  } catch {
    return defaultAppearance;
  }
}

export default function AppearanceSettings() {
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAppearance(readStoredAppearance());
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--green", appearance.accent);
    document.documentElement.style.setProperty("--card-scale", String(appearance.cardScale / 100));
    document.documentElement.style.setProperty("--panel-radius", `${appearance.cornerRadius}px`);
    document.documentElement.style.setProperty("--panel-opacity", String(appearance.panelOpacity / 100));
  }, [appearance]);

  function updateValue(key, value) {
    setAppearance((current) => ({
      ...current,
      [key]: value
    }));
    setSaved(false);
  }

  function saveAppearance() {
    localStorage.setItem("hayDayCalcAppearance", JSON.stringify(appearance));
    setSaved(true);
  }

  function resetAppearance() {
    setAppearance(defaultAppearance);
    localStorage.setItem("hayDayCalcAppearance", JSON.stringify(defaultAppearance));
    setSaved(true);
  }

  return (
    <main className="shell embedShell appearanceShell">
      <section className="panel compactPanel appearancePanel">
        <div className="panelStaticHeader">Optische Einstellungen</div>

        <div className="appearanceBody">
          <label className="field compactField">
            <span>Akzentfarbe</span>
            <input
              type="color"
              value={appearance.accent}
              onChange={(event) => updateValue("accent", event.target.value)}
            />
          </label>

          <label className="field compactField">
            <span>Kachelgröße: {appearance.cardScale}%</span>
            <input
              type="range"
              min="85"
              max="120"
              step="5"
              value={appearance.cardScale}
              onChange={(event) => updateValue("cardScale", Number(event.target.value))}
            />
          </label>

          <label className="field compactField">
            <span>Rundung: {appearance.cornerRadius}px</span>
            <input
              type="range"
              min="8"
              max="24"
              step="1"
              value={appearance.cornerRadius}
              onChange={(event) => updateValue("cornerRadius", Number(event.target.value))}
            />
          </label>

          <label className="field compactField">
            <span>Panel-Deckkraft: {appearance.panelOpacity}%</span>
            <input
              type="range"
              min="70"
              max="100"
              step="1"
              value={appearance.panelOpacity}
              onChange={(event) => updateValue("panelOpacity", Number(event.target.value))}
            />
          </label>

          <label className="checkbox compactCheckbox singleCheckbox">
            <input
              type="checkbox"
              checked={appearance.compactMode}
              onChange={(event) => updateValue("compactMode", event.target.checked)}
            />
            Kompakter Modus
          </label>

          <label className="checkbox compactCheckbox singleCheckbox">
            <input
              type="checkbox"
              checked={appearance.showMeta}
              onChange={(event) => updateValue("showMeta", event.target.checked)}
            />
            Zusatzinfos auf Kacheln anzeigen
          </label>

          <div className="appearancePreview">
            <article className="visualItem">
              <span className="visualIcon large fallback">V</span>
              <strong>3×</strong>
              <span>Vorschau</span>
              {appearance.showMeta && <small>Lv. 1 · 30 min</small>}
            </article>
          </div>

          <div className="appearanceActions">
            <button type="button" onClick={saveAppearance}>
              Speichern
            </button>
            <button type="button" onClick={resetAppearance}>
              Zurücksetzen
            </button>
          </div>

          {saved && <p className="helperText inlineHelper">Gespeichert.</p>}
        </div>
      </section>
    </main>
  );
}
