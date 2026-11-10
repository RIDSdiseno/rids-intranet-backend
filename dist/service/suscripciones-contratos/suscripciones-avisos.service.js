// src/service/suscripciones-contratos/suscripciones-avisos.service.ts
/* =========================================================
   AVISOS DE VENCIMIENTO DE SUSCRIPCIONES Y CONTRATOS

   Una vez al día (suscripciones-avisos.cron.ts):

   1. Busca suscripciones activas, con avisos activos y de
      empresas activas, con fechaRenovacion o fechaTermino
      anterior a hoy + mayor umbral. Cada fecha se evalúa
      por separado.
   2. Fecha próxima: umbral más chico >= días que faltan
      (30, 15, 7, 1, 0).
      Fecha vencida: seguimiento a los 1, 7 y 30 días de
      vencida (umbral guardado en negativo: -1, -7, -30).
      Si un día no corrió, el aviso sale al siguiente igual.
   3. Reserva el aviso en SuscripcionContratoAviso (UNIQUE)
      ANTES de enviar: dos ejecuciones no envían lo mismo.
   4. Envía UN correo resumen por destinatario:
        SUSCRIPCIONES_AVISO_CORREOS  → recibe todo
        correosAviso del contrato    → solo sus contratos
      Cada correo incluye además TODOS los vencidos sin
      actualizar que le corresponden (sección aparte), aunque
      ya se hayan avisado. Por sí solos no generan correo.
   5. Si ningún destinatario de un aviso recibió el correo,
      libera la reserva para reintentar en la próxima corrida.

   Las fechas se guardan como medianoche UTC (YYYY-MM-DD del
   formulario), igual que las muestra la ficha (timeZone UTC).
   "Hoy" se calcula en hora de Chile.
   ========================================================= */
import { EstadoRecordatorio, OrigenRecordatorio, Prisma, } from "@prisma/client";
import { prisma, prismaBase, } from "../../lib/prisma.js";
import { obtenerTecnicosActivosParaRecordatorio, } from "../recordatorios.service.js";
import { sendEmail, } from "../correos-masivos/masivos-email-sender.service.js";
/* =========================================================
   CONFIG
   ========================================================= */
const LOG = "[SUSCRIPCIONES AVISOS]";
const ZONA = "America/Santiago";
const DIA_MS = 86_400_000;
const UMBRALES_DEFECTO = [
    0,
    1,
    7,
    15,
    30,
];
const UMBRALES_VENCIDOS_DEFECTO = [
    1,
    7,
    30,
];
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function listaDias(valor, defecto, minimo) {
    const texto = valor?.trim();
    if (!texto) {
        return defecto;
    }
    const lista = [
        ...new Set(texto
            .split(/[,;\s]+/)
            .map(Number)
            .filter((n) => Number.isInteger(n) &&
            n >= minimo &&
            n <= 365)),
    ].sort((a, b) => a - b);
    return lista.length > 0
        ? lista
        : defecto;
}
/** Días de anticipación, de menor a mayor. SUSCRIPCIONES_AVISO_DIAS="30,15,7,1,0" */
export function umbralesAviso() {
    return listaDias(process.env
        .SUSCRIPCIONES_AVISO_DIAS, UMBRALES_DEFECTO, 0);
}
/** Días después de vencida para el seguimiento. SUSCRIPCIONES_AVISO_DIAS_VENCIDOS="1,7,30" */
export function umbralesVencidos() {
    return listaDias(process.env
        .SUSCRIPCIONES_AVISO_DIAS_VENCIDOS, UMBRALES_VENCIDOS_DEFECTO, 1);
}
/** Hora del día (Chile) en que corre el aviso. SUSCRIPCIONES_AVISO_HORA=8 */
export function horaAviso() {
    const hora = Number(process.env
        .SUSCRIPCIONES_AVISO_HORA ??
        8);
    return Number.isInteger(hora) &&
        hora >= 0 &&
        hora <= 23
        ? hora
        : 8;
}
/* =========================================================
   CORREOS
   ========================================================= */
/** Normaliza una lista de correos: minúsculas, sin repetidos, solo válidos. */
export function normalizarListaCorreos(valor) {
    const items = Array.isArray(valor)
        ? valor
        : String(valor ??
            "").split(/[,;\s]+/);
    return [
        ...new Set(items
            .map((correo) => String(correo)
            .trim()
            .toLowerCase())
            .filter((correo) => REGEX_CORREO.test(correo))),
    ];
}
function correosGlobales() {
    return normalizarListaCorreos(process.env
        .SUSCRIPCIONES_AVISO_CORREOS);
}
/* =========================================================
   FECHAS
   ========================================================= */
