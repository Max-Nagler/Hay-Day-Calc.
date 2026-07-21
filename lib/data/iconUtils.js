function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getProperty(properties, names) {
  const wanted = names.map(normalizeName);

  for (const [key, value] of Object.entries(properties || {})) {
    if (wanted.includes(normalizeName(key))) {
      return { key, value };
    }
  }

  return null;
}

function readTextFromProperty(property) {
  if (!property) return "";

  if (typeof property === "string") return property;

  if (property.type === "url") {
    return property.url || "";
  }

  if (property.type === "title") {
    return property.title?.map((item) => item.plain_text || "").join("").trim() || "";
  }

  if (property.type === "rich_text") {
    return property.rich_text?.map((item) => item.plain_text || "").join("").trim() || "";
  }

  if (property.type === "formula") {
    if (property.formula?.type === "string") return property.formula.string || "";
  }

  return "";
}

function readFileUrlFromProperty(property) {
  if (!property) return "";

  if (typeof property === "string") {
    return property.startsWith("http") ? property : "";
  }

  if (property.type === "url") {
    return property.url || "";
  }

  if (property.type === "files") {
    const first = property.files?.[0];
    if (!first) return "";

    if (first.type === "external") return first.external?.url || "";
    if (first.type === "file") return first.file?.url || "";

    return first.url || "";
  }

  const text = readTextFromProperty(property);
  if (text.startsWith("http")) return text;

  if (property.type === "rollup" && property.rollup?.type === "array") {
    for (const item of property.rollup.array || []) {
      const nestedUrl = readFileUrlFromProperty(item);
      if (nestedUrl) return nestedUrl;
    }
  }

  return "";
}

function readPageIcon(page) {
  const icon = page?.icon;

  if (!icon) return { url: "", source: "" };

  if (typeof icon === "string") {
    return { url: icon, source: "pageIcon:string" };
  }

  if (icon.type === "emoji") {
    return { url: icon.emoji || "", source: "pageIcon:emoji" };
  }

  if (icon.type === "external") {
    return { url: icon.external?.url || "", source: "pageIcon:external" };
  }

  if (icon.type === "file") {
    return { url: icon.file?.url || "", source: "pageIcon:file" };
  }

  return { url: "", source: "" };
}

const iconPropertyNames = [
  "Icon-Link",
  "Icon Link",
  "Icon",
  "Bild",
  "Bildlink",
  "Bild Link",
  "Image",
  "Produktbild",
  "Produkt Bild",
  "Picture",
  "Foto"
];

export function getIconInfo(page) {
  const properties = page?.properties || {};
  const explicitIconProperty = getProperty(properties, iconPropertyNames);

  if (explicitIconProperty) {
    const url = readFileUrlFromProperty(explicitIconProperty.value);

    if (url) {
      return {
        url,
        source: `property:${explicitIconProperty.key}`
      };
    }
  }

  const pageIcon = readPageIcon(page);

  if (pageIcon.url) {
    return pageIcon;
  }

  return {
    url: "",
    source: "fallback"
  };
}
