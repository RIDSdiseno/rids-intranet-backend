// src/service/empresas/ficha-empresa-pdf.service.ts
//
// PDF completo de la ficha de empresa (todas las pestañas + resumen de
// completitud). Se genera con PDFKit, igual que el informe de oportunidades.
//
// incluirSecretos = true  → contraseñas y claves en claro (usuarios internos)
// incluirSecretos = false → «Registrada» / «—» (CLIENTE)
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

import { prisma } from "../../lib/prisma.js";

import {
    evaluarCompletitudFichasEmpresas,
    CHECKLIST_LABELS,
    FICHA_TECNICA_LABELS,
    type CompletitudFichaEmpresa,
    type EstadoCompletitudSeccion,
} from "./empresa-ficha-completitud.service.js";

/* =========================================================
   TIPOS
========================================================= */

export type OpcionesFichaPdf = {
    /** Contraseñas y claves en claro. Solo para roles internos. */
    incluirSecretos: boolean;
    /** Relación comercial (entidades Gestioo). Solo para roles internos. */
    incluirRelacionComercial: boolean;
    /** Nombre de quien descarga, para el pie de página. */
    generadoPor?: string | null;
};

export type FichaEmpresaPdf = {
    buffer: Buffer;
    nombreArchivo: string;
};

type Valor = string | number | boolean | Date | null | undefined;

/* =========================================================
   ESTILO
========================================================= */

const COLOR = {
    primario: "#0e7490",
    primarioSuave: "#ecfeff",
    texto: "#0f172a",
    suave: "#64748b",
    borde: "#cbd5e1",
    filaPar: "#f8fafc",
    verde: "#047857",
    ambar: "#b45309",
    rojo: "#b91c1c",
};

const ESTADO_SECCION: Record<EstadoCompletitudSeccion, { texto: string; color: string }> = {
    COMPLETA: { texto: "Completa", color: COLOR.verde },
    INCOMPLETA: { texto: "Incompleta", color: COLOR.ambar },
    SIN_DATOS: { texto: "Sin datos", color: COLOR.rojo },
    NO_APLICA: { texto: "No aplica", color: COLOR.suave },
};

/** Campos de ficha técnica que no están en FICHA_TECNICA_LABELS (no cuentan en la completitud). */
const FICHA_TECNICA_EXTRA: Record<string, string> = {
    observacionesVisita: "Observaciones de visita",
    redesSociales: "Redes sociales",
    metodoRespaldo: "Método de respaldo",
    frecuenciaRespaldo: "Frecuencia de respaldo",
    responsableRespaldo: "Responsable de respaldo",
    ultimaRestauracion: "Última restauración",
};

/** Grupos de la ficha técnica, en el mismo orden que el formulario. */
const GRUPOS_FICHA_TECNICA: Array<{ titulo: string; campos: string[] }> = [
    {
        titulo: "Técnicos y visitas",
        campos: ["tecnicoPrincipal", "tecnicosRespaldo", "fechaUltimaVisita", "proximaVisitaProgramada", "observacionesVisita"],
    },
    {
        titulo: "Equipos y hardware",
        campos: ["pcsNotebooks", "servidores", "impresorasPerifericos", "otrosEquipos"],
    },
    {
        titulo: "Software y sistemas",
        campos: ["sistemasOperativos", "aplicacionesCriticas", "licenciasVigentes", "antivirusSeguridad"],
    },
    {
        titulo: "Redes y conectividad",
        campos: ["proveedorInternet", "velocidadContratada", "routersSwitches", "configuracionIP"],
    },
    {
        titulo: "Servicios digitales",
        campos: ["dominioWeb", "hostingProveedor", "certificadoSSL", "correosCorporativos", "redesSociales"],
    },
    {
        titulo: "Respaldo y seguridad",
        campos: ["metodoRespaldo", "frecuenciaRespaldo", "responsableRespaldo", "ultimaRestauracion"],
    },
];

/* =========================================================
   LOGO
========================================================= */

/*
 * Se busca relativo a la raíz del proyecto (process.cwd()), igual que
 * UPLOADS_DIR en config/paths.ts. Así funciona en local (tsx) y en
 * Railway (dist), porque tsc no copia los .png a dist.
 */
