"use client";

export default function BuildingIcon({ item }) {
  if (item?.iconUrl) {
    return <img className="buildingVisualIcon" src={item.iconUrl} alt="" />;
  }

  const firstLetter = item?.name?.slice(0, 1) || "?";
  return <span className="buildingVisualIcon fallback">{firstLetter}</span>;
}
