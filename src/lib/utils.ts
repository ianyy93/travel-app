import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseItineraryDate(dayDateStr?: string, tripDatesStr?: string): Date | null {
  if (!dayDateStr) return null;
  
  const currentYear = new Date().getFullYear();
  let year = currentYear;

  if (tripDatesStr) {
    const yearMatch = tripDatesStr.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      year = parseInt(yearMatch[1]);
    }
  }

  const dayYearMatch = dayDateStr.match(/\b(20\d{2})\b/);
  if (dayYearMatch) {
    year = parseInt(dayYearMatch[1]);
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  let month = -1;
  let day = -1;

  const parts = dayDateStr.replace(/,/g, '').split(' ');
  for (const p of parts) {
    const mIdx = monthNames.findIndex(m => p.startsWith(m));
    const fmIdx = fullMonthNames.findIndex(m => p.startsWith(m));
    if (month === -1 && (mIdx !== -1 || fmIdx !== -1)) {
      month = mIdx !== -1 ? mIdx : fmIdx;
    } else if (day === -1 && !isNaN(parseInt(p)) && p.length <= 2) {
      day = parseInt(p);
    }
  }

  if (month !== -1 && day !== -1) {
    return new Date(year, month, day);
  }

  const fallbackDate = new Date(`${dayDateStr} ${year}`);
  if (!isNaN(fallbackDate.getTime())) {
    return fallbackDate;
  }

  return null;
}

export const parseTime = (timeStr: string) => {
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
};

export const toMinutes = (timeStr: string) => {
  if (!timeStr) return 0;
  try {
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  } catch (e) {
    return 0;
  }
};
