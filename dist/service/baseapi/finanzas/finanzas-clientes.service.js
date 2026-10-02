import { prisma, } from "../../../lib/prisma.js";
import { normalizarRutRcv, } from "../rcv-concilacion.mapper.js";
import { calcularResumenPuntualidad, evaluarDocumentoPuntualidad, } from "./puntualidad-cliente.service.js";
export async function obtenerAnalisisClientesFinanzas(params) {
    const { empresaKey, ano, } = params;
    const rangoConciliacion = ano
        ? {
            gte: new Date(Date.UTC(ano, 0, 1)),
            lt: new Date(Date.UTC(ano + 1, 0, 1)),
        }
        : {
            not: null,
        };
    /* =====================================================
       CONCILIACIONES
    ===================================================== */
    const [conciliacionesPeriodo, conciliacionesHistoricas,] = await Promise.all([
        prisma
            .rcvConciliacion
            .findMany({
            where: {
                empresaKey,
                tipoRcv: "ventas",
                estadoConciliacion: "CONCILIADA",
                conciliadoAt: rangoConciliacion,
            },
            select: {
                tipoDoc: true,
                folio: true,
                rutContraparte: true,
                razonSocial: true,
                fechaDocto: true,
                montoTotal: true,
                conciliadoAt: true,
            },
        }),
        prisma
            .rcvConciliacion
            .findMany({
            where: {
                empresaKey,
                tipoRcv: "ventas",
                estadoConciliacion: "CONCILIADA",
                conciliadoAt: {
                    not: null,
                },
            },
            select: {
                tipoDoc: true,
                folio: true,
                rutContraparte: true,
                razonSocial: true,
                fechaDocto: true,
                montoTotal: true,
                conciliadoAt: true,
            },
        }),
    ]);
    if (conciliacionesHistoricas.length ===
        0) {
        return {
            totalClientes: 0,
            clientes: [],
            mejoresPagadores: [],
            mayorRiesgo: [],
            resumen: {
                excelente: 0,
                buenPagador: 0,
                irregular: 0,
                riesgoMora: 0,
                sinHistorial: 0,
            },
        };
    }
    /* =====================================================
       VENCIMIENTOS
    ===================================================== */
    const documentosUnicos = Array.from(new Map(conciliacionesHistoricas.map(item => [
        `${item.tipoDoc}|${item.folio}`,
        {
            tipoDoc: item.tipoDoc,
            folio: item.folio,
        },
    ])).values());
    const vencimientos = await prisma
        .rcvVencimiento
        .findMany({
        where: {
            empresaKey,
            OR: documentosUnicos,
        },
        select: {
            tipoDoc: true,
            folio: true,
            fechaVencimiento: true,
        },
    });
    const vencimientoMap = new Map(vencimientos.map(item => [
        `${item.tipoDoc}|${item.folio}`,
        item.fechaVencimiento,
    ]));
    /* =====================================================
       AGRUPAR POR CLIENTE
    ===================================================== */
    const clientesMap = new Map();
    for (const conciliacion of conciliacionesHistoricas) {
        if (!conciliacion
            .conciliadoAt) {
            continue;
        }
        const rut = normalizarRutRcv(conciliacion
            .rutContraparte);
        if (!rut) {
            continue;
        }
        let cliente = clientesMap.get(rut);
        if (!cliente) {
            cliente = {
                rut,
                razonSocial: conciliacion
                    .razonSocial ??
                    rut,
                totalConciliadas: 0,
                totalEvaluados: 0,
                aTiempo: 0,
                atrasadas: 0,
                sumaDiasAtraso: 0,
                sumaPuntajes: 0,
                documentosInvalidos: 0,
                montoPagado: 0,
                ultimaFechaPago: null,
            };
            clientesMap.set(rut, cliente);
        }
        const vencimiento = vencimientoMap.get(`${conciliacion.tipoDoc}|${conciliacion.folio}`);
        if (!vencimiento) {
            continue;
        }
        const evaluacion = evaluarDocumentoPuntualidad({
            fechaDocto: conciliacion.fechaDocto,
            fechaVencimiento: vencimiento,
            fechaPago: conciliacion.conciliadoAt,
        });
        if (!evaluacion.valido) {
            cliente.documentosInvalidos++;
            continue;
        }
        cliente.totalEvaluados++;
        cliente.sumaPuntajes +=
            evaluacion.puntaje;
        if (evaluacion.diasAtraso >
            0) {
            cliente.atrasadas++;
            cliente.sumaDiasAtraso +=
                evaluacion.diasAtraso;
        }
        else {
            cliente.aTiempo++;
        }
    }
    /* =====================================================
   MÉTRICAS DEL PERÍODO
===================================================== */
    for (const conciliacion of conciliacionesPeriodo) {
        if (!conciliacion.conciliadoAt) {
            continue;
        }
        const rut = normalizarRutRcv(conciliacion
            .rutContraparte);
        if (!rut) {
            continue;
        }
        let cliente = clientesMap.get(rut);
        if (!cliente) {
            cliente = {
                rut,
                razonSocial: conciliacion
                    .razonSocial ??
                    rut,
                totalConciliadas: 0,
                totalEvaluados: 0,
                aTiempo: 0,
                atrasadas: 0,
                sumaDiasAtraso: 0,
                sumaPuntajes: 0,
                documentosInvalidos: 0,
                montoPagado: 0,
                ultimaFechaPago: null,
            };
            clientesMap.set(rut, cliente);
        }
        cliente.totalConciliadas++;
        cliente.montoPagado +=
            conciliacion.montoTotal;
        if (!cliente.ultimaFechaPago ||
            conciliacion.conciliadoAt >
                cliente.ultimaFechaPago) {
            cliente.ultimaFechaPago =
                conciliacion.conciliadoAt;
        }
    }
    /* =====================================================
    SCORE
 ===================================================== */
    const clientes = Array.from(clientesMap.values()).map(cliente => {
        const resultado = calcularResumenPuntualidad({
            totalEvaluados: cliente.totalEvaluados,
            aTiempo: cliente.aTiempo,
            atrasadas: cliente.atrasadas,
            sumaDiasAtraso: cliente.sumaDiasAtraso,
            sumaPuntajes: cliente.sumaPuntajes,
            documentosInvalidos: cliente.documentosInvalidos,
        });
        return {
            rut: cliente.rut,
            razonSocial: cliente.razonSocial,
            estado: resultado.estado,
            score: resultado.score,
            totalConciliadas: cliente.totalConciliadas,
            conVencimientoRegistrado: resultado.totalEvaluados,
            aTiempo: resultado.aTiempo,
            atrasadas: resultado.atrasadas,
            porcentajeATiempo: resultado.porcentajeATiempo,
            promedioDiasAtraso: resultado.promedioDiasAtraso,
            montoPagado: cliente.montoPagado,
            ultimaFechaPago: cliente.ultimaFechaPago,
        };
    });
    /* =====================================================
    CLIENTES DEL PERÍODO
 ===================================================== */
    const clientesPeriodo = clientes.filter(cliente => cliente.totalConciliadas >
        0);
    /* =====================================================
       RANKINGS
    ===================================================== */
    const mejoresPagadores = clientesPeriodo
        .filter(cliente => cliente.estado ===
        "EXCELENTE" ||
        cliente.estado ===
            "BUEN_PAGADOR")
        .sort((a, b) => (b.score ??
        0) -
        (a.score ??
            0))
        .slice(0, 10);
    const mayorRiesgo = clientesPeriodo
        .filter(cliente => cliente.estado ===
        "RIESGO_MORA")
        .sort((a, b) => (a.score ??
        0) -
        (b.score ??
            0))
        .slice(0, 10);
    /* =====================================================
       RESUMEN
    ===================================================== */
    const resumen = {
        excelente: clientesPeriodo.filter(item => item.estado ===
            "EXCELENTE").length,
        buenPagador: clientesPeriodo.filter(item => item.estado ===
            "BUEN_PAGADOR").length,
        irregular: clientesPeriodo.filter(item => item.estado ===
            "IRREGULAR").length,
        riesgoMora: clientesPeriodo.filter(item => item.estado ===
            "RIESGO_MORA").length,
        sinHistorial: clientesPeriodo.filter(item => item.estado ===
            "SIN_HISTORIAL").length,
    };
    return {
        totalClientes: clientesPeriodo.length,
        resumen,
        mejoresPagadores,
        mayorRiesgo,
        clientes: [...clientesPeriodo]
            .sort((a, b) => b.montoPagado -
            a.montoPagado),
    };
}
//# sourceMappingURL=finanzas-clientes.service.js.map