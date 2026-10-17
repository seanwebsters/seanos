import "server-only";

export interface Weather { temp_c: number; high_c: number; low_c: number; rain_chance: number; summary: string; code: number; fetched_at: string }

const CODES: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Showers", 81: "Showers", 82: "Heavy showers", 95: "Thunderstorms",
};

let cache: { key: string; at: number; value: Weather } | null = null;

/** Live weather from Open-Meteo (free, no key). Returns null when unreachable. */
export async function getWeather(lat: number, lng: number): Promise<Weather | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (cache && cache.key === key && Date.now() - cache.at < 30 * 60_000) return cache.value;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FLondon&forecast_days=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { current: { temperature_2m: number; weather_code: number }; daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] } };
    const value: Weather = {
      temp_c: Math.round(j.current.temperature_2m),
      high_c: Math.round(j.daily.temperature_2m_max[0]),
      low_c: Math.round(j.daily.temperature_2m_min[0]),
      rain_chance: j.daily.precipitation_probability_max[0] ?? 0,
      code: j.current.weather_code,
      summary: CODES[j.current.weather_code] ?? "Mixed",
      fetched_at: new Date().toISOString(),
    };
    cache = { key, at: Date.now(), value };
    return value;
  } catch {
    return null;
  }
}
