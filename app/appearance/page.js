"use client";

import { useEffect, useMemo, useState } from "react";
import "./appearance.css";

const defaultAppearance = {
  theme: "system",
  compactMode: true,
  cardScale: 100,
  textScale: 100,
  iconScale: 100,
  cornerRadius: 16,
  accent: "#46a171",
  panelOpacity: 94,
  showMeta: true,
  iconsOnly: false
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

  const effectiveTheme = useMemo(() => {
    if (appearance.theme !== "system") return appearance.theme;

    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }, [appearance.theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.dataset.iconsOnly = appearance.iconsOnly ? "true" : "false";
    document.documentElement.dataset.showMeta = appearance.showMeta ? "true" : "false";
    document.documentElement.style.setProperty("--green", appearance.accent);
    document.documentElement.style.setProperty("--card-scale", String(appearance.cardScale / 100));
    document.documentElement.style.setProperty("--text-scale", String(appearance.textScale / 100));
    document.documentElement.style.setProperty("--icon-scale", String(appearance.iconScale / 100));
    document.documentElement.style.setProperty("--panel-radius", `${appearance.cornerRadius}px`);
    document.documentElement.style.setProperty("--panel-opacity", String(appearance.panelOpacity / 100));
  }, [appearance, effectiveTheme]);

  function persistAppearance(nextAppearance) {
    localStorage.setItem("hayDayCalcAppearance", JSON.stringify(nextAppearance));
    window.dispatchEvent(
      new CustomEvent("hayDayCalcAppearanceChange", {
        detail: nextAppearance
      })
    );
  }

  function updateValue(key, value) {
    setAppearance((current) => {
      const nextAppearance = {
        ...current,
        [key]: value
      };

      persistAppearance(nextAppearance);
      return nextAppearance;
    });
    setSaved(false);
  }

  function saveAppearance() {
    persistAppearance(appearance);
    setSaved(true);
  }

  function resetAppearance() {
    setAppearance(defaultAppearance);
    persistAppearance(defaultAppearance);
    setSaved(true);
  }

  return (
    <main className="shell embedShell appearanceShell">
      <section className="panel compactPanel appearancePanel">
        <div className="panelStaticHeader">Optische Einstellungen</div>

        <div className="appearanceBody">
          <section className="appearanceSection">
            <h2>Theme</h2>
            <div className="appearanceSegment">
              {[
                { id: "light", label: "Light" },
                { id: "dark", label: "Dark" },
                { id: "system", label: "System" }
              ].map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={appearance.theme === theme.id ? "active" : ""}
                  onClick={() => updateValue("theme", theme.id)}
                >
                  {theme.label}
                </button>
              ))}
            </div>
          </section>

          <section className="appearanceSection">
            <h2>Darstellung</h2>

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
              <span>Textgröße: {appearance.textScale}%</span>
              <input
                type="range"
                min="85"
                max="125"
                step="5"
                value={appearance.textScale}
                onChange={(event) => updateValue("textScale", Number(event.target.value))}
              />
            </label>

            <label className="field compactField">
              <span>Icongröße: {appearance.iconScale}%</span>
              <input
                type="range"
                min="80"
                max="130"
                step="5"
                value={appearance.iconScale}
                onChange={(event) => updateValue("iconScale", Number(event.target.value))}
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

          </section>

          <section className="appearanceSection">
            <h2>Kacheln</h2>

            <label className="checkbox compactCheckbox singleCheckbox">
              <input
                type="checkbox"
                checked={appearance.showMeta}
                onChange={(event) => updateValue("showMeta", event.target.checked)}
              />
              Zusatzinfos auf Kacheln anzeigen
            </label>

            <label className="checkbox compactCheckbox singleCheckbox">
              <input
                type="checkbox"
                checked={appearance.iconsOnly}
                onChange={(event) => updateValue("iconsOnly", event.target.checked)}
              />
              Nur Icons anzeigen
            </label>
          </section>

          <div className={appearance.iconsOnly ? "appearancePreview iconsOnly" : "appearancePreview"}>
            <article className="visualItem">
              <span className="visualIcon large fallback">V</span>
              {!appearance.iconsOnly && (
                <>
                  <strong>3×</strong>
                  <span>Vorschau</span>
                  {appearance.showMeta && <small>Lv. 1 · 30 min</small>}
                </>
              )}
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
