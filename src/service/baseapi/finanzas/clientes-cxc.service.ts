// src/service/baseapi/finanzas/clientes-cxc.service.ts
// Fase 3a: Clientes unificado (una ficha por RUT).
//
// - Une ReceptorFacturacion y ReceptorCobranza (las tablas no cambian) con las facturas del núcleo
//   de cuentas por cobrar de ambas empresas emisoras.
// - Plazo por empresa (sin cambio de esquema): ECONNET siempre día 1 del mes siguiente (PLAZO_EMPRESA);
//   los días de crédito del cliente (ReceptorCobranza.diasCredito) aplican solo a RIDS.
// - Contactos: una lista por correo con dos marcas (facturas / cobranza). Las escrituras pasan por los
//   servicios existentes de cada módulo, así se mantienen sus validaciones (último contacto válido,
//   principal único, email duplicado) y el AuditLog.

import { Prisma } from "@prisma/client";

import { prisma } from "../../../lib/prisma.js";

import type { EmpresaKey } from "../cobranza/cobranza-estado.service.js";

import {
    actualizarContactoCobranza,
    actualizarReceptorCobranza,
    crearContactoCobranza,
    crearReceptorCobranza,
    eliminarContactoCobranza,
} from "../cobranza/cobranza-receptores.service.js";

import {
    actualizarContactoReceptor,
    actualizarReceptorFacturacion,
    crearContactoReceptor,
    crearReceptorFacturacion,
    eliminarContactoReceptor,
} from "../facturas/factura-receptores.service.js";

import {
    calcularResumenPuntualidad,
    evaluarDocumentoPuntualidad,
    type ResumenPuntualidad,
} from "./puntualidad-cliente.service.js";

/* =========================================================
   TYPES
========================================================= */

/** Lo mínimo que se usa de un documento del núcleo (DocumentoCxc del controlador). */
export type DocumentoClienteBase = {
    key: string;
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    fechaEmision: string | null;
    montoOriginal: number;
    saldo: number;
    estado: "PAGADO" | "PENDIENTE" | "VENCIDO" | "COMPENSADO";
    diasDiferencia: number | null;
    pagadoAt: string | null;
    formaPago: string | null;
    vencimientoPactado: string | null;
};

export type ResumenEmpresaCliente = {
    facturas: number;
    abiertos: number;
    porCobrar: number;
    vencidos: number;
    vencido: number;
    porVencer: number;
    maxDiasVencido: number;
    ultimaEmision: string | null;
    ultimoPago: string | null;
};

export type EstadoModuloCliente = {
    receptorId: number | null;
    activo: boolean;
    /** recibeFacturas / recibeCobranza del receptor: envíos automáticos. */
    recibe: boolean;
    /** Contactos activos que reciben (facturas o cobranza). */
    contactos: number;
};

export type ClienteCxcFila = {
    rut: string;
    razonSocial: string | null;
    empresa: { id: number; nombre: string } | null;
    diasCredito: number | null;
    facturacion: EstadoModuloCliente;
    cobranza: EstadoModuloCliente;
    porEmpresa: Record<EmpresaKey, ResumenEmpresaCliente | null>;
    porCobrar: number;
    vencido: number;
    maxDiasVencido: number;
    totalContactos: number;
    puntualidad: {
        estado: ResumenPuntualidad["estado"];
        score: number | null;
        totalEvaluados: number;
        porcentajeATiempo: number;
        promedioDiasAtraso: number;
    } | null;
};

export type ContactoClienteModulo = { id: number; recibe: boolean; principal: boolean };

export type ContactoClienteCxc = {
    email: string;
    nombre: string | null;
    facturas: ContactoClienteModulo | null;
    cobranza: ContactoClienteModulo | null;
};

export type EnvioClienteCxc = {
    tipo: "FACTURA" | "RECORDATORIO";
    empresaKey: string;
    documento: string;
    email: string;
    estado: string;
    automatico: boolean;
    tipoRecordatorio: string | null;
    enviadoAt: string | null;
    /** enviadoAt o, si no se envió, la última actualización. */
    fecha: string;
    error: string | null;
};

export type ComportamientoGrupo = ResumenPuntualidad & {
    /** Promedio de días entre la emisión y el pago. */
    promedioDiasPago: number | null;
    montoPagado: number;
};

