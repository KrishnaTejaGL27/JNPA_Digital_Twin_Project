/**
 * app/api/energy/route.ts
 * Energy and substation data from Azure IoT Hub when configured,
 * falling back to generateEnergyData() simulation transparently.
 *
 * Response shape: identical to generateEnergyData() output + _iotStatus field.
 * Components reading substations/totalConsumptionMW/etc. require zero changes.
 * _iotStatus is the new field for the "IoT Hub Ready" badge in the Energy tab.
 */

import { NextResponse } from 'next/server';
import { generateEnergyData } from '@/lib/mockDataGen';
import { fetchIoTSubstations, getIoTHubStatus } from '@/lib/iotHub';

export async function GET() {
  const sim       = generateEnergyData();
  const iotStatus = getIoTHubStatus();

  try {
    const liveSubstations = await fetchIoTSubstations();

    if (liveSubstations.length > 0) {
      const totalMW = liveSubstations.reduce((s, ss) => s + ss.currentMW, 0);
      return NextResponse.json({
        substations:        liveSubstations,
        totalConsumptionMW: parseFloat(totalMW.toFixed(1)),
        greenEnergyRatio:   sim.greenEnergyRatio,
        consumption24h:     sim.consumption24h,
        peakLoadToday:      parseFloat((totalMW * 1.2).toFixed(1)),
        gridFrequency:      sim.gridFrequency,
        _iotStatus:         { ...iotStatus, substationsLive: liveSubstations.length },
      }, { headers: { 'X-Data-Source': 'Azure IoT Hub LIVE' } });
    }
  } catch (err) {
    console.error('[energy/route] IoT fetch error:', err);
  }

  return NextResponse.json({
    ...sim,
    _iotStatus: { ...iotStatus, substationsLive: 0 },
  }, { headers: { 'X-Data-Source': 'Simulation (SCADA/IoT pending)' } });
}