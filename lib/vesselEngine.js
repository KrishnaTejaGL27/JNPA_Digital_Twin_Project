/**
 * vesselEngine.js
 * Vessel lifecycle state machine for JNPA Digital Twin.
 * Manages vessel positions, states, and realistic maritime data.
 *
 * JNPA anchorage area is offshore in the Arabian Sea (18.85-18.90°N, 72.75-72.85°E).
 * Berths are at the terminal (18.94-18.96°N, 72.94-72.98°E).
 */

const VESSEL_NAMES = [
  'MSC GAIA', 'EVER GIVEN', 'COSCO SHIPPING', 'MAERSK EMERALD',
  'APL TURQUOISE', 'CMA CGM MARCO POLO', 'ONE INNOVATION', 'YANG MING WITNESS',
  'HAPAG-LLOYD BERLIN', 'ZIM SAMMY OFER', 'MITSUI VOYAGER', 'OOCL HONG KONG',
  'TRIUMPH OF THE SEA', 'JNPA CARRIER', 'MUMBAI EXPRESS', 'GUJARAT TRADER',
  'KONKAN STAR', 'ARABINDA', 'VINDHYAGIRI', 'CHENNAI GATEWAY',
];

const VESSEL_TYPES = [
  { type: 'CONTAINER', emissionRatePerHour: 2.8, dwt: 65000 },
  { type: 'BULK_CARRIER', emissionRatePerHour: 1.9, dwt: 45000 },
  { type: 'TANKER', emissionRatePerHour: 2.2, dwt: 55000 },
  { type: 'RO_RO', emissionRatePerHour: 1.5, dwt: 25000 },
];

let vesselIdCounter = 1;

/**
 * Anchorage positions — offshore JNPA anchorage area in Arabian Sea.
 * @returns {{ lat: number, lng: number }}
 */
function anchoragePosition() {
  return {
    lat: 18.85 + Math.random() * 0.05,
    lng: 72.76 + Math.random() * 0.06,
  };
}

/**
 * Berth positions — along JNPA terminal quayside.
 * @returns {{ lat: number, lng: number }}
 */
function berthPosition() {
  return {
    lat: 18.943 + Math.random() * 0.015,
    lng: 72.944 + Math.random() * 0.02,
  };
}

/**
 * Approaching positions — 10-15 nautical miles out from JNPA.
 * @returns {{ lat: number, lng: number }}
 */
function approachingPosition() {
  return {
    lat: 18.80 + Math.random() * 0.04,
    lng: 72.68 + Math.random() * 0.06,
  };
}

/**
 * Get a random unique vessel name.
 * @param {number} index
 * @returns {string}
 */
function getVesselName(index) {
  return VESSEL_NAMES[index % VESSEL_NAMES.length];
}

/**
 * Get position for a vessel based on its lifecycle state.
 * @param {string} lifecycleState
 * @returns {{ lat: number, lng: number }}
 */
function positionForState(lifecycleState) {
  switch (lifecycleState) {
    case 'APPROACHING': return approachingPosition();
    case 'ANCHORED': return anchoragePosition();
    case 'BERTHING':
    case 'LOADING':
    case 'DEPARTING': return berthPosition();
    default: return approachingPosition();
  }
}

/**
 * Generate a single vessel with realistic JNPA-domain values.
 * @param {string} [forceState] - Optional forced lifecycle state
 * @param {number} [index] - Index for name selection
 * @returns {Vessel}
 */
export function generateVessel(forceState = null, index = 0) {
  const vesselType = VESSEL_TYPES[Math.floor(Math.random() * VESSEL_TYPES.length)];
  const states = ['APPROACHING', 'ANCHORED', 'BERTHING', 'LOADING', 'DEPARTING'];
  const lifecycleState = forceState || states[Math.floor(Math.random() * (states.length - 1))];

  const now = Date.now();
  const etaOffsetMs = {
    APPROACHING: (2 + Math.random() * 8) * 3600000,
    ANCHORED: (0.5 + Math.random() * 3) * 3600000,
    BERTHING: (0 + Math.random() * 1) * 3600000,
    LOADING: (-2 - Math.random() * 4) * 3600000,
    DEPARTING: (-6 - Math.random() * 8) * 3600000,
  };

  const waitHoursMap = {
    APPROACHING: 0,
    ANCHORED: Math.random() * 4 + 0.5,
    BERTHING: Math.random() * 2 + 1,
    LOADING: Math.random() * 6 + 4,
    DEPARTING: Math.random() * 2,
  };

  const id = `V${String(vesselIdCounter++).padStart(3, '0')}`;

  return {
    id,
    name: getVesselName(index + vesselIdCounter),
    type: vesselType.type,
    dwt: vesselType.dwt + Math.floor(Math.random() * 10000),
    position: positionForState(lifecycleState),
    lifecycleState,
    eta: new Date(now + (etaOffsetMs[lifecycleState] || 0)).toISOString(),
    waitHours: parseFloat((waitHoursMap[lifecycleState] || 0).toFixed(1)),
    emissionsRate: vesselType.emissionRatePerHour,
    pilotAssigned: ['BERTHING', 'LOADING', 'DEPARTING'].includes(lifecycleState),
    berthNumber: ['BERTHING', 'LOADING', 'DEPARTING'].includes(lifecycleState)
      ? `B${Math.floor(Math.random() * 8) + 1}`
      : null,
    flag: ['IN', 'SG', 'HK', 'PA', 'MH', 'BS'][Math.floor(Math.random() * 6)],
    ticksInState: 0,
  };
}

/**
 * Generate an initial fleet of vessels for JNPA simulation.
 * @param {number} [count=10] - Number of vessels to generate
 * @param {string} [forceState] - Optional state to force all vessels into
 * @returns {Vessel[]}
 */
export function generateInitialVessels(count = 10, forceState = null) {
  return Array.from({ length: count }, (_, i) => generateVessel(forceState, i));
}

/**
 * Get the color code for a vessel lifecycle state (used for map markers).
 * @param {string} lifecycleState
 * @returns {string} Hex color
 */
export function getVesselStateColor(lifecycleState) {
  const colors = {
    APPROACHING: '#3b82f6',  // blue
    ANCHORED: '#eab308',     // yellow
    BERTHING: '#f97316',     // orange
    LOADING: '#22c55e',      // green
    DEPARTING: '#94a3b8',    // slate/grey
  };
  return colors[lifecycleState] || '#94a3b8';
}
