// src/controllers/baseapi/baseapi-finanzas-cxc.controller.ts

/* =========================================================
   CUENTAS POR COBRAR (Fases 1b y 2)

   GET /baseapi/finanzas/cxc/resumen?empresa=rids|econnet[&refrescar=1]
     Tarjetas, antigüedad, gráficos y documentos abiertos + pagados del mes.

   GET /baseapi/finanzas/cxc/documentos?empresa=rids|econnet[&refrescar=1]
     Todas las facturas (cualquier estado) y las notas de crédito/débito.

   - Un solo cálculo por empresa, en caché 5 min (Railway corre 1 réplica).
     refrescar=1 fuerza el recálculo (lo usa la pantalla después de
     registrar o anular un pago).
   - Llamadas simultáneas para la misma empresa comparten el cálculo.
   - Solo lectura: nunca consulta BaseAPI (consultaSii = false).
   ========================================================= */

import type { Request, Response } from "express";

import type { EmpresaKey } from "../../service/baseapi/cobranza/cobranza-estado.service.js";

import {
    obtenerResumenCxc,
    type DocumentoCxc,
    type NotaCxc,
    type ResumenCxc,
} from "../../service/baseapi/finanzas/cxc-documentos.service.js";

const TTL_MS = 5 * 60 * 1000;

/** Documento que viaja al frontend (las NC como "61-folio"). */
export type DocumentoCxcVista = Omit<DocumentoCxc, "notasCredito"> & { notasCredito: string[] };

type DiagnosticoVista = {
    periodosLeidos: number;
    primerPeriodo: string | null;
    ultimoPeriodo: string | null;
    sinVencimiento: number;
    plazoEmpresa: number;
    ncInferidas: number;
    ncSinAplicar: number;
};

export type RespuestaResumenCxc = Omit<ResumenCxc, "diagnostico"> & {
    generadoAt: string;
    desdeCache: boolean;
    /** Abiertos (vencidos y por vencer, incluidos sin fecha) y pagados en el mes actual. */
    documentos: DocumentoCxcVista[];
    diagnostico: DiagnosticoVista;
};

export type RespuestaDocumentosCxc = {
    empresaKey: EmpresaKey;
    hoy: string;
    generadoAt: string;
    desdeCache: boolean;
    documentos: DocumentoCxcVista[];
    notas: NotaCxc[];
};

export type Calculo = {
    resumen: Omit<RespuestaResumenCxc, "desdeCache" | "documentos">;
    documentos: DocumentoCxcVista[];
    notas: NotaCxc[];
};

const cache = new Map<EmpresaKey, { at: number; data: Calculo }>();
const enCurso = new Map<EmpresaKey, Promise<Calculo>>();

function parseEmpresa(value: unknown): EmpresaKey {
    const empresa = String(value ?? "").trim().toLowerCase();

    if (empresa !== "econnet" && empresa !== "rids") {
        throw new Error("Empresa inválida. Usa empresa=econnet o empresa=rids.");
    }

    return empresa;
}

function parseRefrescar(value: unknown): boolean {
    return value === "1" || value === "true";
}

/** Borra la caché (por ejemplo, después de registrar un pago desde otro módulo). */
export function invalidarCacheCxc(empresaKey?: EmpresaKey) {
    if (empresaKey) cache.delete(empresaKey);
    else cache.clear();
}

async function calcular(empresaKey: EmpresaKey): Promise<Calculo> {
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

export async function obtenerCalculo(empresaKey: EmpresaKey, refrescar: boolean): Promise<{ data: Calculo; desdeCache: boolean }> {
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

function responderError(res: Response, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[FINANZAS CXC] Error:", error);

    return res.status(message.startsWith("Empresa inválida") ? 400 : 500).json({
        ok: false,
        error: message,
        message,
    });
}

export async function getResumenCxc(req: Request, res: Response) {
    try {
        const empresaKey = parseEmpresa(req.query.empresa);
        const { data, desdeCache } = await obtenerCalculo(empresaKey, parseRefrescar(req.query.refrescar));
        const mesActual = data.resumen.hoy.slice(0, 7);

        const respuesta: RespuestaResumenCxc = {
            ...data.resumen,
            desdeCache,
            documentos: data.documentos.filter(
                (d) =>
                    d.estado === "VENCIDO" ||
                    d.estado === "PENDIENTE" ||
                    (d.estado === "PAGADO" && Boolean(d.pagadoAt?.startsWith(mesActual))),
            ),
        };

        return res.json({ ok: true, data: respuesta });
    } catch (error) {
        return responderError(res, error);
    }
}

/** Busca una factura en el cálculo de la empresa (usa la caché). Lo usan los envíos manuales (Fase 2b). */
export async function buscarDocumentoCxc(params: {
    empresa: unknown;
    tipoDoc: unknown;
    folio: unknown;
    rutContraparte: unknown;
}): Promise<{ empresaKey: EmpresaKey; documento: DocumentoCxcVista | null }> {
    const empresaKey = parseEmpresa(params.empresa);
    const tipoDoc = String(params.tipoDoc ?? "").trim();
    const folio = String(params.folio ?? "").trim();
    const rut = String(params.rutContraparte ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
    const { data } = await obtenerCalculo(empresaKey, false);

    const documento =
        data.documentos.find(
            (d) => d.tipoDoc === tipoDoc && d.folio === folio && d.rutContraparte.replace(/[^0-9kK]/g, "").toUpperCase() === rut,
        ) ?? null;

    return { empresaKey, documento };
}

export async function getDocumentosCxc(req: Request, res: Response) {
    try {
        const empresaKey = parseEmpresa(req.query.empresa);
        const { data, desdeCache } = await obtenerCalculo(empresaKey, parseRefrescar(req.query.refrescar));

        const respuesta: RespuestaDocumentosCxc = {
            empresaKey,
            hoy: data.resumen.hoy,
            generadoAt: data.resumen.generadoAt,
            desdeCache,
            documentos: data.documentos,
            notas: data.notas,
        };

        return res.json({ ok: true, data: respuesta });
    } catch (error) {
        return responderError(res, error);
    }
}