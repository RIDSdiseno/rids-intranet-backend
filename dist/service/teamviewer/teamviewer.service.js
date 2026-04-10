import axios from "axios";
const TEAMVIEWER_API = "https://webapi.teamviewer.com/api/v1";
const api = axios.create({
    baseURL: TEAMVIEWER_API,
    headers: {
        Authorization: `Bearer ${process.env.TEAMVIEWER_TOKEN}`,
    },
});
export async function getConnections(params = {}) {
    try {
        const response = await api.get("/reports/connections", {
            params: {
                ...(params.fromDate ? { from_date: params.fromDate } : {}),
                ...(params.toDate ? { to_date: params.toDate } : {}),
                ...(params.offsetId ? { offset_id: params.offsetId } : {}),
                ...(params.userId ? { userid: params.userId } : {}),
                ...(params.groupId ? { groupid: params.groupId } : {}),
                ...(params.deviceId ? { deviceid: params.deviceId } : {}),
            },
        });
        return response.data;
    }
    catch (error) {
        console.error("TeamViewer error:", error.response?.data || error.message);
        throw error;
    }
}
export async function getAllConnectionsHistorical(params) {
    const all = [];
    let offsetId;
    do {
        const data = await getConnections({
            ...(params.fromDate ? { fromDate: params.fromDate } : {}),
            ...(params.toDate ? { toDate: params.toDate } : {}),
            ...(offsetId ? { offsetId } : {}),
        });
        const records = data?.records ?? [];
        all.push(...records);
        offsetId = data?.next_offset ?? undefined;
    } while (offsetId);
    return all;
}
export function calcDurationMinutes(session) {
    const inicio = new Date(session.start_date);
    let fin = null;
    if (session.end_date) {
        fin = new Date(session.end_date);
    }
    else {
        const durationSeconds = session.duration;
        if (typeof durationSeconds === "number" && durationSeconds >= 0) {
            fin = new Date(inicio.getTime() + durationSeconds * 1000);
        }
    }
    if (!fin)
        return 0;
    const diff = Math.round((fin.getTime() - inicio.getTime()) / 60000);
    return diff > 0 ? diff : 0;
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