// src/controllers/baseapi/baseapi-finanzas-cxc.controller.ts
import { obtenerResumenCxc, } from "../../service/baseapi/finanzas/cxc-documentos.service.js";
const TTL_MS = 5 * 60 * 1000;
const cache = new Map();
const enCurso = new Map();
function parseEmpresa(value) {
    const empresa = String(value ?? "").trim().toLowerCase();
    if (empresa !== "econnet" && empresa !== "rids") {
        throw new Error("Empresa inválida. Usa empresa=econnet o empresa=rids.");
    }
    return empresa;
}
function parseRefrescar(value) {
    return value === "1" || value === "true";
}
/** Borra la caché (por ejemplo, después de registrar un pago desde otro módulo). */
export function invalidarCacheCxc(empresaKey) {
    if (empresaKey)
        cache.delete(empresaKey);
    else
        cache.clear();
}
async function calcular(empresaKey) {
    const { documentos, notas, diagnostico, ...resumen } = await obtenerResumenCxc({ empresaKey });
    const periodos = diagnostico.periodosLeidos;
    return {
        resumen: {
            ...resumen,
            generadoAt: new Date().toISOString(),
            diagnostico: {
                periodosLeidos: periodos.length,
                primerPeriodo: periodos[0] ?? null,
                ultimoPeriodo: periodos[periodos.length - 1] ?? null,
                sinVencimiento: diagnostico.sinVencimiento,
                plazoEmpresa: diagnostico.plazoEmpresa,
                ncInferidas: diagnostico.ncInferidas.length,
                ncSinAplicar: diagnostico.ncSinAplicar.length,
            },
        },
        documentos: documentos.map(({ notasCredito, ...d }) => ({ ...d, notasCredito: notasCredito.map((nc) => `61-${nc.folio}`) })),
        notas,
    };
}
export async function obtenerCalculo(empresaKey, refrescar) {
    const guardado = cache.get(empresaKey);
    if (!refrescar && guardado && Date.now() - guardado.at < TTL_MS) {
        return { data: guardado.data, desdeCache: true };
    }
    let promesa = enCurso.get(empresaKey);
    if (!promesa) {
        promesa = calcular(empresaKey).finally(() => enCurso.delete(empresaKey));
        enCurso.set(empresaKey, promesa);
    }
    const data = await promesa;
    cache.set(empresaKey, { at: Date.now(), data });
    return { data, desdeCache: false };
}
function responderError(res, error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[FINANZAS CXC] Error:", error);
    return res.status(message.startsWith("Empresa inválida") ? 400 : 500).json({
        ok: false,
        error: message,
        message,
    });
}
export async function getResumenCxc(req, res) {
    try {
        const empresaKey = parseEmpresa(req.query.empresa);
        const { data, desdeCache } = await obtenerCalculo(empresaKey, parseRefrescar(req.query.refrescar));
        const mesActual = data.resumen.hoy.slice(0, 7);
        const respuesta = {
            ...data.resumen,
            desdeCache,
            documentos: data.documentos.filter((d) => d.estado === "VENCIDO" ||
                d.estado === "PENDIENTE" ||
                (d.estado === "PAGADO" && Boolean(d.pagadoAt?.startsWith(mesActual)))),
        };
        return res.json({ ok: true, data: respuesta });
    }
    catch (error) {
        return responderError(res, error);
    }
}
/** Busca una factura en el cálculo de la empresa (usa la caché). Lo usan los envíos manuales (Fase 2b). */
export async function buscarDocumentoCxc(params) {
    const empresaKey = parseEmpresa(params.empresa);
    const tipoDoc = String(params.tipoDoc ?? "").trim();
    const folio = String(params.folio ?? "").trim();
    const rut = String(params.rutContraparte ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
    const { data } = await obtenerCalculo(empresaKey, false);
    const documento = data.documentos.find((d) => d.tipoDoc === tipoDoc && d.folio === folio && d.rutContraparte.replace(/[^0-9kK]/g, "").toUpperCase() === rut) ?? null;
    return { empresaKey, documento };
}
export async function getDocumentosCxc(req, res) {
    try {
        const empresaKey = parseEmpresa(req.query.empresa);
        const { data, desdeCache } = await obtenerCalculo(empresaKey, parseRefrescar(req.query.refrescar));
        const respuesta = {
            empresaKey,
            hoy: data.resumen.hoy,
            generadoAt: data.resumen.generadoAt,
            desdeCache,
            documentos: data.documentos,
            notas: data.notas,
        };
        return res.json({ ok: true, data: respuesta });
    }
    catch (error) {
        return responderError(res, error);
    }
}
//# sourceMappingURL=baseapi-finanzas-cxc.controller.js.map