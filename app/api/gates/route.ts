/**
 * app/api/gates/route.ts
 * Gate and congestion data from Google Maps Roads API, merged into
 * simulationStore Gate objects. Falls back to simulation on any error.
 *
 * Response shape: Gate[] — unchanged from original.
 * Components reading this endpoint require zero modification.
 * congestionLevel and queueLength are the two fields updated with live data.
 */

import { NextResponse } from 'next/server';
import { getSimulationState } from '@/lib/simulationStore';
import { fetchGateCongestion, mergeGeofenceIntoGates } from '@/lib/geofence';

export async function GET() {
  const state    = getSimulationState();
  const simGates = state.gates;

  try {
    const geofence    = await fetchGateCongestion();
    const mergedGates = mergeGeofenceIntoGates(simGates, geofence);
    return NextResponse.json(mergedGates, {
      headers: {
        'X-Data-Source':        geofence.source,
        'X-Trucks-In-Geofence': String(geofence.trucksInGeofence),
        'X-Overall-Congestion': geofence.gatesCongested,
      },
    });
  } catch (err) {
    console.error('[gates/route] Geofence fetch error:', err);
  }

  return NextResponse.json(simGates, {
    headers: { 'X-Data-Source': 'Simulation' },
  });
}