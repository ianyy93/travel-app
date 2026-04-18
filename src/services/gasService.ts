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
      // The U.S. Energy Information Administration (EIA) API
      // Free key available at https://www.eia.gov/opendata/register.php
      const apiKey = import.meta.env.VITE_EIA_API_KEY || 'DEMO_KEY'; 
      // Note: If DEMO_KEY doesn't work, it gracefully fails
      
      const url = `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${apiKey}&frequency=weekly&data[0]=value&facets[series][]=EMM_EPMR_PTE_SAZ_DPG&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=1`;
      
      const response = await fetch(url);
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
