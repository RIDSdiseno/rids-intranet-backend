import axios from "axios";

const TEAMVIEWER_API = "https://webapi.teamviewer.com/api/v1";

const api = axios.create({
  baseURL: TEAMVIEWER_API,
  headers: {
    Authorization: `Bearer ${process.env.TEAMVIEWER_TOKEN}`,
  },
});

type GetConnectionsParams = {
  fromDate?: string;
  toDate?: string;
  offsetId?: string;
  userId?: string;
  groupId?: string;
  deviceId?: string;
};

export interface TeamViewerSession {
  id: string;
  deviceid?: string | number | null;
  devicename?: string | null;
  groupid?: string | number | null;
  groupname?: string | null;
  start_date: string;
  end_date?: string | null;
  duration?: number | null;
}

export async function getConnections(params: GetConnectionsParams = {}) {
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
  } catch (error: any) {
    console.error("TeamViewer error:", error.response?.data || error.message);
    throw error;
  }
}

export async function getAllConnectionsHistorical(params: {
  fromDate?: string;
  toDate?: string;
}) {
  const all: TeamViewerSession[] = [];
  let offsetId: string | undefined;

  do {
    const data = await getConnections({
      ...(params.fromDate ? { fromDate: params.fromDate } : {}),
      ...(params.toDate ? { toDate: params.toDate } : {}),
      ...(offsetId ? { offsetId } : {}),
    });

    const records: TeamViewerSession[] = data?.records ?? [];
    all.push(...records);

    offsetId = data?.next_offset ?? undefined;
  } while (offsetId);

  return all;
}

export function calcDurationMinutes(session: TeamViewerSession): number {
  const inicio = new Date(session.start_date);

  let fin: Date | null = null;

  if (session.end_date) {
    fin = new Date(session.end_date);
  } else if (session.duration) {
    fin = new Date(inicio.getTime() + session.duration * 1000);
  }

  if (!fin) return 0;

  const diff = Math.round((fin.getTime() - inicio.getTime()) / 60000);
  return diff > 0 ? diff : 0;
}

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