export type ComportamientoClienteCxc = {
    desde: string;
    hasta: string;
    total: ComportamientoGrupo | null;
    porEmpresa: Record<EmpresaKey, ComportamientoGrupo | null>;
    /** Pagadas en el período que no se evalúan: cerradas como AJUSTE o sin vencimiento. */
    excluidos: number;
    documentos: Array<{
        empresaKey: EmpresaKey;
        tipoDoc: string;
        folio: string;
        fechaEmision: string | null;
        vencimiento: string;
        pagadoAt: string;
        diasAtraso: number;
        monto: number;
        formaPago: string | null;
    }>;
};

export type FichaClienteCxc<D> = ClienteCxcFila & {
    plazos: Record<EmpresaKey, string>;
    contactos: ContactoClienteCxc[];
    documentos: Array<D & { empresaKey: EmpresaKey }>;
    comportamiento: ComportamientoClienteCxc;
    historial: EnvioClienteCxc[];
};

export type ConfigClienteInput = {
    razonSocial?: string | null;
    diasCredito?: number | null;
    recibeFacturas?: boolean;
    recibeCobranza?: boolean;
};

export type ContactoClienteInput = {
    /** Correo actual (si se está editando); vacío = contacto nuevo. */
    emailOriginal?: string | null;
    email: string;
    nombre?: string | null;
    facturas: boolean;
    cobranza: boolean;
    principalFacturas?: boolean;
    principalCobranza?: boolean;
};

/** Error de validación: el controlador lo responde como 400. */
export class ClienteCxcError extends Error { }

/* =========================================================
   HELPERS
========================================================= */

const EMPRESAS: EmpresaKey[] = ["rids", "econnet"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizarRutCliente(value: unknown) {
    return String(value ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}

function normalizarEmail(value: unknown) {
    return String(value ?? "").trim().toLowerCase();
}

/** Errores de los servicios de receptores (validaciones de negocio) → 400. */
async function comoValidacion<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (error instanceof ClienteCxcError) throw error;
        // Errores de Prisma siguen como 500; los demás son validaciones de los servicios de receptores.
        if (
            error instanceof Prisma.PrismaClientKnownRequestError ||
            error instanceof Prisma.PrismaClientUnknownRequestError ||
            error instanceof Prisma.PrismaClientValidationError ||
            error instanceof Prisma.PrismaClientInitializationError ||
            error instanceof Prisma.PrismaClientRustPanicError ||
            !(error instanceof Error)
        ) {
            throw error;
        }
        throw new ClienteCxcError(error.message);
    }
}

function resumirDocumentos(docs: DocumentoClienteBase[]): ResumenEmpresaCliente | null {
    if (docs.length === 0) return null;

    const resumen: ResumenEmpresaCliente = {
        facturas: docs.length,
        abiertos: 0,
        porCobrar: 0,
        vencidos: 0,
        vencido: 0,
        porVencer: 0,
        maxDiasVencido: 0,
        ultimaEmision: null,
        ultimoPago: null,
    };

    for (const d of docs) {
        if (d.fechaEmision && (!resumen.ultimaEmision || d.fechaEmision > resumen.ultimaEmision)) resumen.ultimaEmision = d.fechaEmision;
        if (d.pagadoAt && (!resumen.ultimoPago || d.pagadoAt > resumen.ultimoPago)) resumen.ultimoPago = d.pagadoAt;

        if (d.estado === "VENCIDO") {
            resumen.abiertos++;
            resumen.vencidos++;
            resumen.porCobrar += d.saldo;
            resumen.vencido += d.saldo;
            resumen.maxDiasVencido = Math.max(resumen.maxDiasVencido, d.diasDiferencia ?? 0);
        } else if (d.estado === "PENDIENTE") {
            resumen.abiertos++;
            resumen.porCobrar += d.saldo;
            resumen.porVencer += d.saldo;
        }
    }

    return resumen;
}

function textoPlazo(empresa: EmpresaKey, diasCredito: number | null) {
    if (empresa === "econnet") return "Día 1 del mes siguiente (plazo de ECONNET)";
    return diasCredito !== null ? `${diasCredito} días de crédito` : "30 días (plazo por defecto de RIDS)";
}

