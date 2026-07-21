"use client";

export default function ProductIcon({ item, size = "normal" }) {
  const className = size === "large" ? "visualIcon large" : "visualIcon";

  if (item?.iconUrl) {
    return <img className={className} src={item.iconUrl} alt="" />;
  }

  const firstLetter = item?.name?.slice(0, 1) || "?";
  return <span className={`${className} fallback`}>{firstLetter}</span>;
}
