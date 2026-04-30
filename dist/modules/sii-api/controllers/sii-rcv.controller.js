// src/modules/sii-api/controllers/sii-rcv.controller.ts
import { obtenerRcvCompras, obtenerRcvVentas, } from "../services/sii-rcv.service.js";
import { getEmpresaConfig } from "../services/sii-api-auth.service.js";
function parseBoolean(value) {
    return value === true || value === "true" || value === "1";
}
function parseEmpresaKey(raw) {
    const key = String(raw ?? "").toLowerCase().trim();
    if (!key) {
        return { ok: false, status: 400, error: "Debe enviar el parámetro 'empresa'" };
    }
    try {
        getEmpresaConfig(key); // valida que exista y tenga credenciales
        return { ok: true, empresaKey: key };
    }
    catch {
        return { ok: false, status: 400, error: `Empresa inválida o sin configuración: ${key}` };
    }
}
function parsePeriodo(req) {
    const mes = String(req.query.mes ?? "").padStart(2, "0");
    const ano = String(req.query.ano ?? "");
    if (!mes || mes === "00" || !ano) {
        return { ok: false, status: 400, error: "Debe enviar mes y ano" };
    }
    if (!/^\d{2}$/.test(mes) || Number(mes) < 1 || Number(mes) > 12) {
        return { ok: false, status: 400, error: "Mes inválido (01-12)" };
    }
    if (!/^\d{4}$/.test(ano)) {
        return { ok: false, status: 400, error: "Año inválido (ej: 2026)" };
    }
    return { ok: true, mes, ano };
}
export async function getRcvVentas(req, res) {
    try {
        const empresaResult = parseEmpresaKey(req.query.empresa);
        if (!empresaResult.ok) {
            return res.status(empresaResult.status).json({ ok: false, error: empresaResult.error });
        }
        const periodoResult = parsePeriodo(req);
        if (!periodoResult.ok) {
            return res.status(periodoResult.status).json({ ok: false, error: periodoResult.error });
        }
        const result = await obtenerRcvVentas({
            empresaKey: empresaResult.empresaKey,
            mes: periodoResult.mes,
            ano: periodoResult.ano,
            forceRefresh: parseBoolean(req.query.forceRefresh),
        });
        const config = getEmpresaConfig(empresaResult.empresaKey);
        return res.json({
            ok: true,
            tipo: "ventas",
            empresa: empresaResult.empresaKey,
            rutEmpresa: config.rutEmpresa,
            mes: periodoResult.mes,
            ano: periodoResult.ano,
            source: result.source,
            total: result.documentos.length,
            documentos: result.documentos,
        });
    }
    catch (error) {
        console.error("❌ Error getRcvVentas:", error);
        return res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : "Error consultando RCV ventas",
        });
    }
}
export async function getRcvCompras(req, res) {
    try {
        const empresaResult = parseEmpresaKey(req.query.empresa);
        if (!empresaResult.ok) {
            return res.status(empresaResult.status).json({ ok: false, error: empresaResult.error });
        }
        const periodoResult = parsePeriodo(req);
        if (!periodoResult.ok) {
            return res.status(periodoResult.status).json({ ok: false, error: periodoResult.error });
        }
        const result = await obtenerRcvCompras({
            empresaKey: empresaResult.empresaKey,
            mes: periodoResult.mes,
            ano: periodoResult.ano,
            forceRefresh: parseBoolean(req.query.forceRefresh),
        });
        const config = getEmpresaConfig(empresaResult.empresaKey);
        return res.json({
            ok: true,
            tipo: "compras",
            empresa: empresaResult.empresaKey,
            rutEmpresa: config.rutEmpresa,
            mes: periodoResult.mes,
            ano: periodoResult.ano,
            source: result.source,
            total: result.documentos.length,
            documentos: result.documentos,
        });
    }
    catch (error) {
        console.error("❌ Error getRcvCompras:", error);
        return res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : "Error consultando RCV compras",
        });
    }
}
//# sourceMappingURL=sii-rcv.controller.js.map