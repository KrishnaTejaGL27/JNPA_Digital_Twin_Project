/**
 * POST /api/simulation/action
 * Applies a simulation action to the server-side state and returns updated state + alerts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySimulationAction } from '@/lib/simulationStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, payload } = body;

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    const result = applySimulationAction(action, payload || {});

    return NextResponse.json({
      success: true,
      updatedState: {
        vessels: result.updatedState.vessels,
        gates: result.updatedState.gates,
        trucks: result.updatedState.trucks,
        alerts: result.updatedState.alerts,
        kpis: result.updatedState.kpis,
      },
      triggeredAlerts: result.triggeredAlerts,
    });
  } catch (err) {
    console.error('Simulation action error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