const includeReceptor = {
    empresa: { select: { id_empresa: true, nombre: true } },
    contactos: { where: { activo: true }, orderBy: [{ principal: "desc" as const }, { email: "asc" as const }] },
};

async function cargarReceptores(rut?: string) {
    const where = rut ? { rut } : {};
    const [facturacion, cobranza] = await Promise.all([
        prisma.receptorFacturacion.findMany({ where, include: includeReceptor }),
        prisma.receptorCobranza.findMany({ where, include: includeReceptor }),
    ]);

    return {
        facturacion: new Map(facturacion.map((r) => [normalizarRutCliente(r.rut), r])),
        cobranza: new Map(cobranza.map((r) => [normalizarRutCliente(r.rut), r])),
    };
}

type Receptores = Awaited<ReturnType<typeof cargarReceptores>>;

function armarFila(rut: string, receptores: Receptores, docsPorEmpresa: Record<EmpresaKey, DocumentoClienteBase[]>): ClienteCxcFila {
    const rf = receptores.facturacion.get(rut);
    const rc = receptores.cobranza.get(rut);

    const porEmpresa = {
        rids: resumirDocumentos(docsPorEmpresa.rids),
        econnet: resumirDocumentos(docsPorEmpresa.econnet),
    };

    // Razón social: la del receptor y, si no hay, la de la factura más reciente.
    const ultimoDoc = [...docsPorEmpresa.rids, ...docsPorEmpresa.econnet].sort((a, b) =>
        String(b.fechaEmision).localeCompare(String(a.fechaEmision)),
    )[0];

    const empresa = rf?.empresa ?? rc?.empresa ?? null;

    return {
        rut,
        razonSocial: rf?.razonSocial ?? rc?.razonSocial ?? ultimoDoc?.razonSocial ?? null,
        empresa: empresa ? { id: empresa.id_empresa, nombre: empresa.nombre } : null,
        diasCredito: rc?.diasCredito ?? null,
        facturacion: {
            receptorId: rf?.id ?? null,
            activo: rf?.activo ?? false,
            recibe: rf?.recibeFacturas ?? false,
            contactos: (rf?.contactos ?? []).filter((c) => c.recibeFacturas).length,
        },
        cobranza: {
            receptorId: rc?.id ?? null,
            activo: rc?.activo ?? false,
            recibe: rc?.recibeCobranza ?? false,
            contactos: (rc?.contactos ?? []).filter((c) => c.recibeCobranza).length,
        },
        porEmpresa,
        porCobrar: (porEmpresa.rids?.porCobrar ?? 0) + (porEmpresa.econnet?.porCobrar ?? 0),
        vencido: (porEmpresa.rids?.vencido ?? 0) + (porEmpresa.econnet?.vencido ?? 0),
        maxDiasVencido: Math.max(porEmpresa.rids?.maxDiasVencido ?? 0, porEmpresa.econnet?.maxDiasVencido ?? 0),
        totalContactos: new Set([...(rf?.contactos ?? []), ...(rc?.contactos ?? [])].map((c) => normalizarEmail(c.email))).size,
        puntualidad: resumenPuntualidadFila(docsPorEmpresa),
    };
}

/** Mismo cálculo que la pestaña «Comportamiento de pago», resumido para el listado. */
function resumenPuntualidadFila(docsPorEmpresa: Record<EmpresaKey, DocumentoClienteBase[]>): ClienteCxcFila["puntualidad"] {
    const total = calcularComportamiento(EMPRESAS.flatMap((empresaKey) => docsPorEmpresa[empresaKey].map((d) => ({ ...d, empresaKey })))).total;
    if (!total) return null;

    return {
        estado: total.estado,
        score: total.score,
        totalEvaluados: total.totalEvaluados,
        porcentajeATiempo: total.porcentajeATiempo,
        promedioDiasAtraso: total.promedioDiasAtraso,
    };
}

function agruparPorRut<D extends DocumentoClienteBase>(documentos: Record<EmpresaKey, D[]>) {
    const mapa = new Map<string, Record<EmpresaKey, D[]>>();

    for (const empresa of EMPRESAS) {
        for (const doc of documentos[empresa]) {
            const rut = normalizarRutCliente(doc.rutContraparte);
            if (!rut) continue;
            let grupo = mapa.get(rut);
            if (!grupo) {
                grupo = { rids: [], econnet: [] };
                mapa.set(rut, grupo);
            }
            grupo[empresa].push(doc);
        }
    }

    return mapa;
}

