import { consultarDtePorFolioBaseApi } from "../../service/baseapi/baseapi-dte.service.js";
import { prisma } from "../../lib/prisma.js";
import { generarDtePdfBuffer, } from "../../service/baseapi/baseapi-dte-pdf.service.js";
function parseEmpresa(value) {
    const empresa = String(value ?? "").toLowerCase();
    if (empresa !== "econnet" && empresa !== "rids") {
        throw new Error("Empresa inválida. Usa empresa=econnet o empresa=rids");
    }
    return empresa;
}
// Función para parsear el periodo desde la query, aceptando tanto el formato "periodo=YYYY-MM" como "mes=MM&ano=YYYY", y validando que el formato sea correcto.
function parsePeriodoFromQuery(req) {
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
function parseTipoDTE(value) {
    const tipoDTE = Number(value ?? 33);
    if (!Number.isFinite(tipoDTE) || tipoDTE <= 0) {
        throw new Error("tipoDTE inválido");
    }
    return tipoDTE;
}
function parseForceRefresh(value) {
    return String(value ?? "false").toLowerCase() === "true";
}
// Función para consultar un DTE por folio en BaseAPI, dado la empresa, el periodo, el folio, el tipo de DTE, y si se debe forzar la actualización. Maneja la construcción del endpoint, el body de la petición, y la normalización de errores.
/* ===================== Acceso del CLIENTE ===================== */
function normalizarRutDte(value) {
    return String(value ?? "")
        .replace(/\./g, "")
        .replace(/-/g, "")
        .replace(/\s/g, "")
        .toUpperCase()
        .trim();
}
function esClienteDte(req) {
    return String(req.user?.rol ?? "").toUpperCase().trim() === "CLIENTE";
}
/**
 * Internos: siempre true. CLIENTE: true solo si el RUT de su empresa aparece en
 * el documento (mismo criterio de respaldo que el filtro de RCV ventas).
 */
async function documentoEsDelCliente(req, data) {
    if (!esClienteDte(req))
        return true;
    const empresaId = Number(req.user?.empresaId);
    if (!empresaId)
        return false;
    const empresa = await prisma.empresa.findUnique({
        where: { id_empresa: empresaId },
        select: { detalleEmpresa: { select: { rut: true } } },
    });
    const rut = normalizarRutDte(empresa?.detalleEmpresa?.rut);
    if (!rut)
        return false;
    return normalizarRutDte(JSON.stringify(data ?? "")).includes(rut);
}
function responderDteNoPermitido(res) {
    res.status(403).json({
        ok: false,
        provider: "baseapi",
        error: "No tienes acceso a este documento",
    });
}
export async function getDtePorFolioBaseApi(req, res) {
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
        if (!(await documentoEsDelCliente(req, resultado.data))) {
            responderDteNoPermitido(res);
            return;
        }
        // Exponer ted_xml (bloque <TED> completo, usado para el PDF417 del Timbre Electrónico SII) a nivel superior también, para acceso rápido
        const documento = resultado.data?.data?.documento;
        res.json({
            ok: true,
            provider: "baseapi",
            empresa,
            periodo,
            folio,
            tipoDTE,
            cached: resultado.cached,
            ted_xml: documento?.ted_xml ?? null,
            data: resultado.data,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({
            ok: false,
            provider: "baseapi",
            error: message,
        });
    }
}
export async function getDtePdfPorFolioBaseApi(req, res) {
    try {
        const empresa = parseEmpresa(req.query
            .empresa);
        const periodo = parsePeriodoFromQuery(req);
        const folio = String(req.params
            .folio ??
            "").trim();
        const tipoDTE = parseTipoDTE(req.query
            .tipoDTE);
        const forceRefresh = parseForceRefresh(req.query
            .forceRefresh);
        if (!folio) {
            res
                .status(400)
                .json({
                ok: false,
                error: "Folio requerido",
            });
            return;
        }
        /* CLIENTE: antes de generar el PDF, confirmar que el documento es suyo */
        if (esClienteDte(req)) {
            const dte = await consultarDtePorFolioBaseApi({
                empresa,
                periodo,
                folio,
                tipoDTE,
                forceRefresh: false,
            });
            if (!(await documentoEsDelCliente(req, dte.data))) {
                responderDteNoPermitido(res);
                return;
            }
        }
        const resultado = await generarDtePdfBuffer({
            empresa,
            periodo,
            folio,
            tipoDTE,
            forceRefresh,
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${resultado.filename}"`);
        res.send(resultado.buffer);
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);
        console.error("❌ Error generando PDF DTE:", message);
        res
            .status(500)
            .json({
            ok: false,
            error: message,
        });
    }
}
function escapeHtml(input) {
    if (input === undefined || input === null)
        return "";
    return String(input)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
//# sourceMappingURL=baseapi-dte.controller.js.map