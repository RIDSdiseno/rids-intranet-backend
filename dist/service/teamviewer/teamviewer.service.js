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
export async function getConnections(fromDate) {
    try {
        const response = await api.get("/reports/connections", {
            params: fromDate
                ? { from_date: fromDate }
                : undefined,
        });
        return response.data;
    }
    catch (error) {
        console.error("TeamViewer error:", error.response?.data || error.message);
        throw error;
    }
}
// Función para obtener detalles de un dispositivo específico
export async function getDevice(deviceId) {
    try {
        const response = await api.get(`/devices/${deviceId}`);
        return response.data;
    }
    catch (error) {
        console.error("TeamViewer device error:", error.response?.data || error.message);
        throw error;
    }
}
//# sourceMappingURL=teamviewer.service.js.map