/**
 * berthScheduler.js
 * 21-day berth forecast and occupancy calendar for JNPA Digital Twin.
 * Generates realistic vessel schedule based on typical JNPA terminal activity.
 */

const VESSEL_NAMES_FORECAST = [
  'MSC GAIA', 'EVER GIVEN', 'COSCO SHIPPING', 'MAERSK EMERALD', 'APL TURQUOISE',
  'CMA CGM MARCO POLO', 'ONE INNOVATION', 'YANG MING WITNESS', 'HAPAG BERLIN',
  'ZIM SAMMY OFER', 'MITSUI VOYAGER', 'OOCL HONG KONG', 'TRIUMPH OF SEA',
  'MUMBAI EXPRESS', 'GUJARAT TRADER', 'KONKAN STAR', 'ARABINDA', 'VINDHYAGIRI',
  'CHENNAI GATEWAY', 'COLOMBO STAR', 'KARACHI LINK', 'GULF CARRIER',
  'BAY OF BENGAL', 'INDO PACIFIC', 'WESTERN ACCORD',
];

const BERTH_NUMBERS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'];

const VESSEL_STATUSES_FORECAST = ['CONFIRMED', 'EXPECTED', 'TENTATIVE', 'BERTHED', 'DEPARTED'];

let scheduleIdCounter = 1;

/**
 * Generate a 21-day berth occupancy heatmap grid.
 * Each cell = { date: string, occupancyPercent: number, vessels: number }
 * @returns {DayOccupancy[]}
 */
export function generate21DayOccupancy() {
  const days = [];
  const today = new Date();

  for (let d = 0; d < 21; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);

    // Realistic JNPA occupancy pattern: weekends slightly lower
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const baseOccupancy = isWeekend ? 55 : 72;
    const occupancyPercent = Math.min(
      98,
      Math.max(30, baseOccupancy + (Math.random() - 0.5) * 30)
    );

    // More vessels = higher occupancy
    const vessels = Math.round((occupancyPercent / 100) * 23);

    days.push({
      date: date.toISOString().split('T')[0],
      dayLabel: date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      occupancyPercent: parseFloat(occupancyPercent.toFixed(1)),
      vessels,
      isWeekend,
    });
  }

  return days;
}

/**
 * Generate vessel schedule table for the next 21 days.
 * @param {number} [count=18]
 * @returns {ScheduledVessel[]}
 */
export function generateVesselSchedule(count = 18) {
  const schedule = [];
  const today = new Date();

  for (let i = 0; i < count; i++) {
    const etaDaysFromNow = Math.random() * 21;
    const eta = new Date(today.getTime() + etaDaysFromNow * 86400000);
    const etd = new Date(eta.getTime() + (18 + Math.random() * 30) * 3600000);

    const statusIndex = Math.floor(Math.random() * VESSEL_STATUSES_FORECAST.length);
    const daysFromNow = etaDaysFromNow;

    let status = VESSEL_STATUSES_FORECAST[statusIndex];
    // Past ETAs = either BERTHED or DEPARTED
    if (eta < today) {
      status = Math.random() > 0.4 ? 'DEPARTED' : 'BERTHED';
    } else if (daysFromNow < 2) {
      status = 'CONFIRMED';
    } else if (daysFromNow < 7) {
      status = Math.random() > 0.3 ? 'CONFIRMED' : 'EXPECTED';
    } else {
      status = Math.random() > 0.5 ? 'EXPECTED' : 'TENTATIVE';
    }

    schedule.push({
      id: `SCHED-${String(scheduleIdCounter++).padStart(4, '0')}`,
      vesselName: VESSEL_NAMES_FORECAST[Math.floor(Math.random() * VESSEL_NAMES_FORECAST.length)],
      eta: eta.toISOString(),
      etd: etd.toISOString(),
      berthNumber: BERTH_NUMBERS[Math.floor(Math.random() * BERTH_NUMBERS.length)],
      status,
      teus: Math.floor(800 + Math.random() * 3200),
      vesselType: ['CONTAINER', 'BULK', 'TANKER', 'RO_RO'][Math.floor(Math.random() * 4)],
    });
  }

  return schedule.sort((a, b) => new Date(a.eta) - new Date(b.eta));
}

/**
 * Generate weekly occupancy summary (7 days).
 * @returns {WeeklyOccupancy[]}
 */
export function generateWeeklySummary() {
  const days = generate21DayOccupancy().slice(0, 7);
  return days.map(d => ({
    ...d,
    avgTAT: parseFloat((16 + Math.random() * 10).toFixed(1)),
    totalVesselsHandled: Math.floor(d.vessels * 0.8),
  }));
}

/**
 * Generate full berth forecast dataset.
 * @returns {BerthForecastData}
 */
export function generateBerthForecastData() {
  return {
    occupancyGrid: generate21DayOccupancy(),
    vesselSchedule: generateVesselSchedule(),
    weeklySummary: generateWeeklySummary(),
    avgOccupancy21Day: parseFloat(
      (generate21DayOccupancy().reduce((s, d) => s + d.occupancyPercent, 0) / 21).toFixed(1)
    ),
    lastUpdated: new Date().toISOString(),
  };
}
