/**
 * useSimulation.ts
 * Simulation state consumer hook for JNPA Digital Twin.
 * Handles initial load and 5-second polling for all port state data.
 */

'use client';

import { useEffect, useCallback } from 'react';
import { useInterval } from './useInterval';
import { useSimulationStore } from '@/store/useSimulationStore';

const POLL_INTERVAL = 5000;

/**
 * Initialize simulation state and start 5-second polling.
 * Called once in the root dashboard layout.
 */
export function useSimulation() {
  const {
    setVessels, setGates, setTrucks, setAlerts, setKPIs,
    setIsLoading, setLastUpdated, hydrateFromState,
  } = useSimulationStore();

  const fetchFullState = useCallback(async () => {
    try {
      const res = await fetch('/api/simulation/state');
      if (!res.ok) return;
      const data = await res.json();
      hydrateFromState({
        vessels: data.vessels || [],
        gates: data.gates || [],
        trucks: data.trucks || [],
        alerts: data.alerts || [],
        kpis: data.kpis,
      });
      setLastUpdated(Date.now());
    } catch (err) {
      console.error('Failed to fetch simulation state:', err);
    }
  }, [hydrateFromState, setLastUpdated]);

  const pollKPIs = useCallback(async () => {
    try {
      const res = await fetch('/api/kpi');
      if (!res.ok) return;
      const data = await res.json();
      setKPIs(data);
    } catch { /* silent fail */ }
  }, [setKPIs]);

  const pollAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts');
      if (!res.ok) return;
      const data = await res.json();
      setAlerts(data);
    } catch { /* silent fail */ }
  }, [setAlerts]);

  const pollVessels = useCallback(async () => {
    try {
      const res = await fetch('/api/vessels');
      if (!res.ok) return;
      const data = await res.json();
      setVessels(data);
    } catch { /* silent fail */ }
  }, [setVessels]);

  const pollGates = useCallback(async () => {
    try {
      const res = await fetch('/api/gates');
      if (!res.ok) return;
      const data = await res.json();
      setGates(data);
    } catch { /* silent fail */ }
  }, [setGates]);

  const pollTrucks = useCallback(async () => {
    try {
      const res = await fetch('/api/trucks');
      if (!res.ok) return;
      const data = await res.json();
      setTrucks(data);
    } catch { /* silent fail */ }
  }, [setTrucks]);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    fetchFullState().finally(() => setIsLoading(false));
  }, [fetchFullState, setIsLoading]);

  // 5-second polling for live updates
  useInterval(pollKPIs, POLL_INTERVAL);
  useInterval(pollAlerts, POLL_INTERVAL);
  useInterval(pollVessels, POLL_INTERVAL + 1000);
  useInterval(pollGates, POLL_INTERVAL + 1200);
  useInterval(pollTrucks, POLL_INTERVAL + 1400);
}
