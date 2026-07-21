"use client";

export default function ProductIcon({ item, size = "normal" }) {
  const className = size === "large" ? "visualIcon large" : "visualIcon";

  if (item?.iconUrl) {
    return <img className={className} src={item.iconUrl} alt="" title={item.iconSource || "Icon"} />;
  }

  const firstLetter = item?.name?.slice(0, 1) || "?";
  return <span className={`${className} fallback`} title={item?.iconSource || "Kein Icon gefunden"}>{firstLetter}</span>;
}
