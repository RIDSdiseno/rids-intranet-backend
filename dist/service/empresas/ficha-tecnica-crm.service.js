// src/service/empresas/ficha-tecnica-crm.service.ts
//
// Datos de la ficha técnica que ya existen en otras partes del CRM.
//
//   visitas      Calculadas en cada consulta y NO se guardan: última visita completada (Visita) y
//                próxima visita en agenda (AgendaVisita). Cambian con cada visita.
//   sugerencias  Resumen de inventario, suscripciones, ISP, redes, servidores, solicitantes y visitas.
//                No se guardan solas: la ficha las muestra junto al valor actual y el técnico elige cuáles
//                aplicar antes de «Guardar». Se guardan en FichaTecnicaEmpresa porque el worker Ley PD lee
//                esa tabla (no puede leer DetalleEquipo, Servidor ni RedSucursal).
//
// Nunca incluye credenciales (contraseñas de servidores, claves wifi).
import { prisma } from "../../lib/prisma.js";
/* =========================================================
   TIPOS
========================================================= */
export const CAMPOS_SUGERIBLES_FICHA_TECNICA = [
    "tecnicoPrincipal",
    "tecnicosRespaldo",
    "pcsNotebooks",
    "servidores",
    "impresorasPerifericos",
    "routersSwitches",
    "sistemasOperativos",
    "licenciasVigentes",
    "antivirusSeguridad",
    "proveedorInternet",
    "velocidadContratada",
    "configuracionIP",
    "correosCorporativos",
];
/* =========================================================
   CONFIG
========================================================= */
/** Agenda que todavía no ocurre (o está en curso). */
export const ESTADOS_AGENDA_PENDIENTE = ["PROGRAMADA", "NOTIFICADA", "EN_RUTA", "INICIADA"];
/** Ventana para sugerir técnicos: visitas completadas de los últimos 6 meses. */
const DIAS_TECNICOS = 180;
const TIPOS_COMPUTADOR = {
    NOTEBOOK: "notebook",
    DESKTOP: "escritorio",
    ALL_IN_ONE: "all-in-one",
    CPU: "CPU",
    EQUIPO_ARMADO: "equipo armado",
    GENERICO: "sin tipo definido",
};
const TIPOS_PERIFERICO = {
    IMPRESORA: "impresora",
    LASER: "impresora láser",
    SCANNER: "escáner",
    MONITOR: "monitor",
    LED: "pantalla LED",
    RELOJ_CONTROL: "reloj control",
};
/* =========================================================
   FORMATO
========================================================= */
/** Instante → dd-mm-aaaa en hora de Chile. */
const fechaChile = (d) => new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
}).format(d);
/** Campo @db.Date (00:00 UTC) → dd-mm-aaaa sin correr el día. */
const fechaDia = (d) => new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
}).format(d);
/** Hoy en Chile como fecha @db.Date (00:00 UTC). */
function hoyChileDia() {
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    return new Date(`${ymd}T00:00:00Z`);
}
/** Cuenta valores de texto: «Windows 11 Pro (8), Windows 10 Pro (2)». Ignora vacíos. */
function contar(valores) {
    const conteo = new Map();
    for (const v of valores) {
        const t = (v ?? "").replace(/\s+/g, " ").trim();
        if (t)
            conteo.set(t, (conteo.get(t) ?? 0) + 1);
    }
    return [...conteo.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
        .map(([t, n]) => `${t} (${n})`)
        .join(", ");
}
/** «7 notebook, 3 escritorio» a partir de {etiqueta: cantidad}. */
function listaCantidades(conteo) {
    return [...conteo.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => `${n} ${t}`)
        .join(", ");
}
const unicos = (valores) => [...new Set(valores.map((v) => (v ?? "").trim()).filter(Boolean))];
/* =========================================================
   VISITAS (calculadas, no se guardan)
========================================================= */
export async function obtenerVisitasCrmFichaTecnica(empresaId) {
    const [ultima, proxima] = await Promise.all([
        prisma.visita.findFirst({
            where: { empresaId, status: "COMPLETADA" },
            orderBy: { inicio: "desc" },
            select: { inicio: true, tecnico: { select: { nombre: true } } },
        }),
        prisma.agendaVisita.findFirst({
            where: {
                empresaId,
                fecha: { gte: hoyChileDia() },
                estado: { in: [...ESTADOS_AGENDA_PENDIENTE] },
            },
            orderBy: [{ fecha: "asc" }, { horaInicio: "asc" }],
            select: {
                fecha: true,
                horaInicio: true,
                tecnicos: { select: { tecnico: { select: { nombre: true } } } },
            },
        }),
    ]);
    return {
        ultima: ultima
            ? { fecha: fechaChile(ultima.inicio), tecnico: ultima.tecnico?.nombre ?? null }
            : null,
        proxima: proxima
            ? {
                fecha: fechaDia(proxima.fecha),
                hora: proxima.horaInicio ?? null,
                tecnicos: proxima.tecnicos.map((t) => t.tecnico.nombre),
            }
            : null,
    };
}
/* =========================================================
   SUGERENCIAS
========================================================= */
export async function obtenerDatosCrmFichaTecnica(empresaId) {
    const desde = new Date(Date.now() - DIAS_TECNICOS * 24 * 60 * 60 * 1000);
    const [visitas, empresa, equipos, servidores, suscripciones, isps, redes, cuentas, visitasTecnicos] = await Promise.all([
        obtenerVisitasCrmFichaTecnica(empresaId),
        prisma.empresa.findUnique({
            where: { id_empresa: empresaId },
            select: { id_empresa: true, dominios: true },
        }),
        prisma.equipo.findMany({
            where: { empresaId, deletedAt: null, estado: "ACTIVO" },
            select: {
                tipo: true,
                marca: true,
                modelo: true,
                detalle: { select: { so: true, antivirusNombre: true, antivirusActivo: true } },
                adicionales: { where: { estado: "ASIGNADO" }, select: { tipo: true, cantidad: true } },
            },
        }),
        /* Solo el nombre: nunca credenciales */
        prisma.servidor.findMany({
            where: { empresaId },
            orderBy: { nombre: "asc" },
            select: { nombre: true },
        }),
        prisma.suscripcionContrato.findMany({
            where: { empresaId, activo: true },
            orderBy: [{ fabricante: "asc" }, { productoPlan: "asc" }],
            select: { fabricante: true, productoPlan: true, cantidadLicencias: true },
        }),
        prisma.empresaISP.findMany({
            where: { empresaId },
            orderBy: [{ esPrincipal: "desc" }, { id: "asc" }],
            select: { operador: true, servicio: true, ipRed: true, esPrincipal: true },
        }),
        /* Sin clave wifi */
        prisma.redSucursal.findMany({
            where: { sucursal: { empresaId } },
            orderBy: { id: "asc" },
            select: { ipRed: true, gateway: true, sucursal: { select: { nombre: true } } },
        }),
        prisma.solicitante.groupBy({
            by: ["accountType"],
            where: { empresaId, isActive: true, deletedAt: null },
            _count: { _all: true },
        }),
        prisma.visita.findMany({
            where: { empresaId, status: "COMPLETADA", inicio: { gte: desde } },
            select: { tecnico: { select: { nombre: true } } },
        }),
    ]);
    if (!empresa)
        throw new Error("EMPRESA_NO_ENCONTRADA");
    const sugerencias = {};
    const poner = (campo, valor, fuente) => {
        if (valor.trim())
            sugerencias[campo] = { valor: valor.trim(), fuente };
    };
    /* ---------------- técnicos (visitas de los últimos 6 meses) ---------------- */
    const porTecnico = new Map();
    for (const v of visitasTecnicos) {
        const nombre = v.tecnico?.nombre?.trim();
        if (nombre)
            porTecnico.set(nombre, (porTecnico.get(nombre) ?? 0) + 1);
    }
    const ranking = [...porTecnico.entries()].sort((a, b) => b[1] - a[1]);
    const fuenteTecnicos = `Visitas completadas de los últimos 6 meses (${visitasTecnicos.length})`;
    if (ranking[0])
        poner("tecnicoPrincipal", ranking[0][0], fuenteTecnicos);
    if (ranking.length > 1) {
        poner("tecnicosRespaldo", ranking.slice(1, 4).map(([n]) => n).join(", "), fuenteTecnicos);
    }
    /* ---------------- equipos ---------------- */
    const computadores = equipos.filter((e) => e.tipo in TIPOS_COMPUTADOR);
    const fuenteInventario = (conDato, total) => `Inventario de equipos del CRM (${conDato} de ${total} con dato)`;
    if (computadores.length) {
        const porTipo = new Map();
        for (const e of computadores) {
            const t = TIPOS_COMPUTADOR[e.tipo] ?? e.tipo;
            porTipo.set(t, (porTipo.get(t) ?? 0) + 1);
        }
        poner("pcsNotebooks", `${computadores.length} equipos: ${listaCantidades(porTipo)}`, `Inventario de equipos activos del CRM`);
        const so = computadores.map((e) => e.detalle?.so);
        poner("sistemasOperativos", contar(so), fuenteInventario(so.filter((x) => x?.trim()).length, computadores.length));
        const av = computadores.map((e) => e.detalle?.antivirusNombre);
        const inactivos = computadores.filter((e) => e.detalle?.antivirusActivo === false).length;
        const textoAv = contar(av);
        if (textoAv) {
            poner("antivirusSeguridad", textoAv + (inactivos ? ` · inactivo en ${inactivos} equipo(s)` : ""), `Agente de inventario (${av.filter((x) => x?.trim()).length} de ${computadores.length} equipos)`);
        }
    }
    const perifericos = new Map();
    for (const e of equipos) {
        const t = TIPOS_PERIFERICO[e.tipo];
        if (t)
            perifericos.set(t, (perifericos.get(t) ?? 0) + 1);
        for (const a of e.adicionales) {
            const tipo = a.tipo.trim().toLowerCase();
            if (tipo)
                perifericos.set(tipo, (perifericos.get(tipo) ?? 0) + (a.cantidad || 1));
        }
    }
    if (perifericos.size) {
        poner("impresorasPerifericos", listaCantidades(perifericos), "Inventario de equipos y adicionales del CRM");
    }
    const routers = equipos.filter((e) => e.tipo === "ROUTER");
    if (routers.length) {
        poner("routersSwitches", contar(routers.map((e) => `${e.marca} ${e.modelo}`)), "Inventario de equipos del CRM");
    }
    const nas = equipos.filter((e) => e.tipo === "NAS");
    const partesServidores = [
        servidores.length ? `${servidores.length} servidor(es): ${servidores.map((s) => s.nombre).join(", ")}` : "",
        nas.length ? `NAS: ${contar(nas.map((e) => `${e.marca} ${e.modelo}`))}` : "",
    ].filter(Boolean);
    if (partesServidores.length) {
        poner("servidores", partesServidores.join(" · "), "Servidores e inventario del CRM");
    }
    /* ---------------- licencias (suscripciones activas) ---------------- */
    if (suscripciones.length) {
        poner("licenciasVigentes", suscripciones.map((s) => `${s.fabricante} ${s.productoPlan} (${s.cantidadLicencias})`).join(", "), "Suscripciones y contratos activos del CRM");
    }
    /* ---------------- internet y red ---------------- */
    if (isps.length) {
        const operadores = unicos(isps.map((i) => i.operador));
        const principal = isps.find((i) => i.esPrincipal)?.operador?.trim();
        poner("proveedorInternet", operadores.map((o) => (o === principal && operadores.length > 1 ? `${o} (principal)` : o)).join(", "), "ISP / conectividad del CRM");
        const servicios = isps
            .filter((i) => i.servicio?.trim())
            .map((i) => (i.operador?.trim() ? `${i.operador.trim()}: ${i.servicio?.trim()}` : `${i.servicio?.trim()}`));
        poner("velocidadContratada", unicos(servicios).join(" · "), "Servicio registrado en ISP / conectividad");
    }
    const lineasIp = [
        ...unicos(isps.flatMap((i) => i.ipRed)),
        ...redes
            .filter((r) => r.ipRed?.trim() || r.gateway?.trim())
            .map((r) => [
            r.ipRed?.trim(),
            r.gateway?.trim() ? `gateway ${r.gateway.trim()}` : "",
            r.sucursal?.nombre ? `(${r.sucursal.nombre})` : "",
        ].filter(Boolean).join(" ")),
    ];
    if (lineasIp.length) {
        poner("configuracionIP", unicos(lineasIp).join(" · "), "Redes de ISP y sucursales del CRM (sin claves)");
    }
    /* ---------------- correo ---------------- */
    const porCuenta = new Map(cuentas.map((c) => [c.accountType, c._count._all]));
    const google = porCuenta.get("google") ?? 0;
    const microsoft = porCuenta.get("microsoft") ?? 0;
    const plataforma = google || microsoft
        ? (google >= microsoft ? `Google Workspace (${google} cuentas)` : `Microsoft 365 (${microsoft} cuentas)`)
        : "";
    const correo = [empresa.dominios.join(", "), plataforma].filter(Boolean).join(" · ");
    if (correo) {
        poner("correosCorporativos", correo, "Dominios de la empresa y solicitantes activos sincronizados");
    }
    return { visitas, sugerencias };
}
//# sourceMappingURL=ficha-tecnica-crm.service.js.map