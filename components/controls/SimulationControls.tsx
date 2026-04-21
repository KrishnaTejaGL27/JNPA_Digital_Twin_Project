/**
 * SimulationControls.tsx
 * What-If Simulation Control Bar for JNPA Digital Twin ICCC.
 * Operators trigger real-time port scenarios and observe cascading effects.
 */

'use client';

import { useState } from 'react';
import { useSimulationStore } from '@/store/useSimulationStore';
import { Circle as XCircle, Ship, Truck, Waves, RotateCcw, Loader as Loader2, FlaskConical, ChevronRight } from 'lucide-react';

interface SimAction {
  label: string;
  icon: React.ReactNode;
  payload: { action: string; [key: string]: unknown };
  color: string;
  hoverColor: string;
  description: string;
}

const ACTIONS: SimAction[] = [
  {
    label: 'Close Gate 3',
    icon: <XCircle className="w-4 h-4" />,
    payload: { action: 'CLOSE_GATE', gateId: 3 },
    color: 'border-red-700/50 text-red-300 bg-red-950/30',
    hoverColor: 'hover:bg-red-900/40 hover:border-red-500/60',
    description: 'Redirects trucks → Gate congestion alert',
  },
  {
    label: 'Add 3 Incoming Ships',
    icon: <Ship className="w-4 h-4" />,
    payload: { action: 'ADD_VESSELS', count: 3 },
    color: 'border-amber-700/50 text-amber-300 bg-amber-950/30',
    hoverColor: 'hover:bg-amber-900/40 hover:border-amber-500/60',
    description: 'Increases berth occupancy, bunching detection',
  },
  {
    label: 'Increase Truck Volume',
    icon: <Truck className="w-4 h-4" />,
    payload: { action: 'INCREASE_TRUCKS', delta: 50 },
    color: 'border-orange-700/50 text-orange-300 bg-orange-950/30',
    hoverColor: 'hover:bg-orange-900/40 hover:border-orange-500/60',
    description: 'Gate queues rise, carbon index worsens',
  },
  {
    label: 'Simulate Ship Bunching',
    icon: <Waves className="w-4 h-4" />,
    payload: { action: 'BUNCH_SHIPS', count: 5 },
    color: 'border-rose-700/50 text-rose-300 bg-rose-950/30',
    hoverColor: 'hover:bg-rose-900/40 hover:border-rose-500/60',
    description: 'Pre-berthing detention spikes, road congestion predicted',
  },
  {
    label: 'Restore Normal State',
    icon: <RotateCcw className="w-4 h-4" />,
    payload: { action: 'RESET_SIMULATION' },
    color: 'border-emerald-700/50 text-emerald-300 bg-emerald-950/30',
    hoverColor: 'hover:bg-emerald-900/40 hover:border-emerald-500/60',
    description: 'Reset all state to baseline',
  },
];

export function SimulationControls() {
  const { hydrateFromState, alerts, setAlerts } = useSimulationStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  async function triggerAction(action: SimAction) {
    setLoading(action.label);
    try {
      const res = await fetch('/api/simulation/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.payload),
      });
      const data = await res.json();
      if (data.success) {
        hydrateFromState({
          vessels: data.updatedState.vessels,
          gates: data.updatedState.gates,
          trucks: data.updatedState.trucks,
          alerts: data.updatedState.alerts,
          kpis: data.updatedState.kpis,
        });
        setLastAction(action.label);
        setTimeout(() => setLastAction(null), 3000);
      }
    } catch (err) {
      console.error('Simulation action failed:', err);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="bg-slate-900/95 border-t border-slate-700/60 backdrop-blur-sm">
      <div className="px-4 py-2 flex items-center gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <FlaskConical className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            What-If Simulation Engine
          </span>
        </div>
        <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />

        <div className="flex items-center gap-2 flex-wrap flex-1">
          {ACTIONS.map(action => (
            <button
              key={action.label}
              onClick={() => triggerAction(action)}
              disabled={loading !== null}
              title={action.description}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium
                transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                ${action.color} ${action.hoverColor}
              `}
            >
              {loading === action.label ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                action.icon
              )}
              {action.label}
            </button>
          ))}
        </div>

        {lastAction && (
          <div className="shrink-0 flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-900/30 border border-emerald-700/50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-300 font-medium">{lastAction} applied</span>
          </div>
        )}
      </div>
    </div>
  );
}
