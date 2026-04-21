/**
 * gateEngine.js
 * Gate queue and congestion rule engine for JNPA Digital Twin.
 * Models 4 operational gates at JNPA Navi Mumbai.
 * Gate 4/5 = Export gate near NH-348 (Karal Phata approach road).
 */

/**
 * JNPA gate locations (approximate coordinates).
 * Gates are positioned along the JNPA approach roads near Uran, Navi Mumbai.
 */
const GATE_LOCATIONS = {
  1: { lat: 18.9520, lng: 72.9640, name: 'Gate 1 - Import (North)' },
  2: { lat: 18.9480, lng: 72.9680, name: 'Gate 2 - Export (North)' },
  3: { lat: 18.9400, lng: 72.9720, name: 'Gate 3 - Import (South)' },
  4: { lat: 18.9360, lng: 72.9700, name: 'Gate 4 - Export (South)' },
};

/**
 * Compute congestion level string from queue length.
 * @param {number} queueLength
 * @param {string} status
 * @returns {'LOW'|'MEDIUM'|'HIGH'}
 */
export function getCongestionLevel(queueLength, status) {
  if (status === 'CLOSED') return 'HIGH';
  if (queueLength >= 50) return 'HIGH';
  if (queueLength >= 25) return 'MEDIUM';
  return 'LOW';
}

/**
 * Generate initial gate state for all 4 JNPA gates.
 * @returns {Gate[]}
 */
export function generateInitialGates() {
  return [
    {
      id: 1,
      ...GATE_LOCATIONS[1],
      status: 'OPEN',
      queueLength: 18,
      congestionLevel: 'LOW',
      trucksTodayProcessed: 412,
      avgProcessingTimeMins: 4.2,
      lastUpdated: new Date().toISOString(),
    },
    {
      id: 2,
      ...GATE_LOCATIONS[2],
      status: 'OPEN',
      queueLength: 32,
      congestionLevel: 'MEDIUM',
      trucksTodayProcessed: 387,
      avgProcessingTimeMins: 3.8,
      lastUpdated: new Date().toISOString(),
    },
    {
      id: 3,
      ...GATE_LOCATIONS[3],
      status: 'OPEN',
      queueLength: 22,
      congestionLevel: 'LOW',
      trucksTodayProcessed: 298,
      avgProcessingTimeMins: 4.5,
      lastUpdated: new Date().toISOString(),
    },
    {
      id: 4,
      ...GATE_LOCATIONS[4],
      status: 'OPEN',
      queueLength: 15,
      congestionLevel: 'LOW',
      trucksTodayProcessed: 201,
      avgProcessingTimeMins: 3.2,
      lastUpdated: new Date().toISOString(),
    },
  ];
}

/**
 * Recalculate congestion levels for all gates based on current queue lengths.
 * @param {Gate[]} gates
 * @returns {Gate[]}
 */
export function recalcGateCongestion(gates) {
  return gates.map(gate => ({
    ...gate,
    congestionLevel: getCongestionLevel(gate.queueLength, gate.status),
    lastUpdated: new Date().toISOString(),
  }));
}

/**
 * Simulate natural queue drain — every minute a gate processes ~3-5 trucks.
 * @param {Gate[]} gates
 * @returns {Gate[]}
 */
export function drainGateQueues(gates) {
  return gates.map(gate => {
    if (gate.status === 'CLOSED') return gate;
    const drain = Math.floor(Math.random() * 3) + 2;
    const inflow = Math.floor(Math.random() * 4) + 1;
    const newQueue = Math.max(0, gate.queueLength - drain + inflow);
    return {
      ...gate,
      queueLength: newQueue,
      congestionLevel: getCongestionLevel(newQueue, gate.status),
    };
  });
}
