/**
 * page.tsx
 * JNPA Digital Twin Integrated Command and Control Centre (ICCC)
 * Main dashboard layout — assembles all panels for the port command center.
 */

'use client';

import dynamic from 'next/dynamic';
import { useSimulationStore } from '@/store/useSimulationStore';
import type { ActiveTab } from '@/store/useSimulationStore';
import { useSimulation } from '@/hooks/useSimulation';
import { RoleSelector } from '@/components/roles/RoleSelector';
import { KPIDashboard } from '@/components/kpi/KPIDashboard';
import { AlertsPanel } from '@/components/alerts/AlertsPanel';
import { AIAssistant } from '@/components/chat/AIAssistant';
import { SimulationControls } from '@/components/controls/SimulationControls';
import { EnergyPanel } from '@/components/panels/EnergyPanel';
import { EnvironmentPanel } from '@/components/panels/EnvironmentPanel';
import { RailPanel } from '@/components/panels/RailPanel';
import { BerthForecast } from '@/components/panels/BerthForecast';
import { Activity, Zap, Leaf, Brain as Train, ChartBar as BarChart3, Radio, Anchor, Clock, Shield } from 'lucide-react';

const MapPanel = dynamic(
  () => import('@/components/map/MapPanel').then(m => m.MapPanel),
  { ssr: false, loading: () => <MapFallback /> }
);

function MapFallback() {
  return (
    <div className="h-full bg-slate-900 rounded-xl flex items-center justify-center">
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        Loading map...
      </div>
    </div>
  );
}

const TABS: Array<{ key: ActiveTab; label: string; icon: React.ReactNode }> = [
  { key: 'main', label: 'Command Center', icon: <Activity className="w-3.5 h-3.5" /> },
  { key: 'energy', label: 'Energy', icon: <Zap className="w-3.5 h-3.5" /> },
  { key: 'environment', label: 'Environment', icon: <Leaf className="w-3.5 h-3.5" /> },
  { key: 'rail', label: 'Rail Freight', icon: <Train className="w-3.5 h-3.5" /> },
  { key: 'berth', label: 'Berth Forecast', icon: <BarChart3 className="w-3.5 h-3.5" /> },
];

function StatusBar() {
  const { vessels, kpis, lastUpdated } = useSimulationStore();
  const approaching = vessels.filter(v => v.lifecycleState === 'APPROACHING').length;
  const anchored = vessels.filter(v => v.lifecycleState === 'ANCHORED').length;
  const loading = vessels.filter(v => v.lifecycleState === 'LOADING').length;

  return (
    <div className="flex items-center gap-4 text-[10px]">
      <div className="flex items-center gap-1.5 text-blue-400">
        <Anchor className="w-3 h-3" />
        <span>{approaching} approaching</span>
      </div>
      <div className="flex items-center gap-1.5 text-amber-400">
        <Anchor className="w-3 h-3" />
        <span>{anchored} anchored</span>
      </div>
      <div className="flex items-center gap-1.5 text-emerald-400">
        <Activity className="w-3 h-3" />
        <span>{loading} loading</span>
      </div>
      {kpis && (
        <div className={`flex items-center gap-1.5 ${kpis.berthOccupancy > 85 ? 'text-amber-400' : 'text-slate-500'}`}>
          <BarChart3 className="w-3 h-3" />
          <span>Berth {kpis.berthOccupancy}%</span>
        </div>
      )}
      {lastUpdated > 0 && (
        <div className="hidden md:flex items-center gap-1.5 text-slate-600">
          <Clock className="w-3 h-3" />
          <span>Updated {new Date(lastUpdated).toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}

function Header() {
  const { alerts, isLoading } = useSimulationStore();
  const criticalCount = alerts.filter(a => !a.dismissed && a.severity === 'CRITICAL').length;

  return (
    <header className="bg-[#0a0f1e]/95 border-b border-slate-700/60 backdrop-blur-sm shrink-0">
      <div className="px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-700/50 shrink-0">
            <Shield className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-100 tracking-wide">JNPA ICCC</h1>
              <span className="hidden sm:inline text-[10px] text-slate-600">|</span>
              <span className="hidden sm:inline text-[10px] text-slate-500 font-medium">
                Digital Twin — Integrated Command &amp; Control Centre
              </span>
            </div>
            <StatusBar />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {criticalCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-red-950/60 border border-red-700/60 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-[10px] font-bold text-red-300">{criticalCount} CRITICAL</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/40 border border-emerald-800/40 rounded-full">
            <Radio className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-emerald-400 font-medium">
              {isLoading ? 'SYNCING' : 'LIVE'}
            </span>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>

        <RoleSelector />
      </div>

      <div className="px-4 border-t border-slate-800/60 flex items-center gap-0 overflow-x-auto">
        {TABS.map(tab => (
          <TabButton key={tab.key} tab={tab} />
        ))}
      </div>
    </header>
  );
}

function TabButton({ tab }: { tab: typeof TABS[0] }) {
  const { activeTab, setActiveTab } = useSimulationStore();
  const isActive = activeTab === tab.key;

  return (
    <button
      onClick={() => setActiveTab(tab.key)}
      className={`
        flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-all border-b-2 whitespace-nowrap shrink-0
        ${isActive
          ? 'text-cyan-400 border-cyan-400 bg-cyan-950/20'
          : 'text-slate-500 border-transparent hover:text-slate-300 hover:border-slate-600'
        }
      `}
    >
      {tab.icon}
      {tab.label}
    </button>
  );
}

function MainCommandCenter() {
  return (
    <div className="flex-1 grid grid-cols-12 gap-2 p-2 min-h-0">
      <div className="col-span-12 lg:col-span-5 rounded-xl overflow-hidden" style={{ minHeight: '300px' }}>
        <MapPanel />
      </div>

      <div className="col-span-12 lg:col-span-4 bg-[#0a0f1e]/80 border border-slate-700/50 rounded-xl overflow-hidden flex flex-col">
        <KPIDashboard />
      </div>

      <div className="col-span-12 lg:col-span-3 flex flex-col gap-2 min-h-0">
        <div className="bg-[#0a0f1e]/80 border border-slate-700/50 rounded-xl overflow-hidden flex flex-col" style={{ maxHeight: '42%', minHeight: '180px' }}>
          <AlertsPanel />
        </div>
        <div className="bg-[#0a0f1e]/80 border border-slate-700/50 rounded-xl overflow-hidden flex flex-col flex-1 min-h-0">
          <AIAssistant />
        </div>
      </div>
    </div>
  );
}

function TabPanel() {
  const { activeTab } = useSimulationStore();

  const panelContent: Partial<Record<ActiveTab, React.ReactNode>> = {
    energy: <EnergyPanel />,
    environment: <EnvironmentPanel />,
    rail: <RailPanel />,
    berth: <BerthForecast />,
  };

  const content = panelContent[activeTab];
  if (!content) return null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {content}
      </div>
    </div>
  );
}

export default function ICCCDashboard() {
  useSimulation();
  const { activeTab } = useSimulationStore();

  return (
    <div className="h-screen flex flex-col bg-[#050810] text-slate-100 overflow-hidden">
      <Header />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === 'main' ? <MainCommandCenter /> : <TabPanel />}
      </main>
      <SimulationControls />
    </div>
  );
}
