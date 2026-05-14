// src/service/baseapi/baseapi.client.ts
import axios, { AxiosError } from "axios";

const BASEAPI_URL = process.env.BASEAPI_URL ?? "https://api.baseapi.cl";
const BASEAPI_KEY = process.env.BASEAPI_KEY ?? "";

if (!BASEAPI_KEY) {
    console.warn("⚠️ BASEAPI_KEY no está configurada");
}

export const baseApiClient = axios.create({
    baseURL: BASEAPI_URL,
    timeout: 180_000,
    headers: {
        "x-api-key": BASEAPI_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
    },
});

// Función para normalizar errores de BaseAPI, extrayendo el mensaje relevante y el status code si están disponibles, y retornando un Error con esa información.
export function normalizeBaseApiError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<any>;

        const status = axiosError.response?.status;
        const rawData = axiosError.response?.data;

        let message = axiosError.message;

        if (typeof rawData === "string") {
            message = rawData;
        } else if (rawData?.message) {
            message = rawData.message;
        } else if (rawData?.error) {
            message = rawData.error;
        } else if (rawData) {
            message = JSON.stringify(rawData);
        }

        return new Error(
            `BaseAPI error${status ? ` (${status})` : ""}: ${message}`
        );
    }

    return error instanceof Error ? error : new Error(String(error));
}