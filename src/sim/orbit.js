// Circular-orbit helpers. Pure functions, no state.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.

/** Orbital period in minutes for a circular orbit. */
export function periodMinutes(altitudeKm, gm, radiusKm) {
  const a = radiusKm + altitudeKm;
  return (2 * Math.PI * Math.sqrt(a ** 3 / gm)) / 60;
}

/** Orbital speed in km/s for a circular orbit. */
export function speedKmS(altitudeKm, gm, radiusKm) {
  return Math.sqrt(gm / (radiusKm + altitudeKm));
}

/**
 * Worst-case fraction of each orbit spent in Earth's shadow (Sun in the orbit
 * plane, cylindrical shadow).
 */
export function eclipseFraction(altitudeKm, radiusKm) {
  return Math.asin(radiusKm / (radiusKm + altitudeKm)) / Math.PI;
}

/** Distance to a ground station seen at the given elevation angle, km. */
export function slantRangeKm(altitudeKm, radiusKm, elevationDeg) {
  const e = (elevationDeg * Math.PI) / 180;
  const r = radiusKm + altitudeKm;
  return Math.sqrt(r * r - (radiusKm * Math.cos(e)) ** 2) - radiusKm * Math.sin(e);
}
