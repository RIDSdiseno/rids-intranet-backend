import axios from "axios";
const TEAMVIEWER_API = "https://webapi.teamviewer.com/api/v1";
const api = axios.create({
    baseURL: TEAMVIEWER_API,
    headers: {
        Authorization: `Bearer ${process.env.TEAMVIEWER_TOKEN}`,
    },
});
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