/* =========================================================
   LISTADO
========================================================= */

/** Todos los RUT que tienen receptor (facturación o cobranza) o facturas en el núcleo. */
export async function listarClientesCxc(documentos: Record<EmpresaKey, DocumentoClienteBase[]>): Promise<ClienteCxcFila[]> {
    const receptores = await cargarReceptores();
    const porRut = agruparPorRut(documentos);

    const ruts = new Set<string>([...receptores.facturacion.keys(), ...receptores.cobranza.keys(), ...porRut.keys()]);

    return Array.from(ruts)
        .map((rut) => armarFila(rut, receptores, porRut.get(rut) ?? { rids: [], econnet: [] }))
        .sort((a, b) => b.porCobrar - a.porCobrar || String(a.razonSocial).localeCompare(String(b.razonSocial)));
}

/* =========================================================
   COMPORTAMIENTO DE PAGO (últimos 12 meses)
========================================================= */

const DIA_MS = 24 * 60 * 60 * 1000;

function hoyChileIso() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function isoADate(iso: string) {
    return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

function resumirGrupo(docs: ComportamientoClienteCxc["documentos"]): ComportamientoGrupo | null {
    if (docs.length === 0) return null;

    let aTiempo = 0;
    let atrasadas = 0;
    let sumaDiasAtraso = 0;
    let sumaPuntajes = 0;
    let documentosInvalidos = 0;
    let sumaDiasPago = 0;
    let conEmision = 0;
    let montoPagado = 0;

    for (const d of docs) {
        const evaluacion = evaluarDocumentoPuntualidad({
            fechaDocto: d.fechaEmision ? isoADate(d.fechaEmision) : null,
            fechaVencimiento: isoADate(d.vencimiento),
            fechaPago: isoADate(d.pagadoAt),
        });

        if (!evaluacion.valido) {
            documentosInvalidos++;
            continue;
        }

        sumaPuntajes += evaluacion.puntaje;
        montoPagado += d.monto;

        if (evaluacion.diasAtraso > 0) {
            atrasadas++;
            sumaDiasAtraso += evaluacion.diasAtraso;
        } else {
            aTiempo++;
        }

        if (d.fechaEmision) {
            conEmision++;
            sumaDiasPago += Math.round((isoADate(d.pagadoAt).getTime() - isoADate(d.fechaEmision).getTime()) / DIA_MS);
        }
    }

    return {
        ...calcularResumenPuntualidad({
            totalEvaluados: aTiempo + atrasadas,
            aTiempo,
            atrasadas,
            sumaDiasAtraso,
            sumaPuntajes,
            documentosInvalidos,
        }),
        promedioDiasPago: conEmision > 0 ? Math.round(sumaDiasPago / conEmision) : null,
        montoPagado,
    };
}

/**
 * Facturas pagadas en los últimos 12 meses, comparando la fecha de pago con el vencimiento
 * calculado con las mismas reglas que las abiertas (vencimientoPactado del núcleo).
 * Se excluyen las cerradas como AJUSTE (anuladas o que Duemint no tenía).
 * Ojo: en lo conciliado a mano la «fecha de pago» es la fecha de conciliación.
 */
function calcularComportamiento(docs: Array<DocumentoClienteBase & { empresaKey: EmpresaKey }>): ComportamientoClienteCxc {
    const hasta = hoyChileIso();
    const desde = new Date(isoADate(hasta).getTime() - 365 * DIA_MS).toISOString().slice(0, 10);

    let excluidos = 0;
    const evaluables: ComportamientoClienteCxc["documentos"] = [];

    for (const d of docs) {
        if (d.estado !== "PAGADO" || !d.pagadoAt || d.pagadoAt < desde) continue;

        if (String(d.formaPago ?? "").toUpperCase() === "AJUSTE" || !d.vencimientoPactado) {
            excluidos++;
            continue;
        }

        evaluables.push({
            empresaKey: d.empresaKey,
            tipoDoc: d.tipoDoc,
            folio: d.folio,
            fechaEmision: d.fechaEmision,
            vencimiento: d.vencimientoPactado,
            pagadoAt: d.pagadoAt,
            diasAtraso: Math.round((isoADate(d.pagadoAt).getTime() - isoADate(d.vencimientoPactado).getTime()) / DIA_MS),
            monto: d.saldo,
            formaPago: d.formaPago,
        });
    }

    evaluables.sort((a, b) => b.pagadoAt.localeCompare(a.pagadoAt));

    return {
        desde,
        hasta,
        total: resumirGrupo(evaluables),
        porEmpresa: {
            rids: resumirGrupo(evaluables.filter((d) => d.empresaKey === "rids")),
            econnet: resumirGrupo(evaluables.filter((d) => d.empresaKey === "econnet")),
        },
        excluidos,
        documentos: evaluables,
    };
}

/* =========================================================
   HISTORIAL DE ENVÍOS
========================================================= */

const MAX_HISTORIAL = 150;

async function historialEnviosCliente(rut: string): Promise<EnvioClienteCxc[]> {
    const where = { tipoRcv: "ventas", rutContraparte: rut };

    const [facturas, recordatorios] = await Promise.all([
        prisma.rcvFacturaEnvio.findMany({
            where,
            orderBy: { updatedAt: "desc" },
            take: MAX_HISTORIAL,
            select: {
                empresaKey: true,
                tipoDoc: true,
                folio: true,
                emailDestino: true,
                estado: true,
                automatico: true,
                enviadoAt: true,
                updatedAt: true,
                error: true,
            },
        }),
        prisma.rcvRecordatorioEnvio.findMany({
            where,
            orderBy: { updatedAt: "desc" },
            take: MAX_HISTORIAL,
            select: {
                empresaKey: true,
                tipoDoc: true,
                folio: true,
                emailDestino: true,
                estado: true,
                automatico: true,
                tipoRecordatorio: true,
                enviadoAt: true,
                updatedAt: true,
                error: true,
            },
        }),
    ]);

    const filas: EnvioClienteCxc[] = [
        ...facturas.map((f) => ({
            tipo: "FACTURA" as const,
            empresaKey: f.empresaKey,
            documento: `${f.tipoDoc}-${f.folio}`,
            email: f.emailDestino,
            estado: f.estado,
            automatico: f.automatico,
            tipoRecordatorio: null,
            enviadoAt: f.enviadoAt?.toISOString() ?? null,
            fecha: (f.enviadoAt ?? f.updatedAt).toISOString(),
            error: f.error,
        })),
        ...recordatorios.map((r) => ({
            tipo: "RECORDATORIO" as const,
            empresaKey: r.empresaKey,
            documento: `${r.tipoDoc}-${r.folio}`,
            email: r.emailDestino,
            estado: r.estado,
            automatico: r.automatico,
            tipoRecordatorio: r.tipoRecordatorio,
            enviadoAt: r.enviadoAt?.toISOString() ?? null,
            fecha: (r.enviadoAt ?? r.updatedAt).toISOString(),
            error: r.error,
        })),
    ];

    return filas.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, MAX_HISTORIAL);
}

