// src/controllers/baseapi/baseapi-factura-envio-automatico.controller.ts
import { simularFacturasEmitidas, prepararFacturasEmitidas, } from "../../service/baseapi/facturas/factura-envio-automatico.service.js";
import { procesarEnviosFactura, } from "../../service/baseapi/facturas/factura-envio.service.js";
/* =========================================================
   HELPERS
========================================================= */
const EMPRESAS_VALIDAS = new Set([
    "econnet",
    "rids",
]);
function parseEmpresas(value) {
    if (value ===
        undefined ||
        value ===
            null ||
        value ===
            "") {
        return undefined;
    }
    const rawValues = Array.isArray(value)
        ? value
        : [
            value,
        ];
    const empresas = rawValues
        .map((item) => String(item)
        .trim()
        .toLowerCase())
        .filter((item) => EMPRESAS_VALIDAS.has(item));
    return [
        ...new Set(empresas),
    ];
}
/* =========================================================
   SIMULAR
========================================================= */
export async function simularEnvioFacturas(req, res) {
    try {
        /*
         * Admitimos:
         *
         * {
         *   "empresas": ["econnet"]
         * }
         *
         * y también por compatibilidad:
         *
         * {
         *   "empresa": "econnet"
         * }
         */
        const empresasInput = req.body
            ?.empresas ??
            req.body
                ?.empresa ??
            req.query
                ?.empresas ??
            req.query
                ?.empresa;
        const empresas = parseEmpresas(empresasInput);
        /*
         * Si el cliente suministró explícitamente un valor,
         * pero no quedó ninguna empresa válida,
         * devolvemos 400 en vez de caer silenciosamente
         * en ECONNET + RIDS.
         */
        if (empresasInput !==
            undefined &&
            (!empresas ||
                empresas.length ===
                    0)) {
            return res
                .status(400)
                .json({
                ok: false,
                error: "Debe indicar al menos una empresa válida: econnet o rids.",
            });
        }
        console.log("[FACTURA AUTO] Parámetros recibidos en /simular", {
            empresas: empresas ??
                [
                    "econnet",
                    "rids",
                ],
        });
        const resultado = await simularFacturasEmitidas(empresas
            ? {
                empresas,
            }
            : {});
        return res.json({
            ok: true,
            ...resultado,
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);
        console.error("[FACTURA AUTO] ❌ Error en /simular", {
            error: message,
        });
        return res
            .status(500)
            .json({
            ok: false,
            error: message,
        });
    }
}
/* =========================================================
   PREPARAR
========================================================= */
export async function prepararEnvioFacturas(req, res) {
    try {
        const empresasInput = req.body
            ?.empresas ??
            req.body
                ?.empresa ??
            req.query
                ?.empresas ??
            req.query
                ?.empresa;
        const empresas = parseEmpresas(empresasInput);
        /*
         * Si el usuario mandó un valor explícito
         * pero es inválido, detenemos el proceso.
         *
         * Esto es especialmente importante aquí
         * porque /preparar SÍ escribe en BD.
         */
        if (empresasInput !==
            undefined &&
            (!empresas ||
                empresas.length ===
                    0)) {
            return res
                .status(400)
                .json({
                ok: false,
                error: "Debe indicar al menos una empresa válida: econnet o rids.",
            });
        }
        console.log("[FACTURA AUTO] Parámetros recibidos en /preparar", {
            empresas: empresas ??
                [
                    "econnet",
                    "rids",
                ],
        });
        /*
         * exactOptionalPropertyTypes=true:
         *
         * no enviamos:
         *
         * { empresas: undefined }
         *
         * sino {}.
         */
        const resultado = await prepararFacturasEmitidas(empresas
            ? {
                empresas,
            }
            : {});
        return res.json({
            ok: true,
            ...resultado,
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);
        console.error("[FACTURA AUTO] ❌ Error en /preparar", {
            error: message,
        });
        return res
            .status(500)
            .json({
            ok: false,
            error: message,
        });
    }
}
/* =========================================================
   ENVIAR PENDIENTES
========================================================= */
export async function enviarFacturasPendientes(req, res) {
    try {
        const empresaInput = req.body
            ?.empresa ??
            req.query
                ?.empresa;
        let empresa;
        if (empresaInput !==
            undefined) {
            const empresas = parseEmpresas(empresaInput);
            if (!empresas ||
                empresas.length !==
                    1) {
                return res
                    .status(400)
                    .json({
                    ok: false,
                    error: "Debe indicar una empresa válida: econnet o rids.",
                });
            }
            empresa =
                empresas[0];
        }
        const limiteRaw = req.body
            ?.limite ??
            req.query
                ?.limite ??
            20;
        const limite = Number(limiteRaw);
        if (!Number.isFinite(limite) ||
            limite <=
                0) {
            return res
                .status(400)
                .json({
                ok: false,
                error: "limite debe ser un número mayor que 0.",
            });
        }
        console.log("[FACTURA AUTO] Parámetros recibidos en /enviar-pendientes", {
            empresa: empresa ??
                "todas",
            limite,
        });
        const resultado = await procesarEnviosFactura(empresa
            ? {
                empresa,
                limite,
            }
            : {
                limite,
            });
        return res.json({
            ok: true,
            ...resultado,
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);
        console.error("[FACTURA AUTO] ❌ Error en /enviar-pendientes", {
            error: message,
        });
        return res
            .status(500)
            .json({
            ok: false,
            error: message,
        });
    }
}
//# sourceMappingURL=baseapi-factura-envio-automatico.controller.js.map