const RUTAS_LOGO = [
    path.resolve(process.cwd(), "src", "assets", "logo-rids.png"),
    path.resolve(process.cwd(), "assets", "logo-rids.png"),
];

let logoCache: Buffer | null | undefined;

/** Buffer del logo, o null si no está (el PDF se genera igual, sin logo). */
function logoRids(): Buffer | null {
    if (logoCache !== undefined) {
        return logoCache;
    }

    const ruta = RUTAS_LOGO.find((r) => existsSync(r));

    if (!ruta) {
        console.warn("[FICHA PDF] No se encontró logo-rids.png en:", RUTAS_LOGO.join(" | "));
    }

    logoCache = ruta ? readFileSync(ruta) : null;

    return logoCache;
}

/* =========================================================
   FORMATO
========================================================= */

const fechaChile = (d: Date, conHora = false) =>
    new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...(conHora ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    }).format(d);

function texto(v: Valor): string {
    if (v === null || v === undefined) return "—";
    if (v instanceof Date) {
        /* Fechas sin hora (guardadas a las 00:00 UTC): sin convertir de zona, o mostrarían el día anterior */
        const soloFecha =
            v.getUTCHours() === 0 &&
            v.getUTCMinutes() === 0 &&
            v.getUTCSeconds() === 0;

        return soloFecha
            ? new Intl.DateTimeFormat("es-CL", {
                timeZone: "UTC",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
            }).format(v)
            : fechaChile(v);
    }
    if (typeof v === "boolean") return v ? "Sí" : "No";
    const t = String(v).trim();
    return t || "—";
}