/* =========================================================
   FICHA
========================================================= */

export async function obtenerFichaClienteCxc<D extends DocumentoClienteBase>(
    rutEntrada: string,
    documentos: Record<EmpresaKey, D[]>,
): Promise<FichaClienteCxc<D>> {
    const rut = normalizarRutCliente(rutEntrada);
    if (rut.length < 2) throw new ClienteCxcError("RUT inválido.");

    const [receptores, historial] = await Promise.all([cargarReceptores(rut), historialEnviosCliente(rut)]);
    const propios = agruparPorRut(documentos).get(rut) ?? { rids: [], econnet: [] };

    if (!receptores.facturacion.has(rut) && !receptores.cobranza.has(rut) && propios.rids.length + propios.econnet.length === 0) {
        throw new ClienteCxcError("No hay receptor ni facturas para ese RUT.");
    }

    const fila = armarFila(rut, receptores, propios);

    // Contactos: una fila por correo con su estado en cada módulo.
    const contactos = new Map<string, ContactoClienteCxc>();
    const obtener = (email: string, nombre: string | null) => {
        const clave = normalizarEmail(email);
        let contacto = contactos.get(clave);
        if (!contacto) {
            contacto = { email: clave, nombre, facturas: null, cobranza: null };
            contactos.set(clave, contacto);
        }
        if (!contacto.nombre && nombre) contacto.nombre = nombre;
        return contacto;
    };

    for (const c of receptores.facturacion.get(rut)?.contactos ?? []) {
        obtener(c.email, c.nombre).facturas = { id: c.id, recibe: c.recibeFacturas, principal: c.principal };
    }
    for (const c of receptores.cobranza.get(rut)?.contactos ?? []) {
        obtener(c.email, c.nombre).cobranza = { id: c.id, recibe: c.recibeCobranza, principal: c.principal };
    }

    const docs = EMPRESAS.flatMap((empresaKey) => propios[empresaKey].map((d) => ({ ...d, empresaKey })))
        .sort((a, b) => String(b.fechaEmision).localeCompare(String(a.fechaEmision)) || Number(b.folio) - Number(a.folio));

    return {
        ...fila,
        plazos: { rids: textoPlazo("rids", fila.diasCredito), econnet: textoPlazo("econnet", fila.diasCredito) },
        contactos: Array.from(contactos.values()).sort(
            (a, b) =>
                Number(Boolean(b.facturas?.principal || b.cobranza?.principal)) - Number(Boolean(a.facturas?.principal || a.cobranza?.principal)) ||
                a.email.localeCompare(b.email),
        ),
        documentos: docs,
        comportamiento: calcularComportamiento(docs),
        historial,
    };
}

