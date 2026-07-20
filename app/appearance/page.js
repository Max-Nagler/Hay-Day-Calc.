"use client";

import { useEffect, useMemo, useState } from "react";
import "./appearance.css";

const colorPalettes = [
  { id: "hay", label: "Hay", colors: ["#f7f3e8", "#fffaf0", "#46a171", "#2783de", "#d5803b", "#e9c46a"] },
  { id: "mono", label: "Mono", colors: ["#f4f4f4", "#cfcfcf", "#8a8a8a", "#3f3f3f", "#111111", "#ffffff"] },
  { id: "berry", label: "Berry", colors: ["#f8d8f1", "#d98bd3", "#bf55bf", "#7b1f73", "#4b124a", "#f2b5d4"] },
  { id: "ocean", label: "Ocean", colors: ["#d9f4ff", "#84d4ed", "#18a0ce", "#0d5b78", "#0a3445", "#54d6c6"] },
  { id: "forest", label: "Forest", colors: ["#d8f3d0", "#8bd373", "#46a171", "#2d7a20", "#163f14", "#b6d957"] },
  { id: "sunset", label: "Sunset", colors: ["#fff0e3", "#f7bd99", "#ed6d2f", "#c64e12", "#7f2e0b", "#ffd166"] }
];

const paletteById = new Map(colorPalettes.map((palette) => [palette.id, palette]));

const defaultAppearance = {
  theme: "system",
  cardScale: 100,
  textScale: 100,
  iconScale: 100,
  palette: "hay",
  showMeta: true,
  iconsOnly: false
};

function normalizeAppearance(value) {
  const palette = paletteById.has(value.palette) ? value.palette : "hay";

  return {
    ...defaultAppearance,
    ...value,
    palette
  };
}

function readStoredAppearance() {
  if (typeof window === "undefined") return defaultAppearance;

  try {
    return normalizeAppearance(JSON.parse(localStorage.getItem("hayDayCalcAppearance") || "{}"));
  } catch {
    return defaultAppearance;
  }
}

function getEffectiveTheme(theme) {
  if (theme !== "system") return theme;

  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyAppearance(appearance, effectiveTheme) {
  const palette = paletteById.get(appearance.palette) || colorPalettes[0];

  document.documentElement.dataset.theme = effectiveTheme;
  document.documentElement.dataset.palette = palette.id;
  document.documentElement.dataset.iconsOnly = appearance.iconsOnly ? "true" : "false";
  document.documentElement.dataset.showMeta = appearance.showMeta ? "true" : "false";
  document.documentElement.style.setProperty("--canvas", palette.colors[0]);
  document.documentElement.style.setProperty("--surface", palette.colors[1]);
  document.documentElement.style.setProperty("--green", palette.colors[2]);
  document.documentElement.style.setProperty("--blue", palette.colors[3]);
  document.documentElement.style.setProperty("--orange", palette.colors[4]);
  document.documentElement.style.setProperty("--accent-extra", palette.colors[5]);
  document.documentElement.style.setProperty("--card-scale", String(appearance.cardScale / 100));
  document.documentElement.style.setProperty("--text-scale", String(appearance.textScale / 100));
  document.documentElement.style.setProperty("--icon-scale", String(appearance.iconScale / 100));
}

export default function AppearanceSettings() {
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAppearance(readStoredAppearance());
  }, []);

  const effectiveTheme = useMemo(() => getEffectiveTheme(appearance.theme), [appearance.theme]);

  useEffect(() => {
    applyAppearance(appearance, effectiveTheme);
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
      const nextAppearance = normalizeAppearance({
        ...current,
        [key]: value
      });

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
          <div className="appearanceControls">
            <section className="appearanceSection themeSection">
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
            </section>

            <section className="appearanceSection">
              <h2>Kacheln</h2>

              <label className="checkbox compactCheckbox singleCheckbox">
                <input
                  type="checkbox"
                  checked={appearance.showMeta}
                  onChange={(event) => updateValue("showMeta", event.target.checked)}
                />
                Zusatzinfos anzeigen
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
          </div>

          <section className="appearanceSection paletteSection">
            <h2>Design-Farbkombination</h2>
            <div className="paletteGrid">
              {colorPalettes.map((palette) => (
                <button
                  key={palette.id}
                  type="button"
                  className={appearance.palette === palette.id ? "paletteOption active" : "paletteOption"}
                  onClick={() => updateValue("palette", palette.id)}
                  title={palette.label}
                >
                  <span className="paletteName">{palette.label}</span>
                  <span className="paletteSwatches">
                    {palette.colors.map((color) => (
                      <span key={color} style={{ background: color }} />
                    ))}
                  </span>
                </button>
              ))}
            </div>
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
