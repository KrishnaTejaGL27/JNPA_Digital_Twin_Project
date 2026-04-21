/**
 * simulationStore.js
 * Server-side singleton simulation state for JNPA Digital Twin ICCC.
 * All API routes share this single in-memory state object.
 * Vessels, gates, trucks, KPIs, and alerts are all tracked here.
 */

import { generateInitialVessels } from './vesselEngine.js';
import { generateInitialGates } from './gateEngine.js';
import { generateInitialTrucks } from './mockDataGen.js';
import { checkAllAlerts } from './alertEngine.js';
import { calculateKPIs } from './carbonCalculator.js';

/** @type {SimulationState} */
let state = null;
let tickInterval = null;

/**
 * Initialize or return the singleton simulation state.
 * @returns {SimulationState}
 */
export function getSimulationState() {
  if (!state) {
    state = createInitialState();
    startTickEngine();
  }
  return state;
}

/**
 * Create a fresh baseline simulation state with realistic JNPA data.
 * @returns {SimulationState}
 */
function createInitialState() {
  // Keep simulation fallback visually dense to match live-mode UX expectations.
  const vessels = generateInitialVessels(80);
  const gates = generateInitialGates();
  const trucks = generateInitialTrucks();
  const kpis = calculateKPIs(vessels, gates, trucks);
  const alerts = checkAllAlerts({ vessels, gates, trucks, kpis, alerts: [] });

  return {
    vessels,
    gates,
    trucks,
    kpis,
    alerts,
    simulationFlags: {
      gateClosures: [],
      extraVessels: 0,
      truckSurge: 0,
      bunchingActive: false,
    },
    lastUpdated: Date.now(),
  };
}

/**
 * Start the background tick engine — advances vessel states every 30 seconds.
 */
function startTickEngine() {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    if (!state) return;
    tickSimulation();
  }, 30000);
}

/**
 * Advance the simulation by one tick — move vessels through their lifecycle,
 * recalculate KPIs, and re-evaluate alerts.
 */
function tickSimulation() {
  if (!state) return;
  const TARGET_VESSEL_COUNT = 80;

  // Advance vessel states
  state.vessels = state.vessels.map(v => advanceVesselState(v));

  // Remove vessels that have fully departed
  state.vessels = state.vessels.filter(v => v.lifecycleState !== 'REMOVED');

  // Maintain a stable fallback fleet size for map/dashboard display.
  if (state.vessels.length < TARGET_VESSEL_COUNT) {
    const { generateInitialVessels } = require('./vesselEngine.js');
    state.vessels.push(...generateInitialVessels(TARGET_VESSEL_COUNT - state.vessels.length));
  }

  // Fluctuate truck count slightly
  state.trucks = fluctuateTrucks(state.trucks);

  // Recalculate KPIs
  state.kpis = calculateKPIs(state.vessels, state.gates, state.trucks, state.simulationFlags);

  // Re-evaluate alert conditions
  const newAlerts = checkAllAlerts(state);
  // Merge — keep dismissed alerts, add new ones
  const existingIds = new Set(state.alerts.map(a => a.id));
  for (const alert of newAlerts) {
    if (!existingIds.has(alert.id)) {
      state.alerts.unshift(alert);
    }
  }

  // Cap alert history at 50
  state.alerts = state.alerts.slice(0, 50);
  state.lastUpdated = Date.now();
}

/**
 * Advance a single vessel through its lifecycle state machine.
 * APPROACHING → ANCHORED → BERTHING → LOADING → DEPARTING → REMOVED
 * @param {Vessel} vessel
 * @returns {Vessel}
 */
function advanceVesselState(vessel) {
  const transitions = {
    APPROACHING: { next: 'ANCHORED', minTicks: 3 },
    ANCHORED: { next: 'BERTHING', minTicks: 4 },
    BERTHING: { next: 'LOADING', minTicks: 2 },
    LOADING: { next: 'DEPARTING', minTicks: 6 },
    DEPARTING: { next: 'REMOVED', minTicks: 2 },
  };

  const t = transitions[vessel.lifecycleState];
  if (!t) return vessel;

  vessel.ticksInState = (vessel.ticksInState || 0) + 1;
  if (vessel.ticksInState >= t.minTicks + Math.floor(Math.random() * 3)) {
    vessel.lifecycleState = t.next;
    vessel.ticksInState = 0;
    vessel.waitHours = vessel.lifecycleState === 'ANCHORED' ? vessel.waitHours + 1 : vessel.waitHours;
  }

  // Drift position slightly
  vessel.position = {
    lat: vessel.position.lat + (Math.random() - 0.5) * 0.001,
    lng: vessel.position.lng + (Math.random() - 0.5) * 0.001,
  };

  return vessel;
}