/* =========================================================
   CONFIGURACIÓN
========================================================= */

/** Crea el receptor que falte (apagado). Devuelve su id. */
async function asegurarReceptor(modulo: "facturacion" | "cobranza", rut: string, razonSocial: string | null) {
    if (modulo === "facturacion") {
        const existente = await prisma.receptorFacturacion.findUnique({ where: { rut }, select: { id: true } });
        if (existente) return existente.id;
        return (await comoValidacion(() => crearReceptorFacturacion({ rut, razonSocial }))).id;
    }

    const existente = await prisma.receptorCobranza.findUnique({ where: { rut }, select: { id: true } });
    if (existente) return existente.id;
    return (await comoValidacion(() => crearReceptorCobranza({ rut, razonSocial, origen: "MANUAL" }))).id;
}

export async function guardarConfigClienteCxc(rutEntrada: string, input: ConfigClienteInput) {
    const rut = normalizarRutCliente(rutEntrada);
    if (rut.length < 2) throw new ClienteCxcError("RUT inválido.");

    if (input.diasCredito !== undefined && input.diasCredito !== null) {
        if (!Number.isInteger(input.diasCredito) || input.diasCredito < 0 || input.diasCredito > 365) {
            throw new ClienteCxcError("Los días de crédito deben ser un entero entre 0 y 365.");
        }
    }

    const razonSocial = input.razonSocial === undefined ? undefined : input.razonSocial?.trim() || null;

    const [rf, rc] = await Promise.all([
        prisma.receptorFacturacion.findUnique({ where: { rut }, select: { id: true, razonSocial: true } }),
        prisma.receptorCobranza.findUnique({ where: { rut }, select: { id: true, razonSocial: true } }),
    ]);

    const nombre = razonSocial ?? rf?.razonSocial ?? rc?.razonSocial ?? null;

    // Facturación: se crea el receptor solo si se quiere activar el envío automático o cambiar el nombre de uno existente.
    if (input.recibeFacturas === true || rf) {
        const id = rf?.id ?? (await asegurarReceptor("facturacion", rut, nombre));
        await comoValidacion(() =>
            actualizarReceptorFacturacion(id, {
                ...(razonSocial !== undefined ? { razonSocial } : {}),
                ...(input.recibeFacturas !== undefined ? { recibeFacturas: input.recibeFacturas } : {}),
                ...(input.recibeFacturas ? { activo: true } : {}),
            }),
        );
    }

    // Cobranza: días de crédito (los usa RIDS) y recordatorios automáticos.
    const tocaCobranza = input.recibeCobranza === true || (input.diasCredito !== undefined && input.diasCredito !== null);
    if (tocaCobranza || rc) {
        const id = rc?.id ?? (await asegurarReceptor("cobranza", rut, nombre));
        await comoValidacion(() =>
            actualizarReceptorCobranza(id, {
                ...(razonSocial !== undefined ? { razonSocial } : {}),
                ...(input.diasCredito !== undefined ? { diasCredito: input.diasCredito } : {}),
                ...(input.recibeCobranza !== undefined ? { recibeCobranza: input.recibeCobranza } : {}),
                // Los días de crédito solo cuentan con el receptor activo.
                ...(tocaCobranza ? { activo: true } : {}),
            }),
        );
    }
}

