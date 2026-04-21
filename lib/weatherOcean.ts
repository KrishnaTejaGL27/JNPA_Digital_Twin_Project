/**
 * lib/weatherOcean.ts
 * Live weather and oceanographic data for JNPA Digital Twin.
 *
 * Sources:
 *  1. Open-Meteo          — weather + marine waves (free, no key needed)
 *  2. Copernicus CMEMS    — Arabian Sea salinity (free after registration)
 *  3. INCOIS OSF          — Ocean State Forecast for Indian waters (free, Govt. of India)
 *
 * The waterQuality shape returned matches generateEnvironmentData().waterQuality
 * exactly so environment/route.ts can swap it in with zero component changes.
 */

// JNPA Nhava Sheva coordinates
const LAT = 18.9442;
const LNG = 72.9479;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LiveWeatherData {
  temperature: number;       // °C
  windSpeed: number;         // km/h
  windDirection: number;     // degrees
  humidity: number;          // %
  visibility: number;        // metres
  precipitation: number;     // mm
  source: string;
}

export interface LiveMarineData {
  waveHeight: number;        // metres — fills waterQuality display
  waveDirection: number;     // degrees
  wavePeriod: number;        // seconds
  swellHeight: number;       // metres
  currentVelocity: number;   // km/h
  source: string;
}

/**
 * Shape matches generateEnvironmentData().waterQuality exactly.
 * pH and dissolvedOxygen come from CMEMS/simulation (no real-time free API).
 * salinity comes from CMEMS.
 * turbidity comes from waveHeight proxy (higher waves → higher turbidity).
 */
export interface LiveWaterQuality {
  ph: number;
  salinity: number;          // PSU — from CMEMS
  dissolvedOxygen: number;   // mg/L
  turbidity: number;         // NTU — proxied from wave height
  overallIndex: number;      // 0-100 computed score
}

// ─── Fallbacks (simulation-range values) ─────────────────────────────────────

function weatherFallback(): LiveWeatherData {
  return {
    temperature:  28 + Math.random() * 6,
    windSpeed:    15 + Math.random() * 20,
    windDirection: Math.floor(Math.random() * 360),
    humidity:     70 + Math.random() * 20,
    visibility:   5000 + Math.random() * 5000,
    precipitation: 0,
    source:       'OPEN_METEO_FALLBACK',
  };
}

function marineFallback(): LiveMarineData {
  return {
    waveHeight:      0.5 + Math.random() * 1.5,
    waveDirection:   200 + Math.random() * 60,
    wavePeriod:      6 + Math.random() * 4,
    swellHeight:     0.3 + Math.random() * 1,
    currentVelocity: 0.5 + Math.random() * 1,
    source:          'OPEN_METEO_MARINE_FALLBACK',
  };
}

function waterQualityFallback(): LiveWaterQuality {
  return {
    ph:              parseFloat((7.8 + Math.random() * 0.6).toFixed(2)),
    salinity:        parseFloat((34 + Math.random() * 2).toFixed(1)),
    dissolvedOxygen: parseFloat((5.8 + Math.random() * 2).toFixed(1)),
    turbidity:       parseFloat((8  + Math.random() * 10).toFixed(1)),
    overallIndex:    Math.floor(55 + Math.random() * 30),
  };
}

// ─── 1. Open-Meteo: Weather ───────────────────────────────────────────────────

