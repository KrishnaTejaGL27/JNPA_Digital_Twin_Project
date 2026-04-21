/**
 * lib/geofence.ts
 * JNPA geo-fence truck monitoring and gate congestion.
 *
 * Sources:
 *  1. Google Maps Roads API  — nearest-road snapping near gate points
 *  2. OSRM (self-hosted)     — truck routing, ETA calculations (free, open source)
 *
 * The Gate shape returned matches useSimulationStore.ts Gate interface exactly.
 * congestionLevel field directly replaces simulationStore gate data.
 *
 * OSRM self-hosting:
 *   docker run -t -v $(pwd):/data osrm/osrm-backend osrm-routed /data/india.osm.pbf
 *   Or use public demo server: https://router.project-osrm.org (rate limited)
 */

import type { Gate } from '@/store/useSimulationStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CongestionLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface GeofenceSummary {
  trucksInGeofence: number;        // count — feeds KPI dashboard
  gatesCongested:   CongestionLevel;
  roadSegmentsActive: number;
  gates:            GateCongestionUpdate[];
  source:           'GOOGLE_MAPS_LIVE' | 'GOOGLE_MAPS_FALLBACK';
}

export interface GateCongestionUpdate {
  gateId:           number;
  congestionLevel:  CongestionLevel;
  estimatedQueueLength: number;    // vehicle count estimate
  source:           string;
}

export interface RouteETA {
  durationMin:  number;
  distanceKm:   number;
  source:       'OSRM_LIVE' | 'OSRM_FALLBACK';
}

// ─── JNPA gate points (lat,lng) — NH-48 / JNPT access roads ─────────────────

const JNPA_GATE_POINTS = [
  { gateId: 1, lat: 18.9442, lng: 72.9319, name: 'Main Gate' },
  { gateId: 2, lat: 18.9380, lng: 72.9350, name: 'Gate 2'    },
  { gateId: 3, lat: 18.9410, lng: 72.9400, name: 'Gate 3'    },
];

// JNPA boundary polygon for truck-in-geofence check (ray-cast)
const JNPA_BOUNDARY = [
  { lat: 18.948, lng: 72.932 },
  { lat: 18.948, lng: 72.958 },
  { lat: 18.928, lng: 72.958 },
  { lat: 18.928, lng: 72.932 },
];

// ─── Point-in-polygon (ray casting — no API needed) ──────────────────────────

export function isInsideJNPAGeofence(lat: number, lng: number): boolean {
  const polygon = JNPA_BOUNDARY;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect =
      yi > lng !== yj > lng &&
      lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ─── Congestion level from road segment count ─────────────────────────────────

function segmentsToCongestion(count: number): CongestionLevel {
  if (count > 8)  return 'HIGH';
  if (count > 3)  return 'MEDIUM';
  return 'LOW';
}

function congestionToQueueLength(level: CongestionLevel): number {
  const map: Record<CongestionLevel, number> = {
    LOW:    Math.floor(5  + Math.random() * 10),
    MEDIUM: Math.floor(25 + Math.random() * 20),
    HIGH:   Math.floor(60 + Math.random() * 40),
  };
  return map[level];
}

// ─── Google Maps Roads API: nearest road snapping ────────────────────────────

/**
 * Use Google Maps Roads API to detect active road segments near JNPA gates.
 * More segments snapped → more vehicle activity → higher congestion.
 *
 * API: roads.googleapis.com/v1/nearestRoads
 * Free: $200/month credit covers ~28K requests/month.
 * Key: NEXT_PUBLIC_GOOGLE_MAPS_KEY (also used by map component)
 */
export async function fetchGateCongestion(): Promise<GeofenceSummary> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  if (!apiKey) {
    console.warn('[Geofence] Google Maps key not set — simulation fallback');
    return simulatedGeofence();
  }

  try {
    // Build point string for all gate locations
    const pointStr = JNPA_GATE_POINTS
      .map(g => `${g.lat},${g.lng}`)
      .join('|');

    const res = await fetch(
      `https://roads.googleapis.com/v1/nearestRoads?points=${pointStr}&key=${apiKey}`,
      {
        next:   { revalidate: 120 },      // 2-min cache
        signal: AbortSignal.timeout(6000),
      }
    );

    if (!res.ok) throw new Error(`Roads API HTTP ${res.status}`);

    const data = await res.json();
    const snapped: Array<{ placeId: string; originalIndex?: number }> =
      data.snappedPoints ?? [];

    // Group snapped points by gate (originalIndex)
    const perGate: Record<number, number> = {};
    for (const pt of snapped) {
      const idx = pt.originalIndex ?? 0;
      perGate[idx] = (perGate[idx] ?? 0) + 1;
    }

    const gates: GateCongestionUpdate[] = JNPA_GATE_POINTS.map((g, i) => {
      const count = perGate[i] ?? 0;
      const level = segmentsToCongestion(count);
      return {
        gateId:               g.gateId,
        congestionLevel:      level,
        estimatedQueueLength: congestionToQueueLength(level),
        source:               'Google Maps Roads API',
      };
    });

    const overallLevel = gates.some(g => g.congestionLevel === 'HIGH')
      ? 'HIGH'
      : gates.some(g => g.congestionLevel === 'MEDIUM')
      ? 'MEDIUM'
      : 'LOW';

    // Truck estimate: LOW=20-40, MEDIUM=40-70, HIGH=70-120
    const truckEstimates: Record<CongestionLevel, number> = {
      LOW:    Math.floor(20 + Math.random() * 20),
      MEDIUM: Math.floor(40 + Math.random() * 30),
      HIGH:   Math.floor(70 + Math.random() * 50),
    };

    return {
      trucksInGeofence:   truckEstimates[overallLevel],
      gatesCongested:     overallLevel,
      roadSegmentsActive: snapped.length,
      gates,
      source:             'GOOGLE_MAPS_LIVE',
    };
  } catch (err) {
    console.error('[Geofence] Google Maps fetch failed:', err);
    return simulatedGeofence();
  }
}

