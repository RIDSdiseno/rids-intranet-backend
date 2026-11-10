// src/service/suscripciones-contratos/suscripciones-vencimientos.service.ts
/* =========================================================
   RESUMEN DE VENCIMIENTOS POR EMPRESA (listado de empresas)

   Mismo criterio de fechas que los avisos por correo
   (suscripciones-avisos.service.ts):
     - fechaRenovacion y fechaTermino se evalúan por separado
     - vencida  = fecha anterior a hoy (Chile)
     - porVencer = hoy .. hoy + mayor umbral (30 días)

   Diferencia: cuenta TODAS las suscripciones activas, tengan o
   no "Avisar vencimiento" (eso solo controla los correos).

   Una sola consulta para todas las empresas.
   ========================================================= */
import { prisma, } from "../../lib/prisma.js";
import { hoyChile, umbralesAviso, } from "./suscripciones-avisos.service.js";
const DIA_MS = 86_400_000;
/** Máximo de ítems por empresa que viajan al front (para el tooltip). */
const MAX_ITEMS = 15;
function msDia(clave) {
    return Date.parse(`${clave}T00:00:00.000Z`);
}
export async function resumenVencimientosEmpresas(empresaIds) {
    const resultado = new Map();
    const ids = [
        ...new Set(empresaIds.filter((id) => Number.isInteger(id) &&
            id > 0)),
    ];
    if (ids.length ===
        0) {
        return resultado;
    }
    const umbrales = umbralesAviso();
    const ventana = umbrales[umbrales.length - 1] ??
        30;
    const msHoy = msDia(hoyChile());
    const hasta = {
        lt: new Date(msHoy +
            (ventana + 1) *
                DIA_MS),
    };
    const suscripciones = await prisma
        .suscripcionContrato
        .findMany({
        where: {
            empresaId: {
                in: ids,
            },
            activo: true,
            OR: [
                {
                    fechaRenovacion: hasta,
                },
                {
                    fechaTermino: hasta,
                },
            ],
        },
        select: {
            id: true,
            empresaId: true,
            productoPlan: true,
            fabricante: true,
            fechaRenovacion: true,
            fechaTermino: true,
            avisosActivos: true,
        },
    });
    const porEmpresa = new Map();
    for (const s of suscripciones) {
        const fechas = [
            [
                "RENOVACION",
                s.fechaRenovacion,
            ],
            [
                "TERMINO",
                s.fechaTermino,
            ],
        ];
        for (const [tipoFecha, fecha,] of fechas) {
            if (!fecha) {
                continue;
            }
            const clave = fecha
                .toISOString()
                .slice(0, 10);
            const dias = Math.round((msDia(clave) -
                msHoy) /
                DIA_MS);
            if (dias >
                ventana) {
                continue;
            }
            const lista = porEmpresa.get(s.empresaId) ??
                [];
            lista.push({
                suscripcionId: s.id,
                productoPlan: s.productoPlan,
                fabricante: s.fabricante,
                tipoFecha,
                fecha: clave,
                dias,
                avisosActivos: s.avisosActivos,
            });
            porEmpresa.set(s.empresaId, lista);
        }
    }
    for (const [empresaId, lista,] of porEmpresa) {
        lista.sort((a, b) => a.dias -
            b.dias);
        const vencidas = lista.filter((v) => v.dias <
            0).length;
        resultado.set(empresaId, {
            vencidas,
            porVencer: lista.length -
                vencidas,
            proxima: lista.find((v) => v.dias >=
                0) ??
                null,
            items: lista.slice(0, MAX_ITEMS),
        });
    }
    return resultado;
}
/** Máximo de suscripciones que viajan a la campana. */
const MAX_SUSCRIPCIONES_CAMPANA = 100;
export async function vencimientosSuscripcionesCampana() {
    const umbrales = umbralesAviso();
    const ventana = umbrales[umbrales.length - 1] ??
        30;
    const msHoy = msDia(hoyChile());
    const hasta = {
        lt: new Date(msHoy +
            (ventana + 1) *
                DIA_MS),
    };
    const suscripciones = await prisma
        .suscripcionContrato
        .findMany({
        where: {
            activo: true,
            empresa: {
                isActive: true,
            },
            OR: [
                {
                    fechaRenovacion: hasta,
                },
                {
                    fechaTermino: hasta,
                },
            ],
        },
        select: {
            id: true,
            empresaId: true,
            productoPlan: true,
            fabricante: true,
            fechaRenovacion: true,
            fechaTermino: true,
            avisosActivos: true,
            empresa: {
                select: {
                    nombre: true,
                },
            },
        },
    });
    const resultado = [];
    for (const s of suscripciones) {
        const fechas = [];
        const candidatas = [
            [
                "RENOVACION",
                s.fechaRenovacion,
            ],
            [
                "TERMINO",
                s.fechaTermino,
            ],
        ];
        for (const [tipoFecha, fecha,] of candidatas) {
            if (!fecha) {
                continue;
            }
            const clave = fecha
                .toISOString()
                .slice(0, 10);
            const dias = Math.round((msDia(clave) -
                msHoy) /
                DIA_MS);
            if (dias >
                ventana) {
                continue;
            }
            fechas.push({
                tipoFecha,
                fecha: clave,
                dias,
            });
        }
        const [masUrgente,] = fechas.sort((a, b) => a.dias -
            b.dias);
        if (!masUrgente) {
            continue;
        }
        resultado.push({
            suscripcionId: s.id,
            empresaId: s.empresaId,
            empresaNombre: s.empresa.nombre,
            productoPlan: s.productoPlan,
            fabricante: s.fabricante,
            avisosActivos: s.avisosActivos,
            dias: masUrgente.dias,
            fechas,
        });
    }
    return resultado
        .sort((a, b) => a.dias -
        b.dias)
        .slice(0, MAX_SUSCRIPCIONES_CAMPANA);
}
//# sourceMappingURL=suscripciones-vencimientos.service.js.map