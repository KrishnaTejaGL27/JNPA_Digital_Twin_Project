/**
 * BerthForecast.tsx
 * 21-day berth occupancy forecast panel for JNPA Digital Twin.
 * Calendar heatmap, vessel schedule table, and weekly summary.
 */

'use client';

import { useEffect, useState } from 'react';
import { Ship, RefreshCw, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface DayOccupancy {
  date: string;
  dayLabel: string;
  occupancyPercent: number;
  vessels: number;
  isWeekend: boolean;
}

interface ScheduledVessel {
  id: string;
  vesselName: string;
  eta: string;
  etd: string;
  berthNumber: string;
  status: string;
  teus: number;
  vesselType: string;
}

interface ForecastData {
  occupancyGrid: DayOccupancy[];
  vesselSchedule: ScheduledVessel[];
  avgOccupancy21Day: number;
}

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: 'text-emerald-400 bg-emerald-900/30 border-emerald-700/40',
  EXPECTED: 'text-cyan-400 bg-cyan-900/30 border-cyan-700/40',
  TENTATIVE: 'text-slate-400 bg-slate-800/50 border-slate-600/40',
  BERTHED: 'text-blue-400 bg-blue-900/30 border-blue-700/40',
  DEPARTED: 'text-slate-600 bg-slate-900/30 border-slate-700/30',
};

function occupancyColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 75) return 'bg-amber-500';
  if (pct >= 50) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function occupancyBg(pct: number): string {
  if (pct >= 90) return 'bg-red-900/40 border-red-700/40 text-red-300';
  if (pct >= 75) return 'bg-amber-900/40 border-amber-700/40 text-amber-300';
  if (pct >= 50) return 'bg-yellow-900/30 border-yellow-700/30 text-yellow-300';
  return 'bg-emerald-900/30 border-emerald-700/30 text-emerald-300';
}

export function BerthForecast() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/berth/forecast').then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading || !data) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading berth forecast...
      </div>
    </div>
  );

  const upcoming = data.vesselSchedule.filter(v => ['CONFIRMED', 'EXPECTED', 'BERTHED'].includes(v.status)).slice(0, 12);

  return (
    <div className="p-4 space-y-6">
      {/* Summary header */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 col-span-2">
          <p className="text-xs text-slate-500 mb-1">21-Day Average Occupancy</p>
          <div className="flex items-end gap-3">
            <span className="text-3xl font-bold text-slate-100">{data.avgOccupancy21Day}%</span>
            <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden mb-1">
              <div
                className={`h-full rounded-full ${occupancyColor(data.avgOccupancy21Day)}`}
                style={{ width: `${data.avgOccupancy21Day}%` }}
              />
            </div>
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-1">Total Berths</p>
          <p className="text-3xl font-bold text-slate-100">23</p>
          <p className="text-[10px] text-slate-600">NSICT + JNPCT + GTI</p>
        </div>
      </div>

      {/* 21-day heatmap calendar */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200">21-Day Berth Occupancy Calendar</span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {data.occupancyGrid.map(day => (
            <div
              key={day.date}
              title={`${day.dayLabel}: ${day.occupancyPercent}% (${day.vessels} vessels)`}
              className={`rounded-lg p-1.5 border cursor-default transition-all hover:scale-105 ${
                occupancyBg(day.occupancyPercent)
              } ${day.isWeekend ? 'opacity-75' : ''}`}
            >
              <p className="text-[9px] font-semibold leading-none">{format(new Date(day.date), 'd')}</p>
              <p className="text-[8px] opacity-80 mt-0.5">{format(new Date(day.date), 'MMM')}</p>
              <p className="text-[9px] font-bold mt-1">{Math.round(day.occupancyPercent)}%</p>
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3">
          {[
            { label: '< 50%', color: 'bg-emerald-500' },
            { label: '50-75%', color: 'bg-yellow-500' },
            { label: '75-90%', color: 'bg-amber-500' },
            { label: '> 90%', color: 'bg-red-500' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded ${l.color}`} />
              <span className="text-[10px] text-slate-500">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Vessel schedule table */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/60">
          <Ship className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200">Vessel Schedule</span>
          <span className="text-xs text-slate-500 ml-auto">{upcoming.length} upcoming</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/60">
                {['Vessel', 'ETA', 'ETD', 'Berth', 'Type', 'TEUs', 'Status'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {upcoming.map(v => (
                <tr key={v.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                  <td className="px-3 py-2 font-medium text-slate-200">{v.vesselName}</td>
                  <td className="px-3 py-2 text-slate-400">{format(new Date(v.eta), 'dd MMM HH:mm')}</td>
                  <td className="px-3 py-2 text-slate-400">{format(new Date(v.etd), 'dd MMM HH:mm')}</td>
                  <td className="px-3 py-2 text-cyan-400 font-semibold">{v.berthNumber}</td>
                  <td className="px-3 py-2 text-slate-500">{v.vesselType}</td>
                  <td className="px-3 py-2 text-slate-300">{v.teus.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${STATUS_COLORS[v.status] || 'text-slate-400'}`}>
                      {v.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
