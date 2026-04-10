import { Location } from "../constants";

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
  async getWeatherForDay(loc: Location, dateStr: string): Promise<WeatherInfo | null> {
    try {
      // Parse dateStr like "May 14" to a Date object for 2026
      const monthMap: Record<string, number> = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
      };
      const parts = dateStr.split(' ');
      if (parts.length < 2) return null;
      
      const month = monthMap[parts[0].substring(0, 3)];
      const day = parseInt(parts[1]);
      if (isNaN(month) || isNaN(day)) return null;

      const date = new Date(2026, month, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Open-Meteo Forecast API
      // If the date is within 16 days, we can get a forecast.
      const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays < 0 || diffDays > 16) {
        // Too far in the future or past for standard forecast
        return null;
      }

      const dateString = date.toISOString().split('T')[0];
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&start_date=${dateString}&end_date=${dateString}`;
      
      const res = await fetch(url);
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
