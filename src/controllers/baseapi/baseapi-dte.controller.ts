// src/controllers/baseapi/baseapi-dte.controller.ts
import type { Request, Response } from "express";
import { consultarDtePorFolioBaseApi } from "../../service/baseapi/baseapi-dte.service.js";

function parseEmpresa(value: unknown): "econnet" | "rids" {
    const empresa = String(value ?? "").toLowerCase();

    if (empresa !== "econnet" && empresa !== "rids") {
        throw new Error("Empresa inválida. Usa empresa=econnet o empresa=rids");
    }

    return empresa;
}

// Función para parsear el periodo desde la query, aceptando tanto el formato "periodo=YYYY-MM" como "mes=MM&ano=YYYY", y validando que el formato sea correcto.
function parsePeriodoFromQuery(req: Request): string {
    const periodoRaw = String(req.query.periodo ?? "").trim();

    if (/^\d{4}-\d{2}$/.test(periodoRaw)) {
        return periodoRaw;
    }

    const mes = String(req.query.mes ?? "").padStart(2, "0");
    const ano = String(req.query.ano ?? "");

    if (!/^\d{4}$/.test(ano)) {
        throw new Error("Año inválido");
    }

    if (!/^\d{2}$/.test(mes)) {
        throw new Error("Mes inválido");
    }

    const mesNum = Number(mes);

    if (mesNum < 1 || mesNum > 12) {
        throw new Error("Mes fuera de rango");
    }

    return `${ano}-${mes}`;
}

function parseTipoDTE(value: unknown): number {
    const tipoDTE = Number(value ?? 33);

    if (!Number.isFinite(tipoDTE) || tipoDTE <= 0) {
        throw new Error("tipoDTE inválido");
    }

    return tipoDTE;
}

function parseForceRefresh(value: unknown): boolean {
    return String(value ?? "false").toLowerCase() === "true";
}

// Función para consultar un DTE por folio en BaseAPI, dado la empresa, el periodo, el folio, el tipo de DTE, y si se debe forzar la actualización. Maneja la construcción del endpoint, el body de la petición, y la normalización de errores.
export async function getDtePorFolioBaseApi(req: Request, res: Response) {
    try {
        const empresa = parseEmpresa(req.query.empresa);
        const periodo = parsePeriodoFromQuery(req);
        const folio = String(req.params.folio ?? "").trim();
        const tipoDTE = parseTipoDTE(req.query.tipoDTE);
        const forceRefresh = parseForceRefresh(req.query.forceRefresh);

        if (!folio) {
            res.status(400).json({
                ok: false,
                provider: "baseapi",
                error: "Folio requerido",
            });
            return;
        }

        const resultado = await consultarDtePorFolioBaseApi({
            empresa,
            periodo,
            folio,
            tipoDTE,
            forceRefresh,
        });

        res.json({
            ok: true,
            provider: "baseapi",
            empresa,
            periodo,
            folio,
            tipoDTE,
            cached: resultado.cached,
            data: resultado.data,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        res.status(500).json({
            ok: false,
            provider: "baseapi",
            error: message,
        });
    }
}