/** "YYYY-MM-DD" de hoy en Chile. */
export function hoyChile() {
    return new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: ZONA,
    }).format(new Date());
}
/** Hora actual en Chile (0-23). */
export function horaChileActual() {
    return Number(new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        hourCycle: "h23",
        timeZone: ZONA,
    }).format(new Date()));
}
function msDia(clave) {
    return Date.parse(`${clave}T00:00:00.000Z`);
}
function claveFecha(fecha) {
    return fecha
        .toISOString()
        .slice(0, 10);
}
function fechaVisible(clave) {
    const [anio, mes, dia,] = clave.split("-");
    return `${dia}-${mes}-${anio}`;
}
/* =========================================================
   FORMATO
   ========================================================= */
function escaparHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function formatoCosto(valor, moneda) {
    if (valor ===
        null) {
        return "—";
    }
    const numero = Number(valor);
    if (moneda === "CLP" ||
        moneda === "USD" ||
        moneda === "EUR") {
        return new Intl.NumberFormat("es-CL", {
            style: "currency",
            currency: moneda,
            maximumFractionDigits: 2,
        }).format(numero);
    }
    return `${new Intl.NumberFormat("es-CL", {
        maximumFractionDigits: 2,
    }).format(numero)} ${moneda}`;
}
/** dias < 0 = vencida hace -dias días. */
function textoDias(dias) {
    if (dias < 0) {
        return dias === -1
            ? "Ayer"
            : `Hace ${-dias} días`;
    }
    if (dias === 0) {
        return "Vence hoy";
    }
    return dias === 1
        ? "Mañana"
        : `En ${dias} días`;
}
/* =========================================================
   CORREO RESUMEN
   ========================================================= */
/*
 * Mismos anchos en todas las tablas (table-layout:fixed).
 * El ancho va en <col> y en <th> porque Outlook escritorio
 * respeta mejor el del <th>.
 */