function monto(valor: unknown, moneda: string): string {
    if (valor === null || valor === undefined) return "—";
    const n = Number(valor);
    if (!Number.isFinite(n)) return "—";

    return moneda === "CLP"
        ? `$${n.toLocaleString("es-CL", { maximumFractionDigits: 0 })}`
        : `${moneda} ${n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nombreArchivoSeguro(nombre: string): string {
    return nombre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60) || "empresa";
}

/* =========================================================
   DATOS
========================================================= */

async function cargarDatos(empresaId: number) {
    return prisma.empresa.findUnique({
        where: { id_empresa: empresaId },
        include: {
            detalleEmpresa: true,
            fichaEmpresa: { include: { checklist: true } },
            fichaTecnicaEmpresa: true,
            contactoEmpresas: {
                include: { sucursal: { select: { nombre: true } } },
                orderBy: [{ principal: "desc" }, { nombre: "asc" }],
            },
            entidadGestioos: {
                select: { nombre: true, rut: true, tipo: true, origen: true, correo: true, telefono: true },
            },
            suscripcionesContratos: {
                include: {
                    ejecutivosComerciales: { orderBy: { principal: "desc" } },
                    contactosSoporte: { orderBy: { principal: "desc" } },
                },
                orderBy: [{ activo: "desc" }, { fechaTermino: "asc" }],
            },
            empresaISP: {
                include: { sucursal: { select: { nombre: true } } },
                orderBy: [{ esPrincipal: "desc" }, { createdAt: "asc" }],
            },
            sucursales: {
                include: {
                    responsableSucursals: true,
                    redSucursales: true,
                    accesoRouterSucursals: true,
                },
                orderBy: { nombre: "asc" },
            },
            servidors: {
                include: {
                    servidorUsuarios: {
                        include: { solicitante: { select: { nombre: true } } },
                        orderBy: { usuario: "asc" },
                    },
                },
                orderBy: { nombre: "asc" },
            },
            telefoniaParlantes: { orderBy: [{ anexo: "asc" }, { id: "asc" }] },
            telefoniaUsuarios: { orderBy: [{ nombre: "asc" }, { id: "asc" }] },
        },
    });
}

type DatosFicha = NonNullable<Awaited<ReturnType<typeof cargarDatos>>>;

/* =========================================================
   GENERAR
========================================================= */

export async function generarFichaEmpresaPdf(
    empresaId: number,
    opciones: OpcionesFichaPdf,
): Promise<FichaEmpresaPdf | null> {
    const datos = await cargarDatos(empresaId);

    if (!datos) {
        return null;
    }

    const completitud =
        (await evaluarCompletitudFichasEmpresas([empresaId])).get(empresaId) ?? null;

    const buffer = await construirPdf(datos, completitud, opciones);

    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

    return {
        buffer,
        nombreArchivo: `Ficha_${nombreArchivoSeguro(datos.nombre)}_${hoy}.pdf`,
    };
}

function construirPdf(
    e: DatosFicha,
    completitud: CompletitudFichaEmpresa | null,
    opciones: OpcionesFichaPdf,
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: "A4",
            margins: { top: 50, right: 45, bottom: 55, left: 45 },
            bufferPages: true,
            info: {
                Title: `Ficha de empresa ${e.nombre}`,
                Subject: "Ficha completa de empresa",
                Author: "RIDS",
            },
        });

        const chunks: Buffer[] = [];
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        const izquierda = doc.page.margins.left;
        const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const limiteInferior = () => doc.page.height - doc.page.margins.bottom;
        const secreto = (v: string | null | undefined) =>
            opciones.incluirSecretos ? texto(v) : v ? "Registrada" : "—";

        /* ---------------- helpers de dibujo ---------------- */

        function asegurarEspacio(alto: number) {
            if (doc.y + alto > limiteInferior()) {
                doc.addPage();
            }
        }

        function tituloSeccion(titulo: string, subtitulo?: string) {
            /* Título (30) + encabezado de tabla o primera fila de datos */
            asegurarEspacio(110);
            doc.moveDown(0.6);

            const y = doc.y;
            doc.rect(izquierda, y, ancho, 24).fill(COLOR.primario);
            doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(12)
                .text(titulo, izquierda + 10, y + 6, { width: ancho - 20 });

            doc.y = y + 30;
            doc.x = izquierda;

            if (subtitulo) {
                doc.fillColor(COLOR.suave).font("Helvetica-Oblique").fontSize(8.5)
                    .text(subtitulo, izquierda, doc.y, { width: ancho });
                doc.moveDown(0.4);
            }
        }

        function subtitulo(t: string) {
            asegurarEspacio(65);
            doc.moveDown(0.3);
            doc.fillColor(COLOR.primario).font("Helvetica-Bold").fontSize(10)
                .text(t, izquierda, doc.y, { width: ancho });
            doc.moveDown(0.2);
        }

        function vacio(t: string) {
            asegurarEspacio(20);
            doc.fillColor(COLOR.suave).font("Helvetica-Oblique").fontSize(9)
                .text(t, izquierda, doc.y, { width: ancho });
            doc.moveDown(0.4);
        }

        /** Pares etiqueta/valor en una grilla de N columnas. */
        function grilla(pares: Array<[string, Valor]>, columnas = 2) {
            const gap = 12;
            const anchoCol = (ancho - gap * (columnas - 1)) / columnas;

            for (let i = 0; i < pares.length; i += columnas) {
                const fila = pares.slice(i, i + columnas);

                const alto = Math.max(
                    ...fila.map(([etiqueta, valor]) => {
                        doc.font("Helvetica").fontSize(7.5);
                        const hE = doc.heightOfString(etiqueta, { width: anchoCol });
                        doc.font("Helvetica").fontSize(9.5);
                        const hV = doc.heightOfString(texto(valor), { width: anchoCol });
                        return hE + hV + 2;
                    }),
                );

                asegurarEspacio(alto + 6);
                const y = doc.y;

                fila.forEach(([etiqueta, valor], j) => {
                    const x = izquierda + j * (anchoCol + gap);

                    doc.fillColor(COLOR.suave).font("Helvetica").fontSize(7.5)
                        .text(etiqueta.toUpperCase(), x, y, { width: anchoCol });

                    doc.fillColor(COLOR.texto).font("Helvetica").fontSize(9.5)
                        .text(texto(valor), x, doc.y + 1, { width: anchoCol });
                });

                doc.y = y + alto + 6;
                doc.x = izquierda;
            }
        }

        /** Tabla con encabezado repetido en cada página. anchos = proporciones. */
        function tabla(
            encabezados: string[],
            filas: Valor[][],
            anchos: number[],
        ) {
            const total = anchos.reduce((a, b) => a + b, 0);
            const cols = anchos.map((a) => (a / total) * ancho);
            const pad = 4;

            const altoFila = (fila: Valor[]) => {
                doc.font("Helvetica").fontSize(8.5);

                return Math.max(
                    ...fila.map((v, i) => doc.heightOfString(texto(v), { width: (cols[i] ?? 0) - pad * 2 })),
                ) + pad * 2;
            };

            const dibujarEncabezado = (altoSiguiente: number) => {
                doc.font("Helvetica-Bold").fontSize(8);
                const alto = Math.max(
                    ...encabezados.map((h, i) => doc.heightOfString(h, { width: (cols[i] ?? 0) - pad * 2 })),
                ) + pad * 2;

                asegurarEspacio(alto + altoSiguiente);
                const y = doc.y;

                doc.rect(izquierda, y, ancho, alto).fill(COLOR.primarioSuave);

                let x = izquierda;
                encabezados.forEach((h, i) => {
                    doc.fillColor(COLOR.primario).font("Helvetica-Bold").fontSize(8)
                        .text(h, x + pad, y + pad, { width: (cols[i] ?? 0) - pad * 2 });
                    x += cols[i] ?? 0;
                });

                doc.y = y + alto;
            };

            dibujarEncabezado(filas[0] ? altoFila(filas[0]) : 20);

            filas.forEach((fila, n) => {
                const alto = altoFila(fila);

                if (doc.y + alto > limiteInferior()) {
                    doc.addPage();
                    dibujarEncabezado(alto);
                }
                const y = doc.y;

                if (n % 2 === 1) {
                    doc.rect(izquierda, y, ancho, alto).fill(COLOR.filaPar);
                }

                let x = izquierda;
                fila.forEach((v, i) => {
                    doc.fillColor(COLOR.texto).font("Helvetica").fontSize(8.5)
                        .text(texto(v), x + pad, y + pad, { width: (cols[i] ?? 0) - pad * 2 });
                    x += cols[i] ?? 0;
                });

                doc.moveTo(izquierda, y + alto).lineTo(izquierda + ancho, y + alto)
                    .lineWidth(0.5).strokeColor(COLOR.borde).stroke();

                doc.y = y + alto;
            });

            doc.x = izquierda;
            doc.moveDown(0.6);
        }

        /* ================================================================
           PORTADA + RESUMEN DE COMPLETITUD
        ================================================================ */

        const logo = logoRids();

        /* Con logo, el texto de la portada deja libre la esquina derecha */
        const anchoTitulo = logo ? ancho - 150 : ancho;

        if (logo) {
            doc.image(logo, izquierda + ancho - 130, doc.page.margins.top - 8, {
                fit: [130, 50],
                align: "right",
            });
        }

        doc.fillColor(COLOR.primario).font("Helvetica-Bold").fontSize(9)
            .text("ASESORÍAS RIDS · FICHA DE EMPRESA", izquierda, doc.y, { width: anchoTitulo });

        doc.moveDown(0.3);
        doc.fillColor(COLOR.texto).font("Helvetica-Bold").fontSize(22)
            .text(e.nombre, { width: anchoTitulo });

        if (e.razonSocial) {
            doc.fillColor(COLOR.suave).font("Helvetica").fontSize(11)
                .text(e.razonSocial, { width: anchoTitulo });
        }

        doc.moveDown(0.3);
        doc.fillColor(COLOR.suave).font("Helvetica").fontSize(9)
            .text(
                [
                    `Generado el ${fechaChile(new Date(), true)}`,
                    opciones.generadoPor ? `por ${opciones.generadoPor}` : null,
                    e.isActive ? null : "· EMPRESA INACTIVA",
                ].filter(Boolean).join(" "),
                { width: ancho },
            );

        if (completitud) {
            doc.moveDown(0.8);

            const y = doc.y;
            const color =
                completitud.porcentaje >= 80 ? COLOR.verde
                    : completitud.porcentaje >= 50 ? COLOR.ambar
                        : COLOR.rojo;

            doc.roundedRect(izquierda, y, ancho, 58, 6).lineWidth(1).strokeColor(COLOR.borde).stroke();

            doc.fillColor(color).font("Helvetica-Bold").fontSize(28)
                .text(`${completitud.porcentaje}%`, izquierda + 14, y + 12, { width: 110 });

            doc.fillColor(COLOR.texto).font("Helvetica-Bold").fontSize(11)
                .text(
                    completitud.estado === "COMPLETA" ? "Ficha completa" : "Ficha incompleta",
                    izquierda + 130, y + 13, { width: ancho - 145 },
                );

            doc.fillColor(COLOR.suave).font("Helvetica").fontSize(9)
                .text(
                    `${completitud.seccionesCompletas} de ${completitud.totalSecciones} secciones obligatorias completas · ${completitud.totalFaltantes} dato(s) faltante(s)`,
                    izquierda + 130, doc.y + 2, { width: ancho - 145 },
                );

            doc.y = y + 70;
            doc.x = izquierda;

            tabla(
                ["Sección", "Estado", "%", "Lo que falta"],
                completitud.secciones
                    .filter((s) => opciones.incluirRelacionComercial || s.key !== "relacion-comercial")
                    .map((s) => {
                        const faltan = s.faltantes.slice(0, 8)
                            .map((f) => (f.registro ? `${f.label} (${f.registro})` : f.label));
                        const resto = s.faltantes.length - faltan.length;

                        return [
                            `${s.label}${s.obligatoria ? "" : " (opcional)"}`,
                            ESTADO_SECCION[s.estado].texto,
                            s.estado === "NO_APLICA" ? "—" : `${s.porcentaje}%`,
                            s.estado === "COMPLETA" || s.estado === "NO_APLICA"
                                ? "—"
                                : faltan.join(", ") + (resto > 0 ? ` y ${resto} más` : ""),
                        ];
                    }),
                [22, 13, 7, 58],
            );
        }

        /* ================================================================
           1. CLIENTE
        ================================================================ */

        tituloSeccion("Cliente");

        const d = e.detalleEmpresa;

        grilla([
            ["Nombre", e.nombre],
            ["Razón social", e.razonSocial],
            ["RUT", d?.rut],
            ["Dominios", e.dominios.join(", ")],
            ["Dirección", d?.direccion],
            ["Teléfono", d?.telefono],
            ["Email", d?.email],
            ["Días de crédito", d?.diasCredito],
            ["Estado", e.isActive ? "Activa" : "Inactiva"],
            ["Ficha creada", e.fichaEmpresa?.creadaEn],
        ]);

        const direcciones = Array.isArray(d?.direcciones)
            ? (d?.direcciones as Array<{ tipo?: string; direccion?: string }>)
            : [];

        if (direcciones.length > 0) {
            subtitulo("Otras direcciones");
            tabla(
                ["Tipo", "Dirección"],
                direcciones.map((x) => [x?.tipo, x?.direccion]),
                [25, 75],
            );
        }

        subtitulo("Condiciones comerciales");
        if (e.fichaEmpresa?.condicionesComerciales) {
            doc.fillColor(COLOR.texto).font("Helvetica").fontSize(9.5)
                .text(e.fichaEmpresa.condicionesComerciales, izquierda, doc.y, { width: ancho });
            doc.moveDown(0.5);
        } else {
            vacio("Sin condiciones comerciales registradas.");
        }

        subtitulo(`Contactos (${e.contactoEmpresas.length})`);
        if (e.contactoEmpresas.length > 0) {
            tabla(
                ["Nombre", "Cargo", "Email", "Teléfono", "Sucursal", "Notas"],
                e.contactoEmpresas.map((c) => [
                    c.nombre,
                    c.cargo,
                    c.email,
                    c.telefono,
                    c.sucursal?.nombre ?? "General",
                    [
                        c.principal ? "Principal" : null,
                        c.recibeFacturas ? "Recibe facturas" : null,
                        c.recibeCobranza ? "Recibe cobranza" : null,
                    ].filter(Boolean).join(", ") || null,
                ]),
                [18, 14, 22, 13, 13, 20],
            );
        } else {
            vacio("Sin contactos registrados.");
        }

        /* ================================================================
           2. RELACIÓN COMERCIAL (solo internos)
        ================================================================ */

        if (opciones.incluirRelacionComercial) {
            tituloSeccion("Relación comercial");

            if (e.entidadGestioos.length > 0) {
                tabla(
                    ["Entidad", "RUT", "Tipo", "Origen", "Correo", "Teléfono"],
                    e.entidadGestioos.map((x) => [x.nombre, x.rut, x.tipo, x.origen, x.correo, x.telefono]),
                    [24, 14, 11, 11, 24, 16],
                );
            } else {
                vacio("Sin entidad comercial relacionada.");
            }
        }

        /* ================================================================
           3. SUSCRIPCIONES Y CONTRATOS
        ================================================================ */

        tituloSeccion(`Suscripciones y contratos (${e.suscripcionesContratos.length})`);

        if (e.suscripcionesContratos.length > 0) {
            tabla(
                ["Proveedor / fabricante", "Producto / plan", "Licencias", "Costo mensual", "Inicio", "Término", "Renovación", "Estado"],
                e.suscripcionesContratos.map((s) => [
                    `${s.proveedor} / ${s.fabricante}`,
                    s.productoPlan + (s.numeroContrato ? ` · N° ${s.numeroContrato}` : ""),
                    s.cantidadLicencias,
                    monto(s.costoMensual, s.moneda),
                    s.fechaInicio,
                    s.fechaTermino,
                    s.fechaRenovacion,
                    s.activo ? "Activa" : "Inactiva",
                ]),
                [15, 18, 9, 11, 12, 12, 13, 10],
            );

            const conContactos = e.suscripcionesContratos.filter(
                (s) =>
                    s.ejecutivosComerciales.length > 0 ||
                    s.contactosSoporte.length > 0 ||
                    s.ejecutivoNombre ||
                    s.soporteTelefono ||
                    s.soporteEmail,
            );

            if (conContactos.length > 0) {
                subtitulo("Contactos de proveedores");
                tabla(
                    ["Suscripción", "Ejecutivo comercial", "Soporte"],
                    conContactos.map((s) => {
                        const ejecutivo = s.ejecutivosComerciales[0];
                        const soporte = s.contactosSoporte[0];

                        return [
                            s.productoPlan,
                            [
                                ejecutivo?.nombre ?? s.ejecutivoNombre,
                                ejecutivo?.email ?? s.ejecutivoEmail,
                                ejecutivo?.telefono ?? s.ejecutivoTelefono,
                            ].filter(Boolean).join(" · ") || null,
                            [
                                soporte?.nombre,
                                soporte?.email ?? s.soporteEmail,
                                soporte?.telefono ?? s.soporteTelefono,
                            ].filter(Boolean).join(" · ") || null,
                        ];
                    }),
                    [26, 37, 37],
                );
            }
        } else {
            vacio("Sin suscripciones ni contratos registrados.");
        }

        /* ================================================================
           4. CHECKLIST
        ================================================================ */

        tituloSeccion("Checklist de gestión");

        const checklist = e.fichaEmpresa?.checklist ?? null;

        if (checklist) {
            grilla(
                (Object.entries(CHECKLIST_LABELS) as Array<[keyof typeof CHECKLIST_LABELS, string]>)
                    .map(([key, label]) => [label, checklist[key] ? "Sí" : "No"]),
                3,
            );
        } else {
            vacio("Checklist sin completar.");
        }

        /* ================================================================
           5. FICHA TÉCNICA
        ================================================================ */

        tituloSeccion("Ficha técnica");

        const ft = e.fichaTecnicaEmpresa as Record<string, unknown> | null;

        if (ft) {
            const labels: Record<string, string> = { ...FICHA_TECNICA_LABELS, ...FICHA_TECNICA_EXTRA };

            for (const grupo of GRUPOS_FICHA_TECNICA) {
                subtitulo(grupo.titulo);
                grilla(grupo.campos.map((c) => [labels[c] ?? c, ft[c] as Valor]));
            }
        } else {
            vacio("Ficha técnica sin completar.");
        }

        /* ================================================================
           6. REDES / ISP
        ================================================================ */

        tituloSeccion(`Redes / ISP (${e.empresaISP.length})`);

        if (e.empresaISP.length > 0) {
            for (const isp of e.empresaISP) {
                subtitulo(`${isp.operador || `ISP #${isp.id}`}${isp.esPrincipal ? " · Principal" : ""}`);
                grilla([
                    ["Servicio", isp.servicio],
                    ["Código de servicio", isp.codigoServicio],
                    ["RUT", isp.rut],
                    ["Sucursal", isp.sucursal?.nombre ?? "Empresa (general)"],
                    ["Teléfono ISP", isp.telefono],
                    ["Teléfono soporte", isp.telefonoSoporte],
                    ["Dirección", isp.direccion],
                    ["IP públicas", isp.ipRed.join(", ")],
                    ["WiFi", isp.wifiNombre],
                    ["Clave WiFi", secreto(isp.wifiClaveRef)],
                    ["N° de ticket", isp.numeroTicket],
                ]);
            }
        } else {
            vacio("Sin redes / ISP registrados.");
        }

        /* ================================================================
           7. SUCURSALES
        ================================================================ */

        tituloSeccion(`Sucursales (${e.sucursales.length})`);

        if (e.sucursales.length > 0) {
            for (const s of e.sucursales) {
                subtitulo(s.nombre);
                grilla([
                    ["Dirección", s.direccion],
                    ["Teléfono", s.telefono],
                ]);

                if (s.responsableSucursals.length > 0) {
                    tabla(
                        ["Responsable", "Cargo", "Email", "Teléfono"],
                        s.responsableSucursals.map((r) => [r.nombre, r.cargo, r.email, r.telefono]),
                        [28, 22, 30, 20],
                    );
                }

                if (s.redSucursales.length > 0) {
                    tabla(
                        ["WiFi", "Clave WiFi", "IP / red", "Gateway", "Observaciones"],
                        s.redSucursales.map((r) => [
                            r.wifiNombre,
                            secreto(r.claveWifi),
                            r.ipRed,
                            r.gateway,
                            r.observaciones,
                        ]),
                        [20, 18, 18, 16, 28],
                    );
                }

                if (s.accesoRouterSucursals.length > 0) {
                    tabla(
                        ["Acceso router (URL)", "Usuario", "Clave", "Notas"],
                        s.accesoRouterSucursals.map((a) => [a.url, a.usuario, secreto(a.secretoRef), a.notas]),
                        [32, 18, 18, 32],
                    );
                }
            }
        } else {
            vacio("Sin sucursales registradas.");
        }

        /* ================================================================
           8. SERVIDORES
        ================================================================ */

        const servidoresAplica = e.fichaEmpresa?.servidoresAplica ?? true;

        tituloSeccion(
            `Servidores (${e.servidors.length})`,
            servidoresAplica ? undefined : "Marcado como «no aplica» para esta empresa.",
        );

        if (e.servidors.length > 0) {
            for (const srv of e.servidors) {
                subtitulo(`${srv.nombre}${srv.probado ? " · Acceso probado" : " · Acceso sin probar"}`);
                grilla([
                    ["IP externa", srv.ipExterna],
                    ["Usuario", srv.nombreUsuario],
                    ["Contraseña", secreto(srv.contrasena)],
                    ["Usuarios registrados", srv.servidorUsuarios.length],
                ]);

                if (srv.servidorUsuarios.length > 0) {
                    tabla(
                        ["Nombre", "Usuario", "Contraseña", "Tipo", "Acceso", "Equipo", "Estado"],
                        srv.servidorUsuarios.map((u) => [
                            u.solicitante?.nombre ?? u.nombreUsuario,
                            u.usuario,
                            secreto(u.contrasena),
                            u.tipo,
                            u.acceso,
                            u.equipo,
                            u.estado,
                        ]),
                        [19, 15, 15, 11, 13, 14, 13],
                    );
                }
            }
        } else {
            vacio("Sin servidores registrados.");
        }

        /* ================================================================
           9. TELEFONÍA
        ================================================================ */

        const telefoniaAplica = e.fichaEmpresa?.telefoniaAplica ?? false;

        tituloSeccion(
            "Telefonía",
            telefoniaAplica ? undefined : "Marcado como «no aplica» para esta empresa.",
        );

        if (
            e.telefoniaParlantes.length === 0 &&
            e.telefoniaUsuarios.length === 0
        ) {
            /* Sin nada que mostrar: una línea, no dos subtítulos vacíos */
            vacio("Sin parlantes ni usuarios de telefonía registrados.");
        } else {

            subtitulo(`Parlantes / altavoces (${e.telefoniaParlantes.length})`);
            if (e.telefoniaParlantes.length > 0) {
                tabla(
                    ["Ubicación", "Marca / modelo", "Anexo", "MAC", "Contraseña admin", "Observaciones"],
                    e.telefoniaParlantes.map((p) => [
                        p.ubicacion,
                        p.marcaModelo,
                        p.anexo,
                        p.macAddress,
                        secreto(p.contrasenaAdmin),
                        p.observaciones,
                    ]),
                    [19, 19, 8, 19, 15, 20],
                );
            } else {
                vacio("Sin parlantes registrados.");
            }

            subtitulo(`Usuarios app de telefonía (${e.telefoniaUsuarios.length})`);
            if (e.telefoniaUsuarios.length > 0) {
                const ipPuerto = (ip: string | null, puerto: number | null) =>
                    ip ? `${ip}${puerto ? `:${puerto}` : ""}` : null;

                tabla(
                    ["Nombre", "Anexo / usuario", "Contraseña", "IP privada : puerto", "IP pública : puerto"],
                    e.telefoniaUsuarios.map((u) => [
                        u.nombre,
                        u.anexo,
                        secreto(u.contrasena),
                        ipPuerto(u.ipPrivada, u.puertoPrivado),
                        ipPuerto(u.ipPublica, u.puertoPublico),
                    ]),
                    [24, 14, 20, 21, 21],
                );
            } else {
                vacio("Sin usuarios registrados.");
            }

        }

        /* ================================================================
           PIE DE PÁGINA (todas las páginas)
        ================================================================ */

        const rango = doc.bufferedPageRange();
        const avisoConfidencial = opciones.incluirSecretos
            ? "Documento generado desde el CRM de Asesorías RIDS. Contiene información interna."
            : "Documento generado desde el CRM de Asesorías RIDS.";

        for (let i = rango.start; i < rango.start + rango.count; i++) {
            doc.switchToPage(i);

            const margenInferior = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;

            const y = doc.page.height - 35;

            doc.moveTo(izquierda, y - 6).lineTo(izquierda + ancho, y - 6)
                .lineWidth(0.5).strokeColor(COLOR.borde).stroke();

            /* En la portada el logo ya va arriba */
            const logoPie = i > rango.start ? logoRids() : null;

            if (logoPie) {
                doc.image(logoPie, izquierda + ancho - 45, y - 3, {
                    fit: [45, 14],
                    align: "right",
                    valign: "center",
                });
            }

            doc.fillColor(opciones.incluirSecretos ? COLOR.rojo : COLOR.suave)
                .font(opciones.incluirSecretos ? "Helvetica-Bold" : "Helvetica").fontSize(7.5)
                .text(`${e.nombre} · ${avisoConfidencial}`, izquierda, y, {
                    width: ancho - 140,
                    lineBreak: false,
                });

            doc.fillColor(COLOR.suave).font("Helvetica").fontSize(7.5)
                .text(`Página ${i - rango.start + 1} de ${rango.count}`, izquierda + ancho - (logoPie ? 135 : 80), y, {
                    width: 80,
                    align: "right",
                    lineBreak: false,
                });

            doc.page.margins.bottom = margenInferior;
        }

        doc.end();
    });
}