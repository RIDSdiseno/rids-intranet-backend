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

import type { EmpresaKey } from "../cobranza/cobranza-estado.service.js";

import { conciliarDocumentoRcv, desconciliarDocumentoRcv } from "../baseapi-rcv-conciliacion.service.js";

/* =========================================================
   TYPES
========================================================= */

/** Lo que se usa del documento del núcleo (DocumentoCxc). */
export type DocumentoAbonoCxc = {
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    fechaEmision: string | null;
    montoOriginal: number;
    montoNotasCredito: number;
    estado: "PAGADO" | "PENDIENTE" | "VENCIDO" | "COMPENSADO";
};

export type AbonoCxc = {
    id: number;
    monto: number;
    fechaPago: string;
    formaPago: string | null;
    observacion: string | null;
    origen: string;
    responsable: string | null;
    createdAt: string;
};

export type PagosDocumentoCxc = {
    montoOriginal: number;
    montoNotasCredito: number;
    /** Monto − NC. */
    saldoNc: number;
    montoAbonado: number;
    pendiente: number;
    /** Conciliada (pagada) en RcvConciliacion. */
    conciliada: boolean;
    /** Conciliada sin abonos (Duemint o el «Registrar pago» anterior). */
    conciliadaSinAbonos: boolean;
    conciliadoAt: string | null;
    formaPagoConciliacion: string | null;
    abonos: AbonoCxc[];
};

export class AbonoCxcError extends Error { }

/* =========================================================
   HELPERS
========================================================= */

function normalizarRut(value: unknown) {
    return String(value ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}

function hoyChileIso() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Fecha guardada a mediodía de Chile: el día no cambia al pasar a UTC. */
function fechaPagoADate(iso: string) {
    return new Date(`${iso}T12:00:00-03:00`);
}

function dateAIsoChile(fecha: Date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}

function whereDocumento(empresaKey: EmpresaKey, doc: DocumentoAbonoCxc) {
    return {
        empresaKey,
        tipoRcv: "ventas",
        tipoDoc: doc.tipoDoc,
        folio: doc.folio,
        rutContraparte: normalizarRut(doc.rutContraparte),
    };
}

function validarFactura(doc: DocumentoAbonoCxc) {
    if (doc.tipoDoc !== "33" && doc.tipoDoc !== "34" && doc.tipoDoc !== "56") {
        throw new AbonoCxcError("Solo se registran pagos de facturas (33, 34) y notas de débito (56).");
    }
}

/* =========================================================
   CONSULTA
========================================================= */

export async function obtenerPagosDocumentoCxc(empresaKey: EmpresaKey, doc: DocumentoAbonoCxc): Promise<PagosDocumentoCxc> {
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

export async function registrarAbonoCxc(params: {
    empresaKey: EmpresaKey;
    documento: DocumentoAbonoCxc;
    monto: number;
    fechaPago: string;
    formaPago: string | null;
    observacion: string | null;
    responsable: string | null;
}): Promise<{ pagos: PagosDocumentoCxc; conciliada: boolean }> {
    const { empresaKey, documento: doc } = params;
    validarFactura(doc);

    if (doc.estado === "COMPENSADO") throw new AbonoCxcError("La factura está anulada por notas de crédito.");

    if (!Number.isInteger(params.monto) || params.monto <= 0) {
        throw new AbonoCxcError("El monto debe ser un entero mayor que 0.");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.fechaPago) || Number.isNaN(fechaPagoADate(params.fechaPago).getTime())) {
        throw new AbonoCxcError("Fecha de pago inválida.");
    }
    if (params.fechaPago > hoyChileIso()) throw new AbonoCxcError("La fecha de pago no puede ser futura.");

    // Siempre con datos frescos de la BD (la caché del núcleo puede tener hasta 5 minutos).
    const actual = await obtenerPagosDocumentoCxc(empresaKey, doc);

    if (actual.conciliada) throw new AbonoCxcError("La factura ya está pagada.");
    if (params.monto > actual.pendiente) {
        throw new AbonoCxcError(`El monto supera lo pendiente (${actual.pendiente.toLocaleString("es-CL")}).`);
    }

    await prisma.rcvAbono.create({
        data: {
            ...whereDocumento(empresaKey, doc),
            monto: params.monto,
            fechaPago: fechaPagoADate(params.fechaPago),
            formaPago: params.formaPago,
            observacion: params.observacion,
            origen: "MANUAL",
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

    return { pagos: await obtenerPagosDocumentoCxc(empresaKey, doc), conciliada: completa };
}

/* =========================================================
   ELIMINAR
========================================================= */

export async function eliminarAbonoCxc(params: {
    empresaKey: EmpresaKey;
    documento: DocumentoAbonoCxc;
    abonoId: number;
}): Promise<{ pagos: PagosDocumentoCxc; desconciliada: boolean }> {
    const { empresaKey, documento: doc } = params;
    validarFactura(doc);

    const abono = await prisma.rcvAbono.findFirst({ where: { id: params.abonoId, ...whereDocumento(empresaKey, doc) } });
    if (!abono) throw new AbonoCxcError("El abono no existe o no corresponde a esta factura.");

    if (abono.movimientoId) {
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