const COLUMNAS = [
    {
        titulo: "Vence",
        ancho: 12,
    },
    {
        titulo: "Fecha",
        ancho: 12,
    },
    {
        titulo: "Producto / plan",
        ancho: 26,
    },
    {
        titulo: "Lic.",
        ancho: 6,
        centro: true,
    },
    {
        titulo: "Costo mensual",
        ancho: 13,
    },
    {
        titulo: "N° contrato",
        ancho: 13,
    },
    {
        titulo: "Ejecutivo",
        ancho: 18,
    },
];
const ESTILO_TH = "padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:#475569;background:#F1F5F9;border-bottom:1px solid #E2E8F0;";
const ESTILO_TD = "padding:8px 10px;font-size:13px;color:#1E293B;border-bottom:1px solid #E2E8F0;vertical-align:top;word-wrap:break-word;overflow-wrap:anywhere;";
function badge(dias) {
    const [fondo, texto,] = dias <= 0
        ? [
            "#FEE2E2",
            "#B91C1C",
        ]
        : dias <= 7
            ? [
                "#FEF3C7",
                "#B45309",
            ]
            : [
                "#E0F2FE",
                "#0369A1",
            ];
    return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${fondo};color:${texto};font-size:12px;font-weight:600;white-space:nowrap;">${textoDias(dias)}</span>`;
}
/** Nombre, correo y teléfono en líneas separadas; el correo puede cortarse después de la "@". */
function celdaEjecutivo(ejecutivo) {
    if (!ejecutivo) {
        return "—";
    }
    return ejecutivo
        .split("\n")
        .map((linea) => escaparHtml(linea).replaceAll("@", "@<wbr>"))
        .join("<br>");
}
function tablaEmpresa(empresa, lista) {
    const colgroup = COLUMNAS
        .map((c) => `<col style="width:${c.ancho}%;">`)
        .join("");
    const encabezado = COLUMNAS
        .map((c) => `<th style="${ESTILO_TH}width:${c.ancho}%;${c.centro ? "text-align:center;" : ""}">${c.titulo}</th>`)
        .join("");
    const filas = [
        ...lista,
    ]
        .sort((a, b) => a.dias -
        b.dias)
        .map((a) => `
                <tr>
                    <td style="${ESTILO_TD}">${badge(a.dias)}</td>
                    <td style="${ESTILO_TD}">${a.tipoFecha === "RENOVACION" ? "Renovación" : "Término"}<br><span style="color:#64748B;">${fechaVisible(a.fecha)}</span></td>
                    <td style="${ESTILO_TD}"><strong>${escaparHtml(a.productoPlan)}</strong><br><span style="color:#64748B;">${escaparHtml(a.fabricante)} · ${escaparHtml(a.proveedor)}</span></td>
                    <td style="${ESTILO_TD}text-align:center;">${a.cantidadLicencias}</td>
                    <td style="${ESTILO_TD}">${escaparHtml(a.costo)}</td>
                    <td style="${ESTILO_TD}">${escaparHtml(a.numeroContrato ?? "—")}</td>
                    <td style="${ESTILO_TD}font-size:12px;">${celdaEjecutivo(a.ejecutivo)}</td>
                </tr>`)
        .join("");
    return `
        <h3 style="margin:20px 0 8px;font-size:15px;color:#0B2545;">${escaparHtml(empresa)}</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed;border-collapse:collapse;border:1px solid #E2E8F0;">
            <colgroup>${colgroup}</colgroup>
            <thead>
                <tr>${encabezado}</tr>
            </thead>
            <tbody>${filas}
            </tbody>
        </table>`;
}
/** Agrupa por empresa; empresas con el vencimiento más urgente primero. */
function tablasPorEmpresa(items) {
    const porEmpresa = new Map();
    for (const item of items) {
        const lista = porEmpresa.get(item.empresa) ??
            [];
        lista.push(item);
        porEmpresa.set(item.empresa, lista);
    }
    return [
        ...porEmpresa.entries(),
    ]
        .sort((a, b) => Math.min(...a[1].map((x) => x.dias)) -
        Math.min(...b[1].map((x) => x.dias)) ||
        a[0].localeCompare(b[0], "es"))
        .map(([empresa, lista,]) => tablaEmpresa(empresa, lista))
        .join("");
}
export function construirCorreoAvisos(items) {
    const proximos = items.filter((a) => a.dias >=
        0);
    const vencidos = items.filter((a) => a.dias <
        0);
    const venceHoy = proximos.filter((a) => a.dias ===
        0).length;
    const partesAsunto = [];
    if (proximos.length >
        0) {
        partesAsunto.push(`${proximos.length} por vencer${venceHoy > 0
            ? ` (${venceHoy} hoy)`
            : ""}`);
    }
    if (vencidos.length >
        0) {
        partesAsunto.push(`${vencidos.length} vencido${vencidos.length === 1 ? "" : "s"}`);
    }
    const subject = `Avisos de vencimiento: ${partesAsunto.join(" · ")}`;
    const partesIntro = [];
    if (proximos.length >
        0) {
        partesIntro.push(proximos.length === 1
            ? "<strong>1</strong> suscripción o contrato por vencer"
            : `<strong>${proximos.length}</strong> suscripciones o contratos por vencer`);
    }
    if (vencidos.length >
        0) {
        partesIntro.push(vencidos.length === 1
            ? "<strong>1</strong> vencido sin actualizar"
            : `<strong>${vencidos.length}</strong> vencidos sin actualizar`);
    }
    const seccionProximos = proximos.length > 0
        ? `
    <h2 style="margin:24px 0 0;font-size:17px;color:#0B2545;">Próximos vencimientos</h2>
    ${tablasPorEmpresa(proximos)}`
        : "";
    const seccionVencidos = vencidos.length > 0
        ? `
    <h2 style="margin:28px 0 4px;font-size:17px;color:#B91C1C;">Vencidos sin actualizar</h2>
    <p style="margin:0;font-size:13px;color:#64748B;">La fecha ya pasó y la suscripción sigue activa. Actualiza la fecha de renovación o de término, o desactiva la suscripción si ya no está vigente.</p>
    ${tablasPorEmpresa(vencidos)}`
        : "";
    const bodyHtml = `
<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1E293B;max-width:900px;">
    <p style="margin:0 0 12px;">Hola:</p>
    <p style="margin:0;">Hay ${partesIntro.join(" y ")}.</p>
    ${seccionProximos}
    ${seccionVencidos}
    <p style="margin:24px 0 0;font-size:12px;color:#64748B;">Mensaje automático de la intranet RIDS. Para dejar de recibir avisos de un contrato, desactiva «Avisar vencimiento» en la pestaña Suscripciones de la ficha de la empresa.</p>
</div>
        `.trim();
    return {
        subject,
        bodyHtml,
    };
}
/* =========================================================
   CAMPANA DE RECORDATORIOS

   Un recordatorio por suscripción y técnico interno
   (origen SUSCRIPCION). Si ya existe, se reutiliza y vuelve
   a PENDIENTE sin leer, igual que los recordatorios de tickets.
   fechaProgramada = ahora: cuenta de inmediato en la campana.

   Solo para avisos NUEVOS (no para los vencidos acompañantes):
   la campana se reactiva en cada umbral, no todos los días.
   ========================================================= */
