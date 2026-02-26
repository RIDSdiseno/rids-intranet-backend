import axios from "axios";

const TEAMVIEWER_API = "https://webapi.teamviewer.com/api/v1";

const api = axios.create({
  baseURL: TEAMVIEWER_API,
  headers: {
    Authorization: `Bearer ${process.env.TEAMVIEWER_TOKEN}`,
  },
});

export async function getConnections() {
  try {
    const response = await api.get("/reports/connections");
    return response.data;
  } catch (error: any) {
    console.error("TeamViewer error:", error.response?.data || error.message);
    throw error;
  }
}