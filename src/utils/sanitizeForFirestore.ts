export const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined) return null;
  
  if (typeof obj === 'number') {
    if (isNaN(obj) || !isFinite(obj)) return null;
    return obj;
  }
  
  if (typeof obj === 'string') {
    if (obj.trim() === '') return null;
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore).filter(item => item !== undefined);
  }
  
  if (obj !== null && typeof obj === 'object') {
    const cleaned: any = {};
    
    // Flag invalid lat/lng by dropping them, so frontend shows missing location badge
    let isInvalidLocation = false;
    if ('lat' in obj || 'lng' in obj) {
      const lat = Number(obj.lat);
      const lng = Number(obj.lng);
      if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
        isInvalidLocation = true;
      }
    }

    for (const key in obj) {
      if (isInvalidLocation && (key === 'lat' || key === 'lng')) {
        continue; // Strip invalid coordinates
      }
      
      const val = sanitizeForFirestore(obj[key]);
      if (val !== undefined) {
        cleaned[key] = val;
      }
    }
    
    return cleaned;
  }
  
  return obj;
};
