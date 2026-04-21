/**
 * carbonCalculator.js
 * Carbon emissions and KPI calculation engine for JNPA Digital Twin.
 * Implements JNPA RFP Section VIII emissions formula and all 12 KPI metrics.
 */

/**
 * Carbon emission formula per RFP Section VIII.
 * carbonTons = vesselWaitHours * vesselType.emissionRatePerHour
 * @param {number} waitHours
 * @param {number} emissionRate - tons CO2 per hour at anchorage
 * @returns {number} CO2 tons
 */
export function calcVesselEmissions(waitHours, emissionRate = 2.2) {
  return parseFloat((waitHours * emissionRate).toFixed(2));
}

/**
 * Classify carbon index based on total hourly emissions.
 * @param {number} totalEmissionsPerHour
 * @returns {'LOW'|'MODERATE'|'HIGH'}
 */
function classifyCarbonIndex(totalEmissionsPerHour) {
  if (totalEmissionsPerHour > 80) return 'HIGH';
  if (totalEmissionsPerHour > 40) return 'MODERATE';
  return 'LOW';
}

/**
 * Gate congestion aggregate across all gates.
 * @param {Gate[]} gates
 * @returns {'LOW'|'MEDIUM'|'HIGH'}
 */
function aggregateGateCongestion(gates) {
  const highCount = gates.filter(g => g.congestionLevel === 'HIGH' || g.status === 'CLOSED').length;
  const medCount = gates.filter(g => g.congestionLevel === 'MEDIUM').length;
  if (highCount >= 1) return 'HIGH';
  if (medCount >= 2) return 'MEDIUM';
  return 'LOW';
}

/**
 * Calculate average vessel turnaround time (TAT).
 * TAT = time from pilot boarding to last line let go.
 * Approximated from vessel lifecycle stages.
 * @param {Vessel[]} vessels
 * @returns {number} Hours
 */
function calcAvgTAT(vessels) {
  const completed = vessels.filter(v => ['LOADING', 'DEPARTING'].includes(v.lifecycleState));
  if (!completed.length) return 18.4;
  const avg = completed.reduce((sum, v) => sum + v.waitHours + 12, 0) / completed.length;
  return parseFloat(avg.toFixed(1));
}

/**
 * Calculate pre-berthing detention time.
 * Pre-berthing detention = time vessel waits at anchorage before berth assigned.
 * @param {Vessel[]} vessels
 * @param {SimulationFlags} flags
 * @returns {number} Hours
 */
function calcPreBerthingDetention(vessels, flags) {
  const anchored = vessels.filter(v => v.lifecycleState === 'ANCHORED');
  if (!anchored.length) return 1.8;
  const base = anchored.reduce((sum, v) => sum + v.waitHours, 0) / anchored.length;
  const bunchingMultiplier = flags?.bunchingActive ? 2.1 : 1;
  return parseFloat((base * bunchingMultiplier).toFixed(1));
}

/**
 * Calculate berth occupancy percentage.
 * Total berths at JNPA: ~23 (NSICT + JNPCT + GTI + CFS).
 * @param {Vessel[]} vessels
 * @returns {number} Percentage 0-100
 */
function calcBerthOccupancy(vessels) {
  const TOTAL_BERTHS = 23;
  const occupied = vessels.filter(v => ['BERTHING', 'LOADING'].includes(v.lifecycleState)).length;
  return Math.min(100, parseFloat(((occupied / TOTAL_BERTHS) * 100).toFixed(1)));
}

/**
 * Calculate crane moves per hour.
 * JNPA target: ~35-40 moves/crane/hour for container terminals.
 * @param {Vessel[]} vessels
 * @returns {number}
 */
function calcCraneMoves(vessels) {
  const loading = vessels.filter(v => v.lifecycleState === 'LOADING').length;
  return Math.max(0, Math.round(28 + loading * 4 + Math.random() * 6));
}

/**
 * Generate 24-hour history array for sparklines.
 * @param {number} currentValue
 * @param {number} variance
 * @param {number} [points=24]
 * @returns {number[]}
 */
export function generateHistory(currentValue, variance, points = 24) {
  const history = [];
  let val = currentValue;
  for (let i = points; i >= 0; i--) {
    val = Math.max(0, val + (Math.random() - 0.5) * variance);
    history.unshift(parseFloat(val.toFixed(1)));
  }
  history[history.length - 1] = currentValue;
  return history;
}

/**
 * Calculate all 12 KPI metrics from current simulation state.
 * @param {Vessel[]} vessels
 * @param {Gate[]} gates
 * @param {Truck[]} trucks
 * @param {SimulationFlags} [flags]
 * @returns {KPIs}
 */
export function calculateKPIs(vessels, gates, trucks, flags = {}) {
  const avgTAT = calcAvgTAT(vessels);
  const preBerthingDetention = calcPreBerthingDetention(vessels, flags);
  const berthOccupancy = calcBerthOccupancy(vessels);
  const trucksInGeoFence = trucks.length;
  const gateCongestionLevel = aggregateGateCongestion(gates);

  // Total emissions from anchored vessels per hour
  const anchoredEmissions = vessels
    .filter(v => v.lifecycleState === 'ANCHORED')
    .reduce((sum, v) => sum + v.emissionsRate, 0);
  const carbonIndex = classifyCarbonIndex(anchoredEmissions + (flags?.truckSurge || 0) * 0.1);

  // DPD/DPE - Direct Port Delivery/Entry percentages (JNPA targets ~40-55%)
  const dpdPercent = Math.max(
    20,
    Math.min(70, 42 + Math.random() * 10 - (flags?.truckSurge || 0) * 0.1)
  );
  const dpePercent = Math.max(
    15,
    Math.min(65, 38 + Math.random() * 8 - (flags?.truckSurge || 0) * 0.08)
  );

  return {
    avgVesselTAT: avgTAT,
    preBerthingDetention,
    berthOccupancy,
    avgImportDwellTime: parseFloat((18 + Math.random() * 6).toFixed(1)),
    avgExportDwellTime: parseFloat((24 + Math.random() * 8).toFixed(1)),
    dpdPercent: parseFloat(dpdPercent.toFixed(1)),
    dpePercent: parseFloat(dpePercent.toFixed(1)),
    gateCongestionLevel,
    trucksInGeoFence,
    carbonIndex,
    craneMoves: calcCraneMoves(vessels),
    pilotPerformanceTime: parseFloat((1.2 + Math.random() * 0.8).toFixed(1)),

    // 24-hour history for sparklines
    history: {
      avgVesselTAT: generateHistory(avgTAT, 3),
      preBerthingDetention: generateHistory(preBerthingDetention, 0.8),
      berthOccupancy: generateHistory(berthOccupancy, 8),
      trucksInGeoFence: generateHistory(trucksInGeoFence, 20),
      craneMoves: generateHistory(calcCraneMoves(vessels), 5),
    },
  };
}
