// src/service/leypd/leypd-consentimientos.service.ts
import { EstadoCampaniaProteccionDatos, EstadoConsentimientoDatos, } from "@prisma/client";
import { prisma, } from "../../lib/prisma.js";
import { LEYPD_ELEMENTO_CONSENTIMIENTO, } from "../proteccion-datos/proteccion-datos.types.js";
/* =====================================================
   AGRUPACIÓN DE ESTADOS
===================================================== */
const ESTADOS_RESPONDIDOS = [
    EstadoConsentimientoDatos.ACEPTADO,
    EstadoConsentimientoDatos.RECHAZADO,
    EstadoConsentimientoDatos.REVOCADO,
];
const ESTADOS_PENDIENTES = [
    EstadoConsentimientoDatos.PENDIENTE,
    EstadoConsentimientoDatos.ENVIADO,
    EstadoConsentimientoDatos.ERROR_ENVIO,
];
/* =====================================================
   RESUMEN ELEMENTO 04
===================================================== */
/**
 * Resumen de campañas de consentimiento creadas
 * desde Ley PD para una empresa.
 *
 * Solo cuenta campañas con:
 *   empresaId = empresa
 *   origen = LEYPD
 *   leypdElementoNumero = 4
 *
 * NO modifica el estado del elemento 04:
 * eso sigue siendo decisión del técnico.
 */
export async function obtenerResumenConsentimientosLeypd(empresaId) {
    const empresa = await prisma.empresa.findUnique({
        where: {
            id_empresa: empresaId,
        },
        select: {
            id_empresa: true,
        },
    });
    if (!empresa) {
        throw new Error("EMPRESA_NO_ENCONTRADA");
    }
    const whereCampania = {
        empresaId,
        origen: "LEYPD",
        leypdElementoNumero: LEYPD_ELEMENTO_CONSENTIMIENTO,
    };
    const [campanias, conteoPorEstado,] = await Promise.all([
        prisma.campaniaProteccionDatos.findMany({
            where: whereCampania,
            orderBy: {
                createdAt: "desc",
            },
            select: {
                id: true,
                nombre: true,
                estado: true,
                versionDocumento: true,
                fechaInicio: true,
                fechaFin: true,
                fechaEnvioInicial: true,
                createdAt: true,
                _count: {
                    select: {
                        destinatarios: true,
                    },
                },
            },
        }),
        prisma.consentimientoDatos.groupBy({
            by: [
                "estado",
            ],
            where: {
                campania: whereCampania,
            },
            _count: {
                _all: true,
            },
        }),
    ]);
    const porEstado = new Map();
    for (const fila of conteoPorEstado) {
        porEstado.set(fila.estado, fila._count._all);
    }
    const contar = (estados) => estados.reduce((total, estado) => total +
        (porEstado.get(estado) ?? 0), 0);
    const destinatarios = [
        ...porEstado.values(),
    ].reduce((total, cantidad) => total +
        cantidad, 0);
    return {
        empresaId,
        totales: {
            campanias: campanias.length,
            activas: campanias.filter((c) => c.estado ===
                EstadoCampaniaProteccionDatos.ACTIVA).length,
            borradores: campanias.filter((c) => c.estado ===
                EstadoCampaniaProteccionDatos.BORRADOR).length,
            destinatarios,
            respondidos: contar(ESTADOS_RESPONDIDOS),
            aceptados: porEstado.get(EstadoConsentimientoDatos.ACEPTADO) ?? 0,
            rechazados: porEstado.get(EstadoConsentimientoDatos.RECHAZADO) ?? 0,
            revocados: porEstado.get(EstadoConsentimientoDatos.REVOCADO) ?? 0,
            pendientes: contar(ESTADOS_PENDIENTES),
            erroresEnvio: porEstado.get(EstadoConsentimientoDatos.ERROR_ENVIO) ?? 0,
            expirados: porEstado.get(EstadoConsentimientoDatos.EXPIRADO) ?? 0,
        },
        campanias: campanias.map((c) => ({
            id: c.id,
            nombre: c.nombre,
            estado: c.estado,
            versionDocumento: c.versionDocumento,
            fechaInicio: c.fechaInicio,
            fechaFin: c.fechaFin,
            fechaEnvioInicial: c.fechaEnvioInicial,
            createdAt: c.createdAt,
            destinatarios: c._count.destinatarios,
        })),
    };
}
//# sourceMappingURL=leypd-consentimientos.service.js.map