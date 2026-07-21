export function addToMap(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

export function mergeMaps(target, source) {
  for (const [key, amount] of source.entries()) {
    addToMap(target, key, amount);
  }
}