function tituloRecordatorio(dias) {
    if (dias < 0) {
        return dias === -1
            ? "Venció ayer"
            : `Venció hace ${-dias} días`;
    }
    if (dias === 0) {
        return "Vence hoy";
    }
    return dias === 1
        ? "Vence mañana"
        : `Vence en ${dias} días`;
}
async function sincronizarRecordatoriosSuscripciones(avisos, tecnicoIds) {
    if (avisos.length === 0 ||
        tecnicoIds.length === 0) {
        return 0;
    }
    const porSuscripcion = new Map();
    for (const aviso of avisos) {
        const lista = porSuscripcion.get(aviso.suscripcionId) ??
            [];
        lista.push(aviso);
        porSuscripcion.set(aviso.suscripcionId, lista);
    }
    const existentes = await prismaBase
        .recordatorio
        .findMany({
        where: {
            origen: OrigenRecordatorio.SUSCRIPCION,
            suscripcionId: {
                in: [
                    ...porSuscripcion.keys(),
                ],
            },
            destinatarioId: {
                in: tecnicoIds,
            },
        },
        select: {
            suscripcionId: true,
            destinatarioId: true,
        },
    });
    const conRegistro = new Set(existentes.map((r) => `${r.suscripcionId}|${r.destinatarioId}`));
    const ahora = new Date();
    let total = 0;
    for (const [suscripcionId, lista,] of porSuscripcion) {
        lista.sort((a, b) => a.dias -
            b.dias);
        const principal = lista[0];
        if (!principal) {
            continue;
        }
        const titulo = `${tituloRecordatorio(principal.dias)}: ${principal.productoPlan}`;
        const mensaje = [
            principal.empresa,
            ...lista.map((a) => `${a.tipoFecha === "RENOVACION" ? "Renovación" : "Término"} ${fechaVisible(a.fecha)}`),
            `${principal.fabricante} · ${principal.proveedor}`,
        ].join(" · ");
        const actualizar = tecnicoIds.filter((id) => conRegistro.has(`${suscripcionId}|${id}`));
        const crear = tecnicoIds.filter((id) => !conRegistro.has(`${suscripcionId}|${id}`));
        await prismaBase.$transaction([
            prismaBase
                .recordatorio
                .updateMany({
                where: {
                    origen: OrigenRecordatorio.SUSCRIPCION,
                    suscripcionId,
                    destinatarioId: {
                        in: actualizar,
                    },
                },
                data: {
                    titulo,
                    mensaje,
                    fechaProgramada: ahora,
                    estado: EstadoRecordatorio.PENDIENTE,
                    leidoAt: null,
                    notificadoAt: null,
                    completadoAt: null,
                    canceladoAt: null,
                },
            }),
            prismaBase
                .recordatorio
                .createMany({
                data: crear.map((destinatarioId) => ({
                    titulo,
                    mensaje,
                    fechaProgramada: ahora,
                    estado: EstadoRecordatorio.PENDIENTE,
                    origen: OrigenRecordatorio.SUSCRIPCION,
                    destinatarioId,
                    suscripcionId,
                })),
            }),
        ]);
        total +=
            tecnicoIds.length;
    }
    return total;
}
/* =========================================================
   PROCESO PRINCIPAL
   ========================================================= */
