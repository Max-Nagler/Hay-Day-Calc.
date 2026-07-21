"use client";

export default function BuildingIcon({ item }) {
  if (item?.iconUrl) {
    return <img className="buildingVisualIcon" src={item.iconUrl} alt="" title={item.iconSource || "Icon"} />;
  }

  const firstLetter = item?.name?.slice(0, 1) || "?";
  return <span className="buildingVisualIcon fallback" title={item?.iconSource || "Kein Icon gefunden"}>{firstLetter}</span>;
}
