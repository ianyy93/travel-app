import { Location } from "../constants";
import { parseItineraryDate } from "../lib/utils";

export interface WeatherInfo {
  minTemp: number;
  maxTemp: number;
  condition: string;
  icon: string;
}

// Mapping Open-Meteo WMO codes to Lucide icons (or simplified strings)
// https://open-meteo.com/en/docs
const getConditionFromCode = (code: number): { condition: string, icon: string } => {
  if (code === 0) return { condition: 'Clear sky', icon: 'Sun' };
  if (code >= 1 && code <= 3) return { condition: 'Partly cloudy', icon: 'Cloud' };
  if (code >= 45 && code <= 48) return { condition: 'Fog', icon: 'Cloud' };
  if (code >= 51 && code <= 55) return { condition: 'Drizzle', icon: 'CloudRain' };
  if (code >= 61 && code <= 65) return { condition: 'Rain', icon: 'CloudRain' };
  if (code >= 71 && code <= 77) return { condition: 'Snow', icon: 'Snowflake' };
  if (code >= 80 && code <= 82) return { condition: 'Rain showers', icon: 'CloudRain' };
  if (code >= 95 && code <= 99) return { condition: 'Thunderstorm', icon: 'CloudLightning' };
  return { condition: 'Unknown', icon: 'Sun' };
};

export const weatherService = {
  async getWeatherForDay(loc: Location, dateStr: string, tripDatesStr?: string): Promise<WeatherInfo | null> {
    try {
      const date = parseItineraryDate(dateStr, tripDatesStr);
      if (!date) return null;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Open-Meteo Forecast API
      // If the date is within 16 days, we can get a forecast.
      const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      const dateString = date.toISOString().split('T')[0];
      
      let url = '';

      if (diffDays < 0) {
        // Date is in the past, use the archive API
        url = `https://archive-api.open-meteo.com/v1/archive?latitude=${loc.lat}&longitude=${loc.lng}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&start_date=${dateString}&end_date=${dateString}`;
      } else if (diffDays <= 16) {
        // Date is within next 16 days, use forecast API
        url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&start_date=${dateString}&end_date=${dateString}`;
      } else {
        // More than 16 days ahead, show nothing
        return null;
      }

      // Use the server-side proxy to bypass CORS/sandboxed iframe fetch blocks
      const proxyUrl = `/api/weather?lat=${loc.lat}&lng=${loc.lng}&date=${dateString}&isArchive=${diffDays < 0}`;
      const res = await fetch(proxyUrl, {
        credentials: "include"
      });
      if (!res.ok) {
        throw new Error(`Weather proxy returned status ${res.status}`);
      }
      const data = await res.json();

      if (data.daily && data.daily.temperature_2m_max && data.daily.temperature_2m_max[0] !== undefined) {
        const { condition, icon } = getConditionFromCode(data.daily.weathercode[0]);
        return {
          minTemp: Math.round(data.daily.temperature_2m_min[0]),
          maxTemp: Math.round(data.daily.temperature_2m_max[0]),
          condition,
          icon
        };
      }

      return null;
    } catch (error) {
      console.error("Weather fetch error:", error);
      return null;
    }
  }
};