/* =========================================================
   CONTACTOS
========================================================= */

export async function guardarContactoClienteCxc(rutEntrada: string, input: ContactoClienteInput) {
    const rut = normalizarRutCliente(rutEntrada);
    if (rut.length < 2) throw new ClienteCxcError("RUT inválido.");

    const email = normalizarEmail(input.email);
    if (!EMAIL_RE.test(email)) throw new ClienteCxcError("Correo inválido.");

    const original = normalizarEmail(input.emailOriginal) || email;
    const nombre = input.nombre?.trim() || null;

    const [rf, rc] = await Promise.all([
        prisma.receptorFacturacion.findUnique({ where: { rut }, include: { contactos: true } }),
        prisma.receptorCobranza.findUnique({ where: { rut }, include: { contactos: true } }),
    ]);

    if (!input.facturas && !input.cobranza && !rf?.contactos.some((c) => normalizarEmail(c.email) === original) &&
        !rc?.contactos.some((c) => normalizarEmail(c.email) === original)) {
        throw new ClienteCxcError("Marca «Facturas», «Cobranza» o ambas.");
    }

    const razonSocial = rf?.razonSocial ?? rc?.razonSocial ?? null;

    /* Facturación */
    const cf = rf?.contactos.find((c) => normalizarEmail(c.email) === original);
    if (input.facturas) {
        const receptorId = rf?.id ?? (await asegurarReceptor("facturacion", rut, razonSocial));
        const datos = {
            email,
            nombre,
            activo: true,
            recibeFacturas: true,
            ...(input.principalFacturas !== undefined ? { principal: input.principalFacturas } : {}),
        };
        await comoValidacion(() => (cf ? actualizarContactoReceptor(receptorId, cf.id, datos) : crearContactoReceptor(receptorId, datos)));
    } else if (cf && rf) {
        await comoValidacion(() =>
            actualizarContactoReceptor(rf.id, cf.id, { email, nombre, recibeFacturas: false, principal: false }),
        );
    }

    /* Cobranza */
    const cc = rc?.contactos.find((c) => normalizarEmail(c.email) === original);
    if (input.cobranza) {
        const receptorId = rc?.id ?? (await asegurarReceptor("cobranza", rut, razonSocial));
        const datos = {
            email,
            nombre,
            activo: true,
            recibeCobranza: true,
            ...(input.principalCobranza !== undefined ? { principal: input.principalCobranza } : {}),
        };
        await comoValidacion(() => (cc ? actualizarContactoCobranza(receptorId, cc.id, datos) : crearContactoCobranza(receptorId, datos)));
    } else if (cc && rc) {
        await comoValidacion(() =>
            actualizarContactoCobranza(rc.id, cc.id, { email, nombre, recibeCobranza: false, principal: false }),
        );
    }
}

/** Borra el correo de los dos módulos (los servicios protegen el último contacto válido). */
export async function eliminarContactoClienteCxc(rutEntrada: string, emailEntrada: string) {
    const rut = normalizarRutCliente(rutEntrada);
    const email = normalizarEmail(emailEntrada);
    if (rut.length < 2 || !email) throw new ClienteCxcError("RUT o correo inválido.");

    const [rf, rc] = await Promise.all([
        prisma.receptorFacturacion.findUnique({ where: { rut }, include: { contactos: true } }),
        prisma.receptorCobranza.findUnique({ where: { rut }, include: { contactos: true } }),
    ]);

    const cf = rf?.contactos.find((c) => normalizarEmail(c.email) === email);
    const cc = rc?.contactos.find((c) => normalizarEmail(c.email) === email);

    if (!cf && !cc) throw new ClienteCxcError("El correo no está registrado para este cliente.");

    if (cf && rf) await comoValidacion(() => eliminarContactoReceptor(rf.id, cf.id));
    if (cc && rc) await comoValidacion(() => eliminarContactoCobranza(rc.id, cc.id));
}