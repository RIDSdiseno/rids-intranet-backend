// src/service/baseapi/finanzas/cxc-abonos.service.ts
// Fase 4a: abonos (pagos parciales o totales) de facturas de venta.
//
// - Un abono es una fila en RcvAbono. El núcleo resta los abonos del saldo de las facturas abiertas.
// - Cuando los abonos cubren el saldo (monto − NC), se concilia la factura con conciliarDocumentoRcv
//   (fecha y forma de pago del último abono). Así cobranza automática, la pantalla Conciliación y el
//   resto del CRM, que leen RcvConciliacion, siguen funcionando igual.
// - Al eliminar un abono de una factura conciliada, se desconcilia (vuelve a quedar por cobrar).
// - Las conciliaciones antiguas sin abonos (Duemint, «Registrar pago» anterior) no se tocan.
import { prisma } from "../../../lib/prisma.js";
import { conciliarDocumentoRcv, desconciliarDocumentoRcv } from "../baseapi-rcv-conciliacion.service.js";
export class AbonoCxcError extends Error {
}
/* =========================================================
   HELPERS
========================================================= */
function normalizarRut(value) {
    return String(value ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}
function hoyChileIso() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
/** Fecha guardada a mediodía de Chile: el día no cambia al pasar a UTC. */
function fechaPagoADate(iso) {
    return new Date(`${iso}T12:00:00-03:00`);
}
function dateAIsoChile(fecha) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}
function whereDocumento(empresaKey, doc) {
    return {
        empresaKey,
        tipoRcv: "ventas",
        tipoDoc: doc.tipoDoc,
        folio: doc.folio,
        rutContraparte: normalizarRut(doc.rutContraparte),
    };
}
function validarFactura(doc) {
    if (doc.tipoDoc !== "33" && doc.tipoDoc !== "34" && doc.tipoDoc !== "56") {
        throw new AbonoCxcError("Solo se registran pagos de facturas (33, 34) y notas de débito (56).");
    }
}
/* =========================================================
   CONSULTA
========================================================= */
export async function obtenerPagosDocumentoCxc(empresaKey, doc) {
    validarFactura(doc);
    const where = whereDocumento(empresaKey, doc);
    const [abonos, conciliacion] = await Promise.all([
        prisma.rcvAbono.findMany({ where, orderBy: [{ fechaPago: "asc" }, { id: "asc" }] }),
        prisma.rcvConciliacion.findFirst({
            where: { ...where, estadoConciliacion: "CONCILIADA" },
            select: { conciliadoAt: true, formaPago: true },
        }),
    ]);
    const saldoNc = Math.max(0, doc.montoOriginal - doc.montoNotasCredito);
    const montoAbonado = abonos.reduce((s, a) => s + a.monto, 0);
    return {
        montoOriginal: doc.montoOriginal,
        montoNotasCredito: doc.montoNotasCredito,
        saldoNc,
        montoAbonado,
        pendiente: conciliacion ? 0 : Math.max(0, saldoNc - montoAbonado),
        conciliada: Boolean(conciliacion),
        conciliadaSinAbonos: Boolean(conciliacion) && abonos.length === 0,
        conciliadoAt: conciliacion?.conciliadoAt ? dateAIsoChile(conciliacion.conciliadoAt) : null,
        formaPagoConciliacion: conciliacion?.formaPago ?? null,
        abonos: abonos.map((a) => ({
            id: a.id,
            monto: a.monto,
            fechaPago: dateAIsoChile(a.fechaPago),
            formaPago: a.formaPago,
            observacion: a.observacion,
            origen: a.origen,
            responsable: a.responsable,
            createdAt: a.createdAt.toISOString(),
        })),
    };
}
/* =========================================================
   REGISTRAR
========================================================= */
export async function registrarAbonoCxc(params) {
    const { empresaKey, documento: doc } = params;
    validarFactura(doc);
    if (doc.estado === "COMPENSADO")
        throw new AbonoCxcError("La factura está anulada por notas de crédito.");
    if (!Number.isInteger(params.monto) || params.monto <= 0) {
        throw new AbonoCxcError("El monto debe ser un entero mayor que 0.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.fechaPago) || Number.isNaN(fechaPagoADate(params.fechaPago).getTime())) {
        throw new AbonoCxcError("Fecha de pago inválida.");
    }
    if (params.fechaPago > hoyChileIso())
        throw new AbonoCxcError("La fecha de pago no puede ser futura.");
    // Siempre con datos frescos de la BD (la caché del núcleo puede tener hasta 5 minutos).
    const actual = await obtenerPagosDocumentoCxc(empresaKey, doc);
    if (actual.conciliada)
        throw new AbonoCxcError("La factura ya está pagada.");
    if (params.monto > actual.pendiente) {
        throw new AbonoCxcError(`El monto supera lo pendiente (${actual.pendiente.toLocaleString("es-CL")}).`);
    }
    const abono = await prisma.rcvAbono.create({
        data: {
            ...whereDocumento(empresaKey, doc),
            monto: params.monto,
            fechaPago: fechaPagoADate(params.fechaPago),
            formaPago: params.formaPago,
            observacion: params.observacion,
            origen: params.origen ?? "MANUAL",
            movimientoId: params.movimientoId ?? null,
            responsable: params.responsable,
        },
    });
    const completa = actual.montoAbonado + params.monto >= actual.saldoNc;
    if (completa) {
        const cantidad = actual.abonos.length + 1;
        await conciliarDocumentoRcv({
            empresa: empresaKey,
            tipoRcv: "ventas",
            tipoDoc: doc.tipoDoc,
            folio: doc.folio,
            rutContraparte: doc.rutContraparte,
            razonSocial: doc.razonSocial,
            fechaDocto: doc.fechaEmision ? new Date(`${doc.fechaEmision}T00:00:00.000Z`) : null,
            montoTotal: doc.montoOriginal,
            formaPago: params.formaPago,
            observacion: cantidad === 1 ? params.observacion : `Pagada con ${cantidad} abonos`,
            conciliadoAt: fechaPagoADate(params.fechaPago),
            responsable: params.responsable,
            enviarCorreo: false,
        });
    }
    return { pagos: await obtenerPagosDocumentoCxc(empresaKey, doc), conciliada: completa, abonoId: abono.id };
}
/* =========================================================
   ELIMINAR
========================================================= */
export async function eliminarAbonoCxc(params) {
    const { empresaKey, documento: doc } = params;
    validarFactura(doc);
    const abono = await prisma.rcvAbono.findFirst({ where: { id: params.abonoId, ...whereDocumento(empresaKey, doc) } });
    if (!abono)
        throw new AbonoCxcError("El abono no existe o no corresponde a esta factura.");
    if (abono.movimientoId && !params.desdeMovimiento) {
        throw new AbonoCxcError("Este abono viene de un movimiento bancario: se deshace desde la conciliación bancaria.");
    }
    const antes = await obtenerPagosDocumentoCxc(empresaKey, doc);
    await prisma.rcvAbono.delete({ where: { id: abono.id } });
    // Si estaba pagada, al quitar un abono deja de estarlo.
    let desconciliada = false;
    if (antes.conciliada) {
        await desconciliarDocumentoRcv({
            empresa: empresaKey,
            tipoRcv: "ventas",
            tipoDoc: doc.tipoDoc,
            folio: doc.folio,
            rutContraparte: doc.rutContraparte,
        });
        desconciliada = true;
    }
    return { pagos: await obtenerPagosDocumentoCxc(empresaKey, doc), desconciliada };
}
//# sourceMappingURL=cxc-abonos.service.js.map