/**
 * useSimulationStore.ts
 * Zustand global state store for JNPA Digital Twin ICCC client-side state.
 * Shared across all dashboard components and panels.
 */

'use client';

import { create } from 'zustand';

export type VesselState = 'APPROACHING' | 'ANCHORED' | 'BERTHING' | 'LOADING' | 'DEPARTING';

export interface Vessel {
  id: string;
  name: string;
  type: string;
  dwt: number;
  position: { lat: number; lng: number };
  lifecycleState: VesselState;
  eta: string;
  waitHours: number;
  emissionsRate: number;
  pilotAssigned: boolean;
  berthNumber: string | null;
  flag: string;
}

export interface Gate {
  id: number;
  name: string;
  lat: number;
  lng: number;
  status: 'OPEN' | 'CLOSED' | 'RESTRICTED';
  queueLength: number;
  congestionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  trucksTodayProcessed: number;
  avgProcessingTimeMins: number;
  lastUpdated: string;
}

export interface Truck {
  id: string;
  plateNumber: string;
  position: { lat: number; lng: number };
  destination: string;
  entryTimestamp: string;
  cargoType: string;
  status: string;
}

export interface Alert {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  color: string;
  message: string;
  affectedEntity: string;
  timestamp: string;
  dismissed: boolean;
  origin?: 'LIVE' | 'SIMULATED';
  source?: string;
}

export interface KPIs {
  avgVesselTAT: number;
  preBerthingDetention: number;
  berthOccupancy: number;
  avgImportDwellTime: number;
  avgExportDwellTime: number;
  dpdPercent: number;
  dpePercent: number;
  gateCongestionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  trucksInGeoFence: number;
  carbonIndex: 'LOW' | 'MODERATE' | 'HIGH';
  craneMoves: number;
  pilotPerformanceTime: number;
  history: Record<string, number[]>;
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  parsed?: {
    summary: string;
    impact: {
      tat_delta: string;
      congestion_change: string;
      carbon_delta: string;
      affected_vessels: number;
    };
    recommendations: string[];
    severity: string;
    confidence: number;
  };
}

export type UserRole = 'Port Authority' | 'Traffic Controller' | 'Energy Manager' | 'Environmental Officer';

export type ActiveTab = 'main' | 'energy' | 'environment' | 'rail' | 'berth';

export interface SimulationStore {
  // State
  vessels: Vessel[];
  gates: Gate[];
  trucks: Truck[];
  alerts: Alert[];
  kpis: KPIs | null;
  userRole: UserRole;
  activeTab: ActiveTab;
  chatMessages: AIMessage[];
  isLoading: boolean;
  lastUpdated: number;
  selectedEntity: { type: string; id: string } | null;
  mapLayersVisible: Record<string, boolean>;

  // Actions
  setVessels: (vessels: Vessel[]) => void;
  setGates: (gates: Gate[]) => void;
  setTrucks: (trucks: Truck[]) => void;
  setAlerts: (alerts: Alert[]) => void;
  setKPIs: (kpis: KPIs) => void;
  setUserRole: (role: UserRole) => void;
  setActiveTab: (tab: ActiveTab) => void;
  addChatMessage: (msg: AIMessage) => void;
  dismissAlert: (alertId: string) => void;
  setSelectedEntity: (entity: { type: string; id: string } | null) => void;
  toggleMapLayer: (layer: string) => void;
  setIsLoading: (loading: boolean) => void;
  setLastUpdated: (ts: number) => void;
  hydrateFromState: (state: {
    vessels: Vessel[];
    gates: Gate[];
    trucks: Truck[];
    alerts: Alert[];
    kpis: KPIs;
  }) => void;
}

const DEFAULT_MAP_LAYERS: Record<string, boolean> = {
  vessels: true,
  gates: true,
  trucks: true,
  roads: false,
  substations: true,
  greencover: false,
};

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  vessels: [],
  gates: [],
  trucks: [],
  alerts: [],
  kpis: null,
  userRole: 'Port Authority',
  activeTab: 'main',
  chatMessages: [],
  isLoading: false,
  lastUpdated: 0,
  selectedEntity: null,
  mapLayersVisible: DEFAULT_MAP_LAYERS,

  setVessels: (vessels) => set({ vessels }),
  setGates: (gates) => set({ gates }),
  setTrucks: (trucks) => set({ trucks }),
  setAlerts: (alerts) => set({ alerts }),
  setKPIs: (kpis) => set({ kpis }),
  setUserRole: (userRole) => set({ userRole }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setLastUpdated: (lastUpdated) => set({ lastUpdated }),

  addChatMessage: (msg) =>
    set((state) => ({
      chatMessages: [...state.chatMessages.slice(-15), msg],
    })),

  dismissAlert: (alertId) =>
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === alertId ? { ...a, dismissed: true } : a)),
    })),

  setSelectedEntity: (entity) => set({ selectedEntity: entity }),

  toggleMapLayer: (layer) =>
    set((state) => ({
      mapLayersVisible: {
        ...state.mapLayersVisible,
        [layer]: !state.mapLayersVisible[layer],
      },
    })),

  hydrateFromState: ({ vessels, gates, trucks, alerts, kpis }) =>
    set({ vessels, gates, trucks, alerts, kpis, lastUpdated: Date.now() }),
}));