/**
 * Slightly fluctuate truck count to simulate real movement.
 * @param {Truck[]} trucks
 * @returns {Truck[]}
 */
function fluctuateTrucks(trucks) {
  const delta = Math.floor(Math.random() * 5) - 2;
  if (delta > 0) {
    const { generateTruck } = require('./mockDataGen.js');
    for (let i = 0; i < delta; i++) trucks.push(generateTruck());
  } else if (delta < 0 && trucks.length > 20) {
    trucks = trucks.slice(0, trucks.length + delta);
  }
  return trucks;
}

/**
 * Apply a simulation action and return the updated state + triggered alerts.
 * @param {string} action
 * @param {object} payload
 * @returns {{ updatedState: SimulationState, triggeredAlerts: Alert[] }}
 */
export function applySimulationAction(action, payload = {}) {
  if (!state) getSimulationState();

  const { generateInitialVessels } = require('./vesselEngine.js');
  const { generateTruck } = require('./mockDataGen.js');

  switch (action) {
    case 'CLOSE_GATE': {
      const gateId = payload.gateId || 3;
      state.gates = state.gates.map(g =>
        g.id === gateId ? { ...g, status: 'CLOSED', queueLength: 0 } : g
      );
      state.simulationFlags.gateClosures = [
        ...state.simulationFlags.gateClosures.filter(id => id !== gateId),
        gateId,
      ];
      // Redistribute queue to other gates
      const closedQueue = state.gates.find(g => g.id === gateId)?.queueLength || 30;
      state.gates = state.gates.map(g =>
        g.id !== gateId && g.status !== 'CLOSED'
          ? { ...g, queueLength: g.queueLength + Math.ceil(closedQueue / 2) }
          : g
      );
      break;
    }

    case 'OPEN_GATE': {
      const gateId = payload.gateId || 3;
      state.gates = state.gates.map(g =>
        g.id === gateId ? { ...g, status: 'OPEN', queueLength: 10 } : g
      );
      state.simulationFlags.gateClosures = state.simulationFlags.gateClosures.filter(id => id !== gateId);
      break;
    }

    case 'ADD_VESSELS': {
      const count = payload.count || 3;
      const newVessels = generateInitialVessels(count, 'APPROACHING');
      state.vessels = [...state.vessels, ...newVessels];
      state.simulationFlags.extraVessels += count;
      break;
    }

    case 'INCREASE_TRUCKS': {
      const delta = payload.delta || 50;
      const newTrucks = Array.from({ length: delta }, () => generateTruck());
      state.trucks = [...state.trucks, ...newTrucks];
      state.simulationFlags.truckSurge += delta;
      break;
    }

    case 'BUNCH_SHIPS': {
      const count = payload.count || 5;
      const newVessels = generateInitialVessels(count, 'ANCHORED');
      // Force close ETAs (bunching = all arriving within 2 hours)
      const now = Date.now();
      const bunchedVessels = newVessels.map((v, i) => ({
        ...v,
        eta: new Date(now + i * 20 * 60 * 1000).toISOString(),
        waitHours: 2 + i,
      }));
      state.vessels = [...state.vessels, ...bunchedVessels];
      state.simulationFlags.bunchingActive = true;
      // Spike pre-berthing detention
      state.kpis = { ...state.kpis, preBerthingDetention: 5.2 };
      break;
    }

    case 'RESET_SIMULATION': {
      state = createInitialState();
      return { updatedState: state, triggeredAlerts: [] };
    }

    default:
      break;
  }

  // Recalculate KPIs and alerts after action
  state.kpis = calculateKPIs(state.vessels, state.gates, state.trucks, state.simulationFlags);
  const triggeredAlerts = checkAllAlerts(state);

  // Merge new alerts
  const existingIds = new Set(state.alerts.map(a => a.id));
  for (const alert of triggeredAlerts) {
    if (!existingIds.has(alert.id)) {
      state.alerts.unshift(alert);
    }
  }
  state.alerts = state.alerts.slice(0, 50);
  state.lastUpdated = Date.now();

  return { updatedState: state, triggeredAlerts };
}

/**
 * Dismiss an alert by ID.
 * @param {string} alertId
 */
export function dismissAlert(alertId) {
  if (!state) return;
  state.alerts = state.alerts.map((a) =>
    a.id === alertId ? { ...a, dismissed: true } : a
  );
}
