// src/controllers/simpleapi.controller.ts
import { consultarVentasRCV, consultarResumenVentasRCV, consultarComprasRCV, consultarResumenComprasRCV, } from "../service/simple-api/simpleapi.service.js";
const EMPRESAS_PERMITIDAS = {
    econnet: process.env.RUT_EMPRESA ?? "",
    rids: process.env.RIDS_RUT_EMPRESA ?? "",
};
function validarMesAno(mes, ano) {
    if (!mes || !ano) {
        return "Parámetros requeridos: mes (01-12) y ano (ej: 2026)";
    }
    const mesNormalizado = String(mes).padStart(2, "0");
    if (!/^\d{2}$/.test(mesNormalizado) ||
        Number(mesNormalizado) < 1 ||
        Number(mesNormalizado) > 12) {
        return "Mes inválido. Debe estar entre 01 y 12";
    }
    if (!/^\d{4}$/.test(ano)) {
        return "Año inválido. Debe tener formato YYYY";
    }
    return null;
}
function resolverRutEmpresa(empresaRaw) {
    const empresa = String(empresaRaw ?? "").toLowerCase().trim();
    if (!empresa) {
        return {
            ok: false,
            error: "Debe enviar empresa. Ejemplo: empresa=econnet",
        };
    }
    const rutEmpresa = EMPRESAS_PERMITIDAS[empresa];
    if (!rutEmpresa) {
        return {
            ok: false,
            error: `Empresa inválida o sin RUT configurado: ${empresa}`,
        };
    }
    return {
        ok: true,
        empresa,
        rutEmpresa,
    };
}
function parseForceRefresh(req) {
    return req.query.refresh === "true";
}
// ============================================================
// GET /api/facturas/ventas?mes=01&ano=2026&empresa=econnet&refresh=true
// ============================================================
export async function getVentasRCV(req, res) {
    try {
        const mes = req.query.mes;
        const ano = req.query.ano;
        const forceRefresh = parseForceRefresh(req);
        const errorPeriodo = validarMesAno(mes, ano);
        if (errorPeriodo) {
            res.status(400).json({
                ok: false,
                error: errorPeriodo,
            });
            return;
        }
        const empresaResult = resolverRutEmpresa(req.query.empresa);
        if (!empresaResult.ok) {
            res.status(400).json({
                ok: false,
                error: empresaResult.error,
            });
            return;
        }
        console.log("🏢 RCV ventas:", {
            empresa: empresaResult.empresa,
            rutEmpresa: empresaResult.rutEmpresa,
            mes,
            ano,
            forceRefresh,
        });
        const resultado = await consultarVentasRCV(mes, ano, empresaResult.empresa, empresaResult.rutEmpresa, forceRefresh);
        res.json({
            ok: true,
            source: resultado.source,
            empresa: empresaResult.empresa,
            rutEmpresa: empresaResult.rutEmpresa,
            data: resultado.data,
        });
    }
    catch (error) {
        console.error("❌ Error consultando ventas RCV:", error?.message ?? error);
        res.status(500).json({
            ok: false,
            error: error?.message ?? "Error interno al consultar ventas",
        });
    }
}
// ============================================================
// GET /api/facturas/ventas/resumen?mes=01&ano=2026&empresa=econnet
// ============================================================
export async function getResumenVentasRCV(req, res) {
    try {
        const mes = req.query.mes;
        const ano = req.query.ano;
        const forceRefresh = parseForceRefresh(req);
        const errorPeriodo = validarMesAno(mes, ano);
        if (errorPeriodo) {
            res.status(400).json({
                ok: false,
                error: errorPeriodo,
            });
            return;
        }
        const empresaResult = resolverRutEmpresa(req.query.empresa);
        if (!empresaResult.ok) {
            res.status(400).json({
                ok: false,
                error: empresaResult.error,
            });
            return;
        }
        const resultado = await consultarResumenVentasRCV(mes, ano, empresaResult.empresa, empresaResult.rutEmpresa, forceRefresh);
        res.json({
            ok: true,
            source: resultado.source,
            empresa: empresaResult.empresa,
            rutEmpresa: empresaResult.rutEmpresa,
            data: resultado.data,
        });
    }
    catch (error) {
        console.error("❌ Error consultando resumen RCV:", error?.message ?? error);
        res.status(500).json({
            ok: false,
            error: error?.message ?? "Error interno al consultar resumen",
        });
    }
}
// ============================================================
// GET /api/facturas/compras?mes=01&ano=2026&empresa=econnet&refresh=true
// ============================================================
export async function getComprasRCV(req, res) {
    try {
        const mes = req.query.mes;
        const ano = req.query.ano;
        const forceRefresh = parseForceRefresh(req);
        const errorPeriodo = validarMesAno(mes, ano);
        if (errorPeriodo) {
            res.status(400).json({
                ok: false,
                error: errorPeriodo,
            });
            return;
        }
        const empresaResult = resolverRutEmpresa(req.query.empresa);
        if (!empresaResult.ok) {
            res.status(400).json({
                ok: false,
                error: empresaResult.error,
            });
            return;
        }
        console.log("🏢 RCV compras:", {
            empresa: empresaResult.empresa,
            rutEmpresa: empresaResult.rutEmpresa,
            mes,
            ano,
            forceRefresh,
        });
        const resultado = await consultarComprasRCV(mes, ano, empresaResult.empresa, empresaResult.rutEmpresa, forceRefresh);
        res.json({
            ok: true,
            source: resultado.source,
            empresa: empresaResult.empresa,
            rutEmpresa: empresaResult.rutEmpresa,
            data: resultado.data,
        });
    }
    catch (error) {
        console.error("❌ Error consultando compras RCV:", error?.message ?? error);
        res.status(500).json({
            ok: false,
            error: error?.message ?? "Error interno al consultar compras",
        });
    }
}
// ============================================================
// GET /api/facturas/compras/resumen?mes=01&ano=2026&empresa=econnet
// ============================================================
export async function getResumenComprasRCV(req, res) {
    try {
        const mes = req.query.mes;
        const ano = req.query.ano;
        const forceRefresh = parseForceRefresh(req);
        const errorPeriodo = validarMesAno(mes, ano);
        if (errorPeriodo) {
            res.status(400).json({
                ok: false,
                error: errorPeriodo,
            });
            return;
        }
        const empresaResult = resolverRutEmpresa(req.query.empresa);
        if (!empresaResult.ok) {
            res.status(400).json({
                ok: false,
                error: empresaResult.error,
            });
            return;
        }
        const resultado = await consultarResumenComprasRCV(mes, ano, empresaResult.empresa, empresaResult.rutEmpresa, forceRefresh);
        res.json({
            ok: true,
            source: resultado.source,
            empresa: empresaResult.empresa,
            rutEmpresa: empresaResult.rutEmpresa,
            data: resultado.data,
        });
    }
    catch (error) {
        console.error("❌ Error consultando resumen compras RCV:", error?.message ?? error);
        res.status(500).json({
            ok: false,
            error: error?.message ?? "Error interno al consultar resumen compras",
        });
    }
}
//# sourceMappingURL=Simpleapi.controller.js.map