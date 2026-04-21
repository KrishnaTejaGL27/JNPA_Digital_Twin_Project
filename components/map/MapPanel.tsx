/**
 * MapPanel.tsx
 * Mapbox GL JS interactive map for JNPA Digital Twin ICCC.
 * Centered on JNPA (18.9442°N, 72.9479°E) with 6 toggleable layers.
 * Vessel markers animate through lifecycle states. Gate markers show congestion halos.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useSimulationStore } from '@/store/useSimulationStore';
import { Layers, Eye, EyeOff, X, Ship, Truck, Zap, TreePine, Route, Heater as Gate } from 'lucide-react';

const JNPA_CENTER: [number, number] = [72.9479, 18.9442];

const VESSEL_COLORS: Record<string, string> = {
  APPROACHING: '#3b82f6',
  ANCHORED: '#eab308',
  BERTHING: '#f97316',
  LOADING: '#22c55e',
  DEPARTING: '#94a3b8',
};

const GATE_HALO_COLORS: Record<string, string> = {
  LOW: '#22c55e',
  MEDIUM: '#f59e0b',
  HIGH: '#ef4444',
  CLOSED: '#dc2626',
};

const LAYERS_CONFIG = [
  { key: 'vessels', label: 'Vessels', icon: '⚓' },
  { key: 'gates', label: 'Gates', icon: '🚧' },
  { key: 'trucks', label: 'Trucks', icon: '🚛' },
  { key: 'roads', label: 'Road Network', icon: '🛣️' },
  { key: 'substations', label: 'Substations', icon: '⚡' },
  { key: 'greencover', label: 'Green Cover', icon: '🌿' },
];

function createVesselMarkerEl(state: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${VESSEL_COLORS[state] || '#94a3b8'};
    border: 2px solid rgba(255,255,255,0.6);
    box-shadow: 0 0 8px ${VESSEL_COLORS[state] || '#94a3b8'}80;
    cursor: pointer;
    transition: transform 0.2s;
  `;
  if (state === 'LOADING') {
    el.style.animation = 'pulse 2s infinite';
  }
  return el;
}

function createGateMarkerEl(congestion: string, status: string): HTMLElement {
  const el = document.createElement('div');
  const color = status === 'CLOSED' ? '#dc2626' : GATE_HALO_COLORS[congestion] || '#22c55e';
  el.style.cssText = `
    width: 16px;
    height: 16px;
    border-radius: 3px;
    background: ${color};
    border: 2px solid rgba(255,255,255,0.7);
    box-shadow: 0 0 12px ${color}60;
    cursor: pointer;
    position: relative;
  `;
  return el;
}

function createTruckMarkerEl(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `
    width: 8px;
    height: 8px;
    border-radius: 1px;
    background: #f97316;
    border: 1px solid rgba(255,255,255,0.4);
    cursor: pointer;
    opacity: 0.85;
  `;
  return el;
}

function createSubstationMarkerEl(load: number): HTMLElement {
  const el = document.createElement('div');
  const color = load > 90 ? '#ef4444' : load > 75 ? '#f59e0b' : '#22c55e';
  el.style.cssText = `
    width: 12px;
    height: 12px;
    background: ${color};
    clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
    cursor: pointer;
    box-shadow: 0 0 6px ${color}60;
  `;
  return el;
}

interface PopupInfo {
  title: string;
  rows: Array<{ label: string; value: string }>;
}

export function MapPanel() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [popup, setPopup] = useState<PopupInfo | null>(null);
  const [showLayers, setShowLayers] = useState(false);

  const { vessels, gates, trucks, mapLayersVisible, toggleMapLayer } = useSimulationStore();

  // Initialize Mapbox map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setMapLoaded(true); // Show fallback
      return;
    }

    let mapboxgl: typeof import('mapbox-gl');
    import('mapbox-gl').then((module) => {
      mapboxgl = module.default || module;
      (mapboxgl as any).accessToken = token;

      const map = new (mapboxgl as any).Map({
        container: mapRef.current!,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: JNPA_CENTER,
        zoom: 12,
        pitch: 20,
        bearing: 0,
        attributionControl: false,
      });

      map.addControl(new (mapboxgl as any).NavigationControl({ showCompass: false }), 'bottom-right');
      map.addControl(new (mapboxgl as any).ScaleControl(), 'bottom-left');

      map.on('load', () => {
        mapInstanceRef.current = map;
        setMapLoaded(true);

        // Add green cover polygon layer
        map.addSource('greencover', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: [[
                    [72.920, 18.960], [72.935, 18.960], [72.935, 18.950],
                    [72.920, 18.950], [72.920, 18.960]
                  ]],
                },
                properties: { ndvi: 0.45 },
              },
              {
                type: 'Feature',
                geometry: {
                  type: 'Polygon',
                  coordinates: [[
                    [72.955, 18.930], [72.965, 18.930], [72.965, 18.923],
                    [72.955, 18.923], [72.955, 18.930]
                  ]],
                },
                properties: { ndvi: 0.32 },
              },
            ],
          },
        });

        map.addLayer({
          id: 'greencover-fill',
          type: 'fill',
          source: 'greencover',
          paint: {
            'fill-color': '#22c55e',
            'fill-opacity': 0.3,
          },
        });

        // Add road network overlay
        map.addSource('roads', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [72.9479, 18.9442],
                [72.9600, 18.9350],
                [72.9750, 18.9200],
                [73.0200, 18.8800],
                [73.0600, 18.8500],
              ],
            },
            properties: {},
          },
        });

        map.addLayer({
          id: 'road-overlay',
          type: 'line',
          source: 'roads',
          paint: {
            'line-color': '#f97316',
            'line-width': 2,
            'line-opacity': 0.7,
            'line-dasharray': [4, 2],
          },
          layout: {
            visibility: 'none',
          },
        });
      });
    }).catch(console.error);

    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as any).remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update map markers when data changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoaded) return;

    // Clear existing markers
    (markersRef.current as any[]).forEach(m => (m as any).remove());
    markersRef.current = [];

    if (typeof window === 'undefined') return;

    import('mapbox-gl').then((module) => {
      const mapboxgl = module.default || module;

      // Vessel markers
      if (mapLayersVisible.vessels) {
        vessels.forEach(v => {
          const el = createVesselMarkerEl(v.lifecycleState);
          el.addEventListener('click', () => {
            setPopup({
              title: v.name,
              rows: [
                { label: 'Type', value: v.type },
                { label: 'State', value: v.lifecycleState },
                { label: 'DWT', value: `${v.dwt.toLocaleString()} T` },
                { label: 'Wait', value: `${v.waitHours} hrs` },
                { label: 'Berth', value: v.berthNumber || 'Unassigned' },
                { label: 'ETA', value: new Date(v.eta).toLocaleTimeString() },
                { label: 'Pilot', value: v.pilotAssigned ? 'Assigned' : 'Pending' },
                { label: 'Flag', value: v.flag },
              ],
            });
          });

          const marker = new (mapboxgl as any).Marker({ element: el })
            .setLngLat([v.position.lng, v.position.lat])
            .addTo(map as any);
          markersRef.current.push(marker);
        });
      }

      // Gate markers
      if (mapLayersVisible.gates) {
        gates.forEach(g => {
          const el = createGateMarkerEl(g.congestionLevel, g.status);
          el.addEventListener('click', () => {
            setPopup({
              title: g.name,
              rows: [
                { label: 'Status', value: g.status },
                { label: 'Queue', value: `${g.queueLength} trucks` },
                { label: 'Congestion', value: g.congestionLevel },
                { label: 'Processed Today', value: `${g.trucksTodayProcessed} trucks` },
                { label: 'Avg Processing', value: `${g.avgProcessingTimeMins} min` },
              ],
            });
          });

          const marker = new (mapboxgl as any).Marker({ element: el })
            .setLngLat([g.lng, g.lat])
            .addTo(map as any);
          markersRef.current.push(marker);
        });
      }

      // Truck markers (show a sample to avoid performance issues)
      if (mapLayersVisible.trucks) {
        trucks.slice(0, 50).forEach(t => {
          const el = createTruckMarkerEl();
          el.addEventListener('click', () => {
            setPopup({
              title: `Truck ${t.plateNumber}`,
              rows: [
                { label: 'Destination', value: t.destination },
                { label: 'Cargo', value: t.cargoType },
                { label: 'Status', value: t.status },
                { label: 'Entry', value: new Date(t.entryTimestamp).toLocaleTimeString() },
              ],
            });
          });

          const marker = new (mapboxgl as any).Marker({ element: el })
            .setLngLat([t.position.lng, t.position.lat])
            .addTo(map as any);
          markersRef.current.push(marker);
        });
      }

      // Substation markers (fixed positions)
      if (mapLayersVisible.substations) {
        const substationPositions = [
          { id: 1, lat: 18.9540, lng: 72.9480, load: 65 },
          { id: 2, lat: 18.9510, lng: 72.9510, load: 82 },
          { id: 3, lat: 18.9480, lng: 72.9530, load: 45 },
          { id: 4, lat: 18.9450, lng: 72.9560, load: 78 },
          { id: 5, lat: 18.9420, lng: 72.9540, load: 91 },
          { id: 6, lat: 18.9390, lng: 72.9510, load: 55 },
          { id: 7, lat: 18.9360, lng: 72.9480, load: 67 },
          { id: 8, lat: 18.9380, lng: 72.9440, load: 43 },
          { id: 9, lat: 18.9410, lng: 72.9420, load: 73 },
          { id: 10, lat: 18.9440, lng: 72.9400, load: 88 },
          { id: 11, lat: 18.9470, lng: 72.9390, load: 52 },
          { id: 12, lat: 18.9500, lng: 72.9410, load: 69 },
          { id: 13, lat: 18.9530, lng: 72.9440, load: 38 },
        ];

        substationPositions.forEach(ss => {
          const el = createSubstationMarkerEl(ss.load);
          el.addEventListener('click', () => {
            setPopup({
              title: `Substation SS-${String(ss.id).padStart(2, '0')}`,
              rows: [
                { label: 'Load', value: `${ss.load}%` },
                { label: 'Status', value: ss.load > 90 ? 'OVERLOAD' : ss.load > 75 ? 'HIGH_LOAD' : 'NORMAL' },
                { label: 'Power', value: `${(ss.load * 0.25).toFixed(1)} MW` },
              ],
            });
          });

          const marker = new (mapboxgl as any).Marker({ element: el })
            .setLngLat([ss.lng, ss.lat])
            .addTo(map as any);
          markersRef.current.push(marker);
        });
      }

      // Toggle layer visibility
      try {
        if ((map as any).getLayer('greencover-fill')) {
          (map as any).setLayoutProperty('greencover-fill', 'visibility', mapLayersVisible.greencover ? 'visible' : 'none');
        }
        if ((map as any).getLayer('road-overlay')) {
          (map as any).setLayoutProperty('road-overlay', 'visibility', mapLayersVisible.roads ? 'visible' : 'none');
        }
      } catch { /* layer not yet loaded */ }
    });
  }, [vessels, gates, trucks, mapLayersVisible, mapLoaded]);

  return (
    <div className="relative h-full rounded-xl overflow-hidden bg-slate-900">
      {/* Map container */}
      <div ref={mapRef} className="absolute inset-0 w-full h-full" />

      {/* Fallback for no Mapbox token */}
      {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-center px-6">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
            <Ship className="w-8 h-8 text-slate-600" />
          </div>
          <p className="text-sm text-slate-400 font-medium mb-2">Map Preview Unavailable</p>
          <p className="text-xs text-slate-600">
            Set NEXT_PUBLIC_MAPBOX_TOKEN to enable the interactive port map.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 w-full max-w-xs">
            {vessels.slice(0, 4).map(v => (
              <div key={v.id} className="bg-slate-800 rounded-lg p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: VESSEL_COLORS[v.lifecycleState] }}
                  />
                  <span className="text-[10px] text-slate-400 truncate">{v.name}</span>
                </div>
                <span className="text-[10px] text-slate-500">{v.lifecycleState}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Layer toggle control */}
      <div className="absolute top-3 left-3 z-10">
        <button
          onClick={() => setShowLayers(o => !o)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900/90 border border-slate-700/60 rounded-lg text-xs text-slate-300 hover:bg-slate-800 backdrop-blur-sm"
        >
          <Layers className="w-3.5 h-3.5" />
          Layers
        </button>

        {showLayers && (
          <div className="absolute top-full mt-1 left-0 bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl min-w-[160px] overflow-hidden backdrop-blur-sm">
            <div className="px-3 py-2 border-b border-slate-700/60 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Map Layers</span>
              <button onClick={() => setShowLayers(false)}>
                <X className="w-3 h-3 text-slate-500 hover:text-slate-300" />
              </button>
            </div>
            {LAYERS_CONFIG.map(layer => (
              <button
                key={layer.key}
                onClick={() => toggleMapLayer(layer.key)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800 transition-colors text-left ${
                  mapLayersVisible[layer.key] ? 'text-slate-200' : 'text-slate-600'
                }`}
              >
                {mapLayersVisible[layer.key]
                  ? <Eye className="w-3 h-3 text-cyan-400" />
                  : <EyeOff className="w-3 h-3 text-slate-600" />
                }
                <span>{layer.icon}</span>
                <span>{layer.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 bg-slate-900/90 border border-slate-700/60 rounded-lg px-3 py-2 backdrop-blur-sm">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Vessel State</p>
        <div className="space-y-1">
          {Object.entries(VESSEL_COLORS).map(([state, color]) => (
            <div key={state} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-[10px] text-slate-400">{state}</span>
            </div>
          ))}
        </div>
      </div>

      {/* JNPA label */}
      <div className="absolute top-3 right-3 z-10 bg-slate-900/90 border border-slate-700/60 rounded-lg px-2 py-1.5 backdrop-blur-sm">
        <p className="text-[10px] font-semibold text-cyan-400">JNPA</p>
        <p className="text-[9px] text-slate-500">18.9442°N 72.9479°E</p>
      </div>

      {/* Entity popup */}
      {popup && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 bg-slate-900 border border-slate-600 rounded-xl shadow-2xl min-w-[200px]">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
            <span className="text-xs font-semibold text-slate-200">{popup.title}</span>
            <button onClick={() => setPopup(null)}>
              <X className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300" />
            </button>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            {popup.rows.map(row => (
              <div key={row.label} className="flex items-center justify-between gap-4">
                <span className="text-[10px] text-slate-500">{row.label}</span>
                <span className="text-[10px] text-slate-300 font-medium">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