export async function fetchWeather(): Promise<LiveWeatherData> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude',  String(LAT));
    url.searchParams.set('longitude', String(LNG));
    url.searchParams.set('current', [
      'temperature_2m',
      'wind_speed_10m',
      'wind_direction_10m',
      'relative_humidity_2m',
      'visibility',
      'precipitation',
    ].join(','));
    url.searchParams.set('timezone', 'Asia/Kolkata');

    const res = await fetch(url.toString(), {
      next: { revalidate: 600 },            // 10-min cache
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Open-Meteo weather HTTP ${res.status}`);

    const data = await res.json();
    const c = data.current;

    return {
      temperature:  c.temperature_2m         ?? weatherFallback().temperature,
      windSpeed:    c.wind_speed_10m          ?? weatherFallback().windSpeed,
      windDirection: c.wind_direction_10m     ?? weatherFallback().windDirection,
      humidity:     c.relative_humidity_2m   ?? weatherFallback().humidity,
      visibility:   c.visibility             ?? weatherFallback().visibility,
      precipitation: c.precipitation         ?? 0,
      source:       'OPEN_METEO_LIVE',
    };
  } catch (err) {
    console.error('[Weather] Open-Meteo fetch failed:', err);
    return weatherFallback();
  }
}

// ─── 2. Open-Meteo: Marine waves ─────────────────────────────────────────────

export async function fetchMarineWaves(): Promise<LiveMarineData> {
  try {
    const url = new URL('https://marine-api.open-meteo.com/v1/marine');
    url.searchParams.set('latitude',  String(LAT));
    url.searchParams.set('longitude', String(LNG));
    url.searchParams.set('current', [
      'wave_height',
      'wave_direction',
      'wave_period',
      'swell_wave_height',
      'ocean_current_velocity',
    ].join(','));

    const res = await fetch(url.toString(), {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Open-Meteo marine HTTP ${res.status}`);

    const data = await res.json();
    const c = data.current;

    return {
      waveHeight:      c.wave_height             ?? marineFallback().waveHeight,
      waveDirection:   c.wave_direction          ?? marineFallback().waveDirection,
      wavePeriod:      c.wave_period             ?? marineFallback().wavePeriod,
      swellHeight:     c.swell_wave_height       ?? marineFallback().swellHeight,
      currentVelocity: c.ocean_current_velocity  ?? marineFallback().currentVelocity,
      source:          'OPEN_METEO_MARINE_LIVE',
    };
  } catch (err) {
    console.error('[Marine] Open-Meteo marine fetch failed:', err);
    return marineFallback();
  }
}

// ─── 3. CMEMS: Arabian Sea salinity ──────────────────────────────────────────
// Product: GLOBAL_ANALYSISFORECAST_PHY_001_024
// Registration: https://marine.copernicus.eu (free)

export async function fetchCMEMSSalinity(): Promise<number> {
  const user = process.env.CMEMS_USER;
  const pass = process.env.CMEMS_PASS;

  if (!user || !pass) {
    console.warn('[CMEMS] Credentials not set — using typical Arabian Sea salinity');
    return parseFloat((34.5 + Math.random() * 1.5).toFixed(1));
  }

  try {
    // CMEMS WMS GetFeatureInfo — point query over JNPA coordinates
    const today = new Date().toISOString().split('T')[0];
    const url =
      `https://nrt.cmems-du.eu/thredds/wms/` +
      `cmems_mod_glo_phy-so_anfc_0.083deg_P1D-m` +
      `?service=WMS&version=1.3.0&request=GetFeatureInfo` +
      `&layers=so&query_layers=so` +
      `&CRS=CRS:84&BBOX=72.90,18.90,72.99,18.99` +
      `&WIDTH=10&HEIGHT=10&I=5&J=5` +
      `&INFO_FORMAT=application/json` +
      `&TIME=${today}T00:00:00.000Z&ELEVATION=-0.49`;

    const res = await fetch(url, {
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
      },
      next: { revalidate: 3600 },          // 1-hr cache — daily product
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`CMEMS HTTP ${res.status}`);

    const json = await res.json();
    const raw = json?.features?.[0]?.properties?.so;
    return raw != null
      ? parseFloat(Number(raw).toFixed(1))
      : parseFloat((34.5 + Math.random() * 1.5).toFixed(1));
  } catch (err) {
    console.error('[CMEMS] Fetch failed:', err);
    return parseFloat((34.5 + Math.random() * 1.5).toFixed(1));
  }
}

