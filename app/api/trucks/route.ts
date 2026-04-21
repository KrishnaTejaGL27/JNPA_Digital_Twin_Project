/**
 * app/api/trucks/route.ts
 * Truck data from simulationStore, with OpenCV live truck count
 * overlaid when the Python microservice is running.
 *
 * Response shape: Truck[] — unchanged from original.
 * Components reading this endpoint require zero modification.
 *
 * What changes with OpenCV live:
 *  - trucksInGeofence KPI becomes real camera count
 *  - /api/alerts can classify intrusion alerts as LIVE when detected
 */

import { NextResponse } from 'next/server';
import { getSimulationState } from '@/lib/simulationStore';
import { fetchCameraAnalytics } from '@/lib/opencvProxy';

export async function GET() {
  const state     = getSimulationState();
  const simTrucks = state.trucks;

  try {
    const camera = await fetchCameraAnalytics();

    return NextResponse.json(simTrucks, {
      headers: {
        'X-Data-Source':        camera.source,
        'X-Live-Truck-Count':   String(camera.trucksDetected),
        'X-Intrusion-Detected': String(camera.intrusionDetected),
      },
    });
  } catch (err) {
    console.error('[trucks/route] Camera fetch error:', err);
  }

  return NextResponse.json(simTrucks, {
    headers: { 'X-Data-Source': 'Simulation' },
  });
}