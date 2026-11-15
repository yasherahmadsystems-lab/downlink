// Link budget. Pure functions.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.

const dB = (x) => 10 * Math.log10(x);

/** Free-space path loss in dB (distance in km, frequency in MHz). */
export function pathLossDb(distanceKm, freqMhz) {
  return 32.45 + 20 * Math.log10(distanceKm) + 20 * Math.log10(freqMhz);
}

/**
 * Downlink margin in dB: how far the received signal sits above what the data
 * rate needs. Standard link equation:
 *   Eb/N0 = Pt + Gt + Gr - path loss - losses - k - 10log(Ts) - 10log(rate)
 *   margin = Eb/N0 - required Eb/N0
 */
export function linkMarginDb({ txPowerW, txGainDbi, rxGainDbi, noiseTempK, rateBps, distanceKm, freqMhz, lossesDb, requiredEbN0Db, boltzmann }) {
  const ebn0 =
    dB(txPowerW) + txGainDbi + rxGainDbi - pathLossDb(distanceKm, freqMhz) - lossesDb - boltzmann - dB(noiseTempK) - dB(rateBps);
  return ebn0 - requiredEbN0Db;
}
