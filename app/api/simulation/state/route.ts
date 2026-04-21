/**
 * GET /api/simulation/state
 * Returns the full JNPA port snapshot from the server-side simulation singleton.
 */

import { NextResponse } from 'next/server';
import { getSimulationState } from '@/lib/simulationStore';

export async function GET() {
  try {
    const state = getSimulationState();
    return NextResponse.json({
      vessels: state.vessels,
      gates: state.gates,
      trucks: state.trucks,
      alerts: state.alerts,
      kpis: state.kpis,
      lastUpdated: state.lastUpdated,
    });
  } catch (err) {
    console.error('Failed to get simulation state:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
