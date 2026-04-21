import type { Vessel, VesselState } from '@/store/useSimulationStore';

export const JNPA_BBOX = {
  minLat: 18.85, maxLat: 19.05,
  minLng: 72.85, maxLng: 73.05,
};

function isWithinJNPABounds(lat: number, lng: number): boolean {
  return (
    lat >= JNPA_BBOX.minLat &&
    lat <= JNPA_BBOX.maxLat &&
    lng >= JNPA_BBOX.minLng &&
    lng <= JNPA_BBOX.maxLng
  );
}

interface AISVessel {
  mmsi: number;
  name: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  navStatus: number;
  shipType: number;
  destination: string;
  flag: string;
  updatedAt: string;
}

interface AISRelayResponse {
  vessels: AISVessel[];
  count: number;
  source: string;
  timestamp: string;
}

function mapNavStatus(code: number): VesselState {
  const map: Record<number, VesselState> = {
    0: 'APPROACHING', 
    1: 'ANCHORED',    
    3: 'LOADING',     
    5: 'APPROACHING', 
    7: 'LOADING',     
    8: 'DEPARTING',   
  };
  return map[code] ?? 'APPROACHING';
}

function mapShipType(code: number): string {
  if (code >= 70 && code <= 79) return 'CONTAINER';
  if (code >= 80 && code <= 89) return 'TANKER';
  if (code >= 40 && code <= 49) return 'BULK';
  if (code === 60 || code === 69) return 'PASSENGER';
  return 'GENERAL';
}

function mapAISToVessel(v: AISVessel): Vessel {
  return {
    id: `AIS-${v.mmsi}`,
    name: v.name?.trim() || `VESSEL-${v.mmsi}`,
    type: mapShipType(v.shipType),
    dwt: 0,                              
    position: { lat: v.lat, lng: v.lng },
    lifecycleState: mapNavStatus(v.navStatus),
    eta: v.updatedAt,                    
    waitHours: 0,
    emissionsRate: 2.2,                  
    pilotAssigned: false,
    berthNumber: null,
    flag: v.flag || 'XX',
  };
}

export async function fetchLiveVessels(): Promise<Vessel[] | null> {
  const relayUrl = process.env.AIS_RELAY_URL?.trim();

  if (!relayUrl) {
    return null;
  }

  try {
    const res = await fetch(`${relayUrl}/api/vessels`, {
      cache: 'no-store',  // Fixes the Next.js 2MB cache crash
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error(`[AIS] Relay returned ${res.status}`);
      return null;
    }

    const data: AISRelayResponse = await res.json();

    if (!Array.isArray(data.vessels) || data.vessels.length === 0) {
      return null;
    }

    // Relay may be subscribed to a wide/global feed. Keep only local JNPA traffic;
    // if none are local, let the API route fall back to simulation vessels.
    const localVessels = data.vessels.filter(v =>
      isWithinJNPABounds(v.lat, v.lng)
    );

    if (localVessels.length === 0) {
      return null;
    }

    // Safety limit to prevent UI freezing if API sends too many
    const MAX_VESSELS = 150;
    const capped = localVessels.length > MAX_VESSELS
      ? localVessels.slice(0, MAX_VESSELS)
      : localVessels;

    return capped.map(mapAISToVessel);
  } catch (err) {
    console.error('[AIS] Fetch failed:', err);
    return null;
  }
}

export function countVesselsByState(vessels: Vessel[]): Record<VesselState, number> {
  const counts: Record<VesselState, number> = {
    APPROACHING: 0,
    ANCHORED: 0,
    BERTHING: 0,
    LOADING: 0,
    DEPARTING: 0,
  };
  for (const v of vessels) {
    counts[v.lifecycleState] = (counts[v.lifecycleState] || 0) + 1;
  }
  return counts;
}