/** Identifica una fecha concreta de un contrato. */
function claveFechaContrato(a) {
    return `${a.suscripcionId}|${a.tipoFecha}|${a.fecha}`;
}
function clave(a) {
    return `${claveFechaContrato(a)}|${a.umbral}`;
}
export async function procesarAvisosSuscripciones(opciones = {}) {
    const simulado = opciones.simular ===
        true;
    const hoy = opciones.hoy &&
        /^\d{4}-\d{2}-\d{2}$/.test(opciones.hoy)
        ? opciones.hoy
        : hoyChile();
    const umbrales = umbralesAviso();
    const vencidosUmbrales = umbralesVencidos();
    const maximo = umbrales[umbrales.length - 1] ??
        30;
    const msHoy = msDia(hoy);
    /* Incluye todo lo vencido y lo que vence hasta hoy + maximo */
    const hasta = {
        lt: new Date(msHoy +
            (maximo + 1) *
                DIA_MS),
    };
    const resultado = {
        hoy,
        simulado,
        avisos: 0,
        enviados: 0,
        sinDestinatarios: 0,
        vencidos: 0,
        recordatorios: 0,
        correos: [],
        planificados: [],
        acompanantes: [],
    };
    /* ---------- 1. Candidatos ---------- */
    const suscripciones = await prisma
        .suscripcionContrato
        .findMany({
        where: {
            activo: true,
            avisosActivos: true,
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
            proveedor: true,
            fabricante: true,
            productoPlan: true,
            cantidadLicencias: true,
            costoMensual: true,
            moneda: true,
            numeroContrato: true,
            fechaRenovacion: true,
            fechaTermino: true,
            correosAviso: true,
            empresa: {
                select: {
                    nombre: true,
                },
            },
            ejecutivosComerciales: {
                orderBy: [
                    {
                        principal: "desc",
                    },
                    {
                        id: "asc",
                    },
                ],
                take: 1,
                select: {
                    nombre: true,
                    email: true,
                    telefono: true,
                },
            },
        },
    });
    if (suscripciones.length ===
        0) {
        return resultado;
    }
    /* ---------- 2. Qué toca avisar ---------- */
    const globales = correosGlobales();
    const tecnicoIds = (await obtenerTecnicosActivosParaRecordatorio()).map((t) => t.id_tecnico);
    const candidatos = [];
    /** Todas las fechas vencidas (para la sección "Vencidos sin actualizar"). */
    const vencidas = [];
    for (const s of suscripciones) {
        const destinatarios = normalizarListaCorreos([
            ...globales,
            ...s.correosAviso,
        ]);
        const ejecutivo = s.ejecutivosComerciales[0];
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
            const fechaClave = claveFecha(fecha);
            const dias = Math.round((msDia(fechaClave) -
                msHoy) /
                DIA_MS);
            if (dias >
                maximo) {
                continue;
            }
            /*
             * Próxima: umbral más chico >= días que faltan.
             * Vencida: mayor seguimiento <= días de atraso, en negativo.
             */
            let umbral;
            if (dias >= 0) {
                umbral =
                    umbrales.find((u) => u >=
                        dias);
            }
            else {
                const seguimiento = vencidosUmbrales
                    .filter((u) => u <=
                    -dias)
                    .pop();
                umbral =
                    seguimiento ===
                        undefined
                        ? undefined
                        : -seguimiento;
            }
            /* Sin correos ni técnicos: nadie a quien avisar */
            if (destinatarios.length ===
                0 &&
                tecnicoIds.length ===
                    0) {
                if (umbral !==
                    undefined) {
                    resultado.sinDestinatarios +=
                        1;
                }
                continue;
            }
            const item = {
                suscripcionId: s.id,
                empresaId: s.empresaId,
                empresa: s.empresa.nombre,
                fabricante: s.fabricante,
                productoPlan: s.productoPlan,
                proveedor: s.proveedor,
                cantidadLicencias: s.cantidadLicencias,
                costo: formatoCosto(s.costoMensual, s.moneda),
                numeroContrato: s.numeroContrato,
                ejecutivo: ejecutivo
                    ? [
                        ejecutivo.nombre,
                        ejecutivo.email,
                        ejecutivo.telefono,
                    ]
                        .filter(Boolean)
                        .join("\n")
                    : null,
                tipoFecha,
                fecha: fechaClave,
                dias,
                destinatarios,
            };
            if (dias < 0) {
                vencidas.push(item);
            }
            if (umbral !==
                undefined) {
                candidatos.push({
                    ...item,
                    umbral,
                });
            }
        }
    }
    /* ---------- 3. Quitar los ya enviados ---------- */
    const enviadosAntes = candidatos.length > 0
        ? await prisma
            .suscripcionContratoAviso
            .findMany({
            where: {
                suscripcionId: {
                    in: [
                        ...new Set(candidatos.map((c) => c.suscripcionId)),
                    ],
                },
            },
            select: {
                suscripcionId: true,
                tipoFecha: true,
                fechaObjetivo: true,
                umbral: true,
            },
        })
        : [];
    const yaEnviados = new Set(enviadosAntes.map((a) => clave({
        suscripcionId: a.suscripcionId,
        tipoFecha: a.tipoFecha,
        fecha: claveFecha(a.fechaObjetivo),
        umbral: a.umbral,
    })));
    const pendientes = candidatos.filter((c) => !yaEnviados.has(clave(c)));
    /** Vencidos que no van como aviso propio: acompañan el correo. */
    const acompanantesDe = (avisos) => {
        const conAviso = new Set(avisos.map(claveFechaContrato));
        return vencidas.filter((v) => !conAviso.has(claveFechaContrato(v)));
    };
    if (simulado) {
        resultado.avisos =
            pendientes.length;
        resultado.planificados =
            pendientes;
        /* Solo acompañan si algún correo sale */
        resultado.acompanantes =
            pendientes.length > 0
                ? acompanantesDe(pendientes)
                : [];
        resultado.vencidos =
            resultado.acompanantes.length;
        resultado.recordatorios =
            new Set(pendientes.map((p) => p.suscripcionId)).size *
                tecnicoIds.length;
        return resultado;
    }
    /* ---------- 4. Reservar ---------- */
    const reservados = [];
    for (const aviso of pendientes) {
        try {
            const creado = await prisma
                .suscripcionContratoAviso
                .create({
                data: {
                    suscripcionId: aviso.suscripcionId,
                    tipoFecha: aviso.tipoFecha,
                    fechaObjetivo: new Date(msDia(aviso.fecha)),
                    umbral: aviso.umbral,
                    destinatarios: aviso.destinatarios,
                },
                select: {
                    id: true,
                },
            });
            reservados.push({
                id: creado.id,
                aviso,
            });
        }
        catch (error) {
            /* Otra ejecución ya lo reservó */
            if (error instanceof
                Prisma.PrismaClientKnownRequestError &&
                error.code ===
                    "P2002") {
                continue;
            }
            throw error;
        }
    }
    resultado.avisos =
        reservados.length;
    resultado.planificados =
        reservados.map((r) => r.aviso);
    if (reservados.length ===
        0) {
        return resultado;
    }
    const acompanantes = acompanantesDe(resultado.planificados);
    resultado.acompanantes =
        acompanantes;
    resultado.vencidos =
        acompanantes.length;
    /* ---------- 4b. Campana de recordatorios ---------- */
    let campanaOk = false;
    try {
        resultado.recordatorios =
            await sincronizarRecordatoriosSuscripciones(resultado.planificados, tecnicoIds);
        campanaOk =
            true;
    }
    catch (error) {
        console.error(`${LOG} ❌ Error creando recordatorios`, error instanceof Error
            ? error.message
            : error);
    }
    /* ---------- 5. Un correo resumen por destinatario ---------- */
    const porDestinatario = new Map();
    for (const r of reservados) {
        for (const correo of r.aviso.destinatarios) {
            const lista = porDestinatario.get(correo) ??
                [];
            lista.push(r);
            porDestinatario.set(correo, lista);
        }
    }
    const entregados = new Set();
    for (const [correo, lista,] of porDestinatario) {
        const vencidosCorreo = acompanantes.filter((v) => v.destinatarios.includes(correo));
        const { subject, bodyHtml, } = construirCorreoAvisos([
            ...lista.map((r) => r.aviso),
            ...vencidosCorreo,
        ]);
        try {
            await sendEmail({
                to: correo,
                subject,
                bodyHtml,
            });
            for (const r of lista) {
                entregados.add(r.id);
            }
            resultado.correos.push({
                to: correo,
                avisos: lista.length,
                vencidos: vencidosCorreo.length,
                ok: true,
            });
        }
        catch (error) {
            const detalle = error instanceof Error
                ? error.message
                : "Error desconocido";
            console.error(`${LOG} ❌ Error enviando a ${correo}`, detalle);
            resultado.correos.push({
                to: correo,
                avisos: lista.length,
                vencidos: vencidosCorreo.length,
                ok: false,
                error: detalle,
            });
        }
    }
    /* ---------- 6. Liberar lo que no llegó a nadie ---------- */
    /*
 * Se libera (se reintenta mañana) si el correo no llegó a nadie.
 * Un aviso sin correos se da por entregado si la campana funcionó.
 */
    const sinEntregar = reservados
        .filter((r) => !entregados.has(r.id) &&
        !(campanaOk &&
            r.aviso.destinatarios.length ===
                0))
        .map((r) => r.id);
    if (sinEntregar.length >
        0) {
        await prisma
            .suscripcionContratoAviso
            .deleteMany({
            where: {
                id: {
                    in: sinEntregar,
                },
            },
        });
    }
    resultado.enviados =
        entregados.size;
    return resultado;
}
//# sourceMappingURL=suscripciones-avisos.service.js.map