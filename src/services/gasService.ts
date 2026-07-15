export const gasService = {
  async getArizonaAverage(): Promise<string | null> {
    const CACHE_KEY = 'eia_gas_price_az';
    const CACHE_TIME_KEY = 'eia_gas_price_az_timestamp';
    
    // Check cache (24 hours)
    const cachedPrice = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
    
    if (cachedPrice && cachedTime) {
      const timeDiff = new Date().getTime() - parseInt(cachedTime);
      if (timeDiff < 24 * 60 * 60 * 1000) {
        return cachedPrice;
      }
    }

    try {
      // Fetch via backend proxy to bypass CORS/sandboxed iframe fetch blocks and protect the API key
      const response = await fetch('/api/gas', {
        credentials: "include"
      });
      if (!response.ok) {
        // If the key is missing or invalid, return a graceful fallback 
        // to avoid breaking the UI for the user.
        return null;
      }

      const data = await response.json();
      const value = data?.response?.data?.[0]?.value;

      if (value !== undefined) {
        const formattedPrice = Number(value).toFixed(2);
        localStorage.setItem(CACHE_KEY, formattedPrice);
        localStorage.setItem(CACHE_TIME_KEY, new Date().getTime().toString());
        return formattedPrice;
      }
      return null;
    } catch (error) {
      console.error("Gas fetch error:", error);
      return null;
    }
  }
};