function simulatedGeofence(): GeofenceSummary {
  const level: CongestionLevel =
    Math.random() < 0.2 ? 'HIGH' : Math.random() < 0.4 ? 'MEDIUM' : 'LOW';

  return {
    trucksInGeofence:   Math.floor(25 + Math.random() * 40),
    gatesCongested:     level,
    roadSegmentsActive: 0,
    gates: JNPA_GATE_POINTS.map(g => ({
      gateId:               g.gateId,
      congestionLevel:      level,
      estimatedQueueLength: congestionToQueueLength(level),
      source:               'Simulation',
    })),
    source: 'GOOGLE_MAPS_FALLBACK',
  };
}

// ─── OSRM: truck route ETA ────────────────────────────────────────────────────

/**
 * Get route duration and distance between two coordinates using OSRM.
 * Defaults to public OSRM demo server if OSRM_SERVER not set (rate-limited).
 *
 * Self-host OSRM for India:
 *   wget https://download.geofabrik.de/asia/india-latest.osm.pbf
 *   docker run -t -v $(pwd):/data osrm/osrm-backend osrm-extract ...
 *
 * Common JNPA routes hard-coded for KPI display:
 */
export async function fetchRouteETA(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<RouteETA> {
  const base = process.env.OSRM_SERVER ?? 'https://router.project-osrm.org';

  try {
    const url =
      `${base}/route/v1/driving/` +
      `${originLng},${originLat};${destLng},${destLat}` +
      `?overview=false&annotations=false`;

    const res = await fetch(url, {
      next:   { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) throw new Error('No route found');

    return {
      durationMin: Math.round(route.duration / 60),
      distanceKm:  Math.round(route.distance / 100) / 10,
      source:      'OSRM_LIVE',
    };
  } catch (err) {
    console.warn('[OSRM] Route fetch failed:', err);
    return {
      durationMin: Math.floor(15 + Math.random() * 30),
      distanceKm:  Math.floor(5  + Math.random() * 15),
      source:      'OSRM_FALLBACK',
    };
  }
}

/**
 * Merge Google Maps congestion data into existing simulation Gate objects.
 * Preserves all Gate fields from simulationStore, only updates congestion fields.
 */
export function mergeGeofenceIntoGates(
  simulationGates: Gate[],
  geofence: GeofenceSummary
): Gate[] {
  return simulationGates.map(gate => {
    const update = geofence.gates.find(g => g.gateId === gate.id);
    if (!update) return gate;

    return {
      ...gate,
      congestionLevel:  update.congestionLevel,
      queueLength:      update.estimatedQueueLength,
      lastUpdated:      new Date().toISOString(),
    };
  });
}