// ─── 4. INCOIS Ocean State Forecast ──────────────────────────────────────────
// INCOIS provides JSON OSF for Indian coastal locations (free, Govt. of India)
// Portal: https://incois.gov.in/portal/osf/

export interface INCOISForecast {
  significantWaveHeight: number | null;
  meanWavePeriod: number | null;
  swellHeight: number | null;
  currentSpeed: number | null;
  source: 'INCOIS_LIVE' | 'INCOIS_UNAVAILABLE';
}

export async function fetchINCOISForecast(): Promise<INCOISForecast> {
  try {
    // INCOIS OSF point query for Mumbai coastal node
    const res = await fetch(
      `https://incois.gov.in/portal/osf/osfJsonData.jsp?lat=${LAT}&lon=${LNG}`,
      {
        next: { revalidate: 10800 },        // 3-hr cache — INCOIS update cycle
        signal: AbortSignal.timeout(10000),
        headers: { 'Accept': 'application/json' },
      }
    );

    if (!res.ok) throw new Error(`INCOIS HTTP ${res.status}`);

    const data = await res.json();
    return {
      significantWaveHeight: data?.swh   ?? null,
      meanWavePeriod:        data?.mwp   ?? null,
      swellHeight:           data?.sh    ?? null,
      currentSpeed:          data?.cs    ?? null,
      source:                'INCOIS_LIVE',
    };
  } catch (err) {
    console.warn('[INCOIS] Forecast fetch failed:', err);
    return {
      significantWaveHeight: null,
      meanWavePeriod:        null,
      swellHeight:           null,
      currentSpeed:          null,
      source:                'INCOIS_UNAVAILABLE',
    };
  }
}

// ─── Composite: Live water quality ───────────────────────────────────────────
// Combines CMEMS salinity + marine wave proxy for turbidity
// pH and DO are stable oceanic values for Arabian Sea (no free real-time source)

export async function fetchLiveWaterQuality(
  marineData?: LiveMarineData
): Promise<LiveWaterQuality> {
  try {
  const [salinityResult, marineResult] = await Promise.allSettled([
    fetchCMEMSSalinity(),
    marineData ? Promise.resolve(marineData) : fetchMarineWaves(),
  ]);
  const salinity = salinityResult.status === 'fulfilled' ? salinityResult.value : 35.2;
  const marine   = marineResult.status   === 'fulfilled' ? marineResult.value   : marineFallback();

  // Turbidity proxy: higher wave height → more suspended sediment
  const turbidityFromWaves = parseFloat(
    Math.min(25, 4 + marine.waveHeight * 6 + Math.random() * 2).toFixed(1)
  );

  // DO proxy: warm Arabian Sea, slight seasonal variation
  const month = new Date().getMonth();  // 0-11
  const doBase = month >= 5 && month <= 8 ? 5.8 : 7.2; // lower in monsoon
  const dissolvedOxygen = parseFloat((doBase + Math.random() * 1.5).toFixed(1));

  // pH: stable Arabian Sea range 8.0–8.4
  const ph = parseFloat((8.0 + Math.random() * 0.4).toFixed(2));

  // Overall water quality index (0-100): weighted score
  const salinityScore = salinity >= 33 && salinity <= 37 ? 100 : 60;
  const doScore       = dissolvedOxygen >= 6 ? 100 : dissolvedOxygen * 16;
  const turbScore     = Math.max(0, 100 - turbidityFromWaves * 4);
  const phScore       = ph >= 7.5 && ph <= 8.5 ? 100 : 50;
  const overallIndex  = Math.floor((salinityScore + doScore + turbScore + phScore) / 4);

  return {
    ph,
    salinity,
    dissolvedOxygen,
    turbidity:    turbidityFromWaves,
    overallIndex,
  };
  } catch (err) {
    console.error('[WaterQuality] Composite fetch failed:', err);
    return waterQualityFallback();
  }
}