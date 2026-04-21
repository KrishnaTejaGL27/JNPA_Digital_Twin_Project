/**
 * app/api/vessels/route.ts
 * Live AIS vessel positions from aisstream.io relay, falling back to
 * simulationStore vessels when relay is not configured or not running.
 */

import { NextResponse } from 'next/server';
import { getSimulationState } from '@/lib/simulationStore';
import { fetchLiveVessels } from '@/lib/aisStream';

export async function GET() {
  try {
    // 1. Try live AIS data
    const liveVessels = await fetchLiveVessels();

    if (liveVessels && liveVessels.length > 0) {
      const simState   = getSimulationState();
      const simVessels = simState.vessels;

      const merged = liveVessels.map(liveV => {
        const simMatch = simVessels.find(
          (sv: { name: string }) => sv.name.toLowerCase() === liveV.name.toLowerCase()
        );
        return simMatch
          ? { ...simMatch, position: liveV.position, lifecycleState: liveV.lifecycleState }
          : liveV;
      });

      return NextResponse.json(merged, {
        headers: {
          'X-Data-Source':  'aisstream.io LIVE',
          'X-Vessel-Count': String(merged.length),
        },
      });
    }
  } catch (err) {
    // Catch-all: any unexpected error falls through to simulation
    console.error('[vessels/route] Unexpected error:', err);
  }

  // Fallback: simulation
  const state = getSimulationState();
  return NextResponse.json(state.vessels, {
    headers: {
      'X-Data-Source':  'Simulation (AIS relay not configured or not running)',
      'X-Vessel-Count': String(state.vessels.length),
    },
  });
}