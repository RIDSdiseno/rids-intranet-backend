// Servicio para interactuar con la API de TeamViewer
import axios from "axios";

const TEAMVIEWER_API = "https://webapi.teamviewer.com/api/v1";

// Configuración de Axios para TeamViewer
const api = axios.create({
  baseURL: TEAMVIEWER_API,
  headers: {
    Authorization: `Bearer ${process.env.TEAMVIEWER_TOKEN}`,
  },
});

// Función para obtener conexiones desde TeamViewer
export async function getConnections(fromDate?: string) {
  try {
    const response = await api.get("/reports/connections", {
      params: fromDate
        ? { from_date: fromDate }
        : undefined,
    });

    return response.data;
  } catch (error: any) {
    console.error("TeamViewer error:", error.response?.data || error.message);
    throw error;
  }
}

// Función para obtener detalles de un dispositivo específico
export async function getDevice(deviceId: string) {
  try {
    const response = await api.get(`/devices/${deviceId}`);
    return response.data;
  } catch (error: any) {
    console.error(
      "TeamViewer device error:",
      error.response?.data || error.message
    );
    throw error;
  }
}
