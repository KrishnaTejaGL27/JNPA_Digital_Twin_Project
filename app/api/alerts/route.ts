import { NextRequest, NextResponse } from 'next/server';
import { getSimulationState, dismissAlert } from '@/lib/simulationStore';
import { fetchLiveVessels } from '@/lib/aisStream';
import { fetchGateCongestion, mergeGeofenceIntoGates } from '@/lib/geofence';
import { fetchCameraAnalytics } from '@/lib/opencvProxy';
import { buildOperationalAlerts } from '@/lib/liveAlerts';

export async function GET() {
  const state = getSimulationState();
  const [liveVesselsResult, geofenceResult, cameraResult] = await Promise.allSettled([
    fetchLiveVessels(),
    fetchGateCongestion(),
    fetchCameraAnalytics(),
  ]);

  const liveVessels =
    liveVesselsResult.status === 'fulfilled' && liveVesselsResult.value?.length
      ? liveVesselsResult.value
      : null;
  const vessels = liveVessels || state.vessels;
  const vesselSource = liveVessels ? 'aisstream.io LIVE' : 'SIMULATION';

  const geofence = geofenceResult.status === 'fulfilled' ? geofenceResult.value : null;
  const gates = geofence ? mergeGeofenceIntoGates(state.gates, geofence) : state.gates;
  const gateSource = geofence?.source || 'SIMULATION';

  const camera = cameraResult.status === 'fulfilled' ? cameraResult.value : null;
  const trucksCount = camera?.trucksDetected ?? state.trucks.length;
  const truckSource = camera?.source || 'SIMULATION';

  const computedAlerts = buildOperationalAlerts({
    vessels,
    vesselSource,
    gates,
    gateSource,
    trucksCount,
    truckSource,
    camera,
  });

  // Keep dismissal state stable across polling cycles for active alert IDs.
  const priorDismissedById = new Map(state.alerts.map((a: any) => [a.id, Boolean(a.dismissed)]));
  state.alerts = computedAlerts.map((a) => ({
    ...a,
    dismissed: priorDismissedById.get(a.id) ?? false,
  }));

  return NextResponse.json(state.alerts.filter((a: any) => !a.dismissed), {
    headers: {
      'X-Vessel-Alert-Source': vesselSource,
      'X-Gate-Alert-Source': gateSource,
      'X-Truck-Alert-Source': truckSource,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (id) dismissAlert(id);
  return NextResponse.json({ success: true });
}
