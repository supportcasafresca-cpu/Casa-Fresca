window.CASA_FRESCA_CONFIG = Object.freeze({
  backendUrl: "https://backend-casafresca.onrender.com",
  minimumOrderTotal: 10,
  apiUrl(path) {
    const backendUrl = this.backendUrl.trim().replace(/\/+$/, "");
    if (!backendUrl) {
      throw new Error("Configura la URL del nuevo backend Render en Js/config.js.");
    }
    return new URL(path.replace(/^\/+/, ""), `${backendUrl}/`).toString();
  },
  async fetchJson(path, options = {}) {
    const response = await fetch(this.apiUrl(path), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const data = await response.json();
    if (!response.ok || data?.success === false) {
      throw new Error(data?.message || `Error del backend (${response.status}).`);
    }
    return data;
  }
});
