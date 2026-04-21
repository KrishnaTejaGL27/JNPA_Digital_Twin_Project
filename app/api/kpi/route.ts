/**
 * GET /api/kpi
 * Returns all 12 JNPA KPI values with 24-hour sparkline history arrays.
 */

import { NextResponse } from 'next/server';
import { getSimulationState } from '@/lib/simulationStore';

export async function GET() {
  try {
    const state = getSimulationState();
    return NextResponse.json(state.kpis);
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
