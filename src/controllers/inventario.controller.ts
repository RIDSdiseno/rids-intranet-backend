// src/controllers/inventario.controller.ts
import type { Request, Response } from "express";
import XLSX from "xlsx-js-style";
import { getInventarioByEmpresa } from "../service/inventario.service.js";

import { EstadoEquipo } from "@prisma/client";

import { prisma } from "../lib/prisma.js";

/* ======================================================
   Estilos por empresa (Excel)
====================================================== */
function getEmpresaStyle(nombre: string) {
    const n = nombre.toLowerCase();
    if (n.includes("alianz")) return { header: "FF2563EB", body: "FFDBEAFE" };
    if (n.includes("infinet")) return { header: "FF1E40AF", body: "FFE0E7FF" };
    if (n.includes("rids")) return { header: "FF059669", body: "FFD1FAE5" };
    return { header: "FF334155", body: "FFF1F5F9" };
}

/* ======================================================
  Estilos de hoja Excel
====================================================== */
function styleSheet(
    ws: XLSX.WorkSheet,
    rows: number,
    cols: number,
    colors: {
        header: string;
        body: string;
    }
) {
    /* ====================================================
       HEADER
    ==================================================== */

    for (
        let c = 0;
        c < cols;
        c++
    ) {
        const cell =
            ws[
            XLSX.utils.encode_cell({
                r: 0,
                c,
            })
            ];

        if (!cell) {
            continue;
        }

        cell.s = {
            fill: {
                fgColor: {
                    rgb:
                        colors.header,
                },
            },

            font: {
                bold: true,

                color: {
                    rgb:
                        "FFFFFFFF",
                },
            },

            alignment: {
                horizontal:
                    "center",

                vertical:
                    "center",

                wrapText:
                    true,
            },
        };
    }

    /* ====================================================
       BODY
    ==================================================== */

    for (
        let r = 1;
        r <= rows;
        r++
    ) {
        for (
            let c = 0;
            c < cols;
            c++
        ) {
            const cell =
                ws[
                XLSX.utils.encode_cell({
                    r,
                    c,
                })
                ];

            if (!cell) {
                continue;
            }

            cell.s = {
                fill: {
                    fgColor: {
                        rgb:
                            colors.body,
                    },
                },

                alignment: {
                    vertical:
                        "top",

                    wrapText:
                        true,
                },
            };
        }
    }

    /* ====================================================
       AUTOFILTRO
    ==================================================== */

    ws["!autofilter"] = {
        ref:
            XLSX.utils.encode_range({
                s: {
                    r: 0,
                    c: 0,
                },

                e: {
                    r: rows,
                    c:
                        cols - 1,
                },
            }),
    };

    /* ====================================================
       ANCHO BASE DE COLUMNAS
    ==================================================== */

    ws["!cols"] =
        Array.from({
            length:
                cols,
        }).map(
            () => ({
                wch: 18,
            })
        );
}

// ======================================================
/*  Normalización de nombres de empresa
====================================================== */
function normalizeEmpresa(nombre: string): string {
    return nombre
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
}

/* ======================================================
    Resolución de rutas SharePoint (CLAVE)
====================================================== */
function resolveSharepointPath(empresa: string): string | null {
    const key = normalizeEmpresa(empresa);

    const map: Record<string, string> = {
        // CLIENTES DIRECTOS
        "ALIANZ":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/ALIANZ/Inventario",

        "ASUR":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/ASUR/Inventario",

        "BERCIA":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/BERCIA/Inventario",

        "BDK":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/BDK/Inventario",

        "RWAY":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/RWAY/Inventario",

        "CINTAX":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/CINTAX/Inventario",

        "GRUPO COLCHAGUA":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO COLCHAGUA/Inventario",

        "FIJACIONES PROCRET":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/PROCRET/Inventario",

        // GRUPO T-SALES
        "T-SALES":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO T-SALES/T-SALES/Inventario",

        "INFINET":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO T-SALES/INFINET/Inventario",

        "VPRIME":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO T-SALES/VPRIME/Inventario",

        // GRUPO JPL
        "JPL":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO JPL/JPL/Inventario",

        // GRUPO PINI
        "PINI":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/GRUPO PINI/PINI Y CIA/Inventario",

        // CLÍNICA NACE
        "CLN ALAMEDA":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/CLINICA NACE/1-NACE/1-ALAMEDA/Inventario",

        "CLN PROVIDENCIA":
            "/Documentos compartidos/General/CLIENTES/2026/CLIENTES SOPORTE MENSUAL/CLINICA NACE/1-NACE/2-PROVIDENCIA/Inventario",
    };

    return map[key] ?? null;
}

function formatTipoEquipo(tipo?: string | null): string {
    if (!tipo) return "";

    const map: Record<string, string> = {
        GENERICO: "Genérico",
        NOTEBOOK: "Notebook",
        ALL_IN_ONE: "All in One",
        DESKTOP: "Desktop",
        CPU: "CPU",
        EQUIPO_ARMADO: "Equipo armado",
        IMPRESORA: "Impresora",
        SCANNER: "Scanner",
        LASER: "Láser",
        LED: "LED",
        MONITOR: "Monitor",
        NAS: "NAS",
        ROUTER: "Router",
        DISCO_DURO_EXTERNO: "Disco duro externo",
        CARGADOR: "Cargador",
        INSUMOS_COMPUTACIONALES: "Insumos computacionales",
        RELOJ_CONTROL: "Reloj control",
        OTRO: "Otro",
    };

    return map[tipo] ?? tipo;
}

function formatEstadoEquipo(estado?: string | null): string {
    if (!estado) return "";

    const map: Record<string, string> = {
        ACTIVO: "Activo",
        EN_STOCK: "En stock",
        DADO_DE_BAJA: "Dado de baja",
        EN_RIDS: "En RIDS",
    };

    return map[estado] ?? estado;
}

/* ======================================================
   Formato adicionales para Excel
====================================================== */

function formatTipoAdicional(
    tipo?: string | null
): string {
    if (!tipo) {
        return "";
    }

    const map: Record<string, string> = {
        MONITOR: "Monitor",
        IMPRESORA: "Impresora",
        TECLADO: "Teclado",
        MOUSE: "Mouse",
        DOCK: "Dock",
        CARGADOR: "Cargador",
        OTRO: "Otro",
    };

    return (
        map[tipo] ??
        tipo
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(
                /\b\w/g,
                (char) =>
                    char.toUpperCase()
            )
    );
}

function formatEstadoAdicional(
    estado?: string | null
): string {
    if (!estado) {
        return "";
    }

    const map: Record<string, string> = {
        ASIGNADO:
            "Asignado",

        EN_STOCK:
            "En stock",

        EN_REPARACION:
            "En reparación",

        DADO_DE_BAJA:
            "Dado de baja",
    };

    return (
        map[estado] ??
        estado
    );
}

function formatOrigenAdicional(
    origen?: string | null
): string {
    if (
        origen === "AGENTE"
    ) {
        return "Agente";
    }

    if (
        origen === "MANUAL"
    ) {
        return "Manual";
    }

    return origen ?? "";
}

function limpiarDescripcionAdicionalExcel(
    descripcion?: string | null
): string {
    return String(
        descripcion ?? ""
    )
        .replace(
            /^\[AGENTE\]\s*/i,
            ""
        )
        .replace(
            /^Nombre:\s*/i,
            ""
        )
        .replace(
            /\s*\|\s*Serial:\s*[^|]+/i,
            ""
        )
        .trim();
}

function formatAdicionalesExcel(
    adicionales:
        Array<{
            id?: number;
            tipo?: string | null;
            descripcion?: string | null;
            cantidad?: number | null;
            serialAdicional?: string | null;
            origen?: string | null;
            estado?: string | null;
        }> | null | undefined
): string {
    if (
        !adicionales ||
        adicionales.length === 0
    ) {
        return "";
    }

    return adicionales
        .map(
            (
                adicional
            ) => {
                const tipo =
                    formatTipoAdicional(
                        adicional.tipo
                    );

                const descripcion =
                    limpiarDescripcionAdicionalExcel(
                        adicional.descripcion
                    );

                const cantidad =
                    Number(
                        adicional.cantidad ??
                        1
                    );

                const partes: string[] = [];

                if (tipo) {
                    partes.push(
                        tipo
                    );
                }

                if (descripcion) {
                    partes.push(
                        descripcion
                    );
                }

                if (
                    cantidad > 1
                ) {
                    partes.push(
                        `Cantidad: ${cantidad}`
                    );
                }

                return partes.join(
                    " - "
                );
            }
        )
        .filter(Boolean)
        .join("\n");
}

function formatSerialesAdicionalesExcel(
    adicionales:
        Array<{
            tipo?: string | null;
            serialAdicional?: string | null;
        }> | null | undefined
): string {
    if (
        !adicionales ||
        adicionales.length === 0
    ) {
        return "";
    }

    return adicionales
        .map((adicional) => {
            const serial =
                String(
                    adicional.serialAdicional ??
                    ""
                ).trim();

            const serialNormalizado =
                serial.toLowerCase();

            if (
                !serial ||
                serial === "0" ||
                serial === "1" ||
                serialNormalizado === "null" ||
                serialNormalizado === "undefined" ||
                serialNormalizado === "n/a" ||
                serialNormalizado === "na"
            ) {
                return "";
            }

            return serial;
        })
        .filter(Boolean)
        .join("\n");
}

function formatOrigenesAdicionalesExcel(
    adicionales:
        Array<{
            tipo?: string | null;
            origen?: string | null;
        }> | null | undefined
): string {
    if (
        !adicionales ||
        adicionales.length === 0
    ) {
        return "";
    }

    return adicionales
        .map((adicional) =>
            formatOrigenAdicional(
                adicional.origen
            )
        )
        .filter(Boolean)
        .join("\n");
}

function formatEstadosAdicionalesExcel(
    adicionales:
        Array<{
            tipo?: string | null;
            estado?: string | null;
        }> | null | undefined
): string {
    if (
        !adicionales ||
        adicionales.length === 0
    ) {
        return "";
    }

    return adicionales
        .map((adicional) =>
            formatEstadoAdicional(
                adicional.estado
            )
        )
        .filter(Boolean)
        .join("\n");
}

function formatFechaChile(value?: Date | string | null): string {
    if (!value) return "";

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });

    const parts = formatter.formatToParts(date);

    const day = parts.find((p) => p.type === "day")?.value ?? "";
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const year = parts.find((p) => p.type === "year")?.value ?? "";

    if (!day || !month || !year) return "";

    return `${day}/${month}/${year}`;
}

function formatRevisado(value?: string | null): string {
    if (!value) return "";

    const raw = String(value).trim();

    // Si viene como fecha ISO o fecha parseable, la formatea.
    const parsed = new Date(raw);

    if (!Number.isNaN(parsed.getTime())) {
        return formatFechaChile(parsed);
    }

    // Si viene como texto tipo "SI", "NO", "Revisado", etc., lo deja igual.
    return raw;
}

function parseDateQuery(value: unknown): Date | undefined {
    if (typeof value !== "string") return undefined;
    if (!value.trim()) return undefined;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return undefined;
    }

    return date;
}

function parsePositiveIntQuery(
    value: unknown
): number | undefined {
    if (
        typeof value !== "string" ||
        !value.trim()
    ) {
        return undefined;
    }

    const parsed =
        Number(value);

    if (
        !Number.isInteger(parsed) ||
        parsed <= 0
    ) {
        return undefined;
    }

    return parsed;
}

function parseAuditActionQuery(
    value: unknown
): "CREATE" | "UPDATE" | undefined {
    if (
        value === "CREATE" ||
        value === "UPDATE"
    ) {
        return value;
    }

    return undefined;
}

/* ======================================================
    Construcción del Excel
====================================================== */
type InventarioEquipos = Awaited<ReturnType<typeof getInventarioByEmpresa>>;

async function obtenerUltimoEditorPorEquipo(
    equipos: InventarioEquipos
): Promise<Map<number, string>> {
    const equipoIds =
        equipos
            .map(
                (equipo) =>
                    equipo.id_equipo
            )
            .filter(
                (id): id is number =>
                    Number.isInteger(id) &&
                    id > 0
            );

    if (equipoIds.length === 0) {
        return new Map();
    }

    const detalleIdToEquipoId =
        new Map<number, number>();

    for (const equipo of equipos) {
        const detalleId =
            Number(equipo.detalle?.id);

        if (Number.isInteger(detalleId)) {
            detalleIdToEquipoId.set(
                detalleId,
                equipo.id_equipo
            );
        }
    }

    const detalleIds =
        Array.from(
            detalleIdToEquipoId.keys()
        );

    const [logs, eventosAgente] =
        await Promise.all([
            prisma.auditLog.findMany({
                where: {
                    action: "UPDATE",

                    OR: [
                        {
                            entity: "Equipo",
                            entityId: {
                                in:
                                    equipoIds.map(String),
                            },
                        },

                        ...(detalleIds.length > 0
                            ? [
                                {
                                    entity:
                                        "DetalleEquipo",

                                    entityId: {
                                        in:
                                            detalleIds.map(
                                                String
                                            ),
                                    },
                                },
                            ]
                            : []),
                    ],
                },

                include: {
                    actor: {
                        select: {
                            nombre: true,
                            email: true,
                        },
                    },
                },

                orderBy: {
                    createdAt: "desc",
                },
            }),

            prisma.equipoAgenteEvento.findMany({
                where: {
                    equipoId: {
                        in: equipoIds,
                    },

                    tipo: {
                        in: [
                            "INVENTORY_CREATED",
                            "INVENTORY_SYNC",
                            "REVISION_SOLICITANTE",
                        ],
                    },
                },

                select: {
                    equipoId: true,
                    metadata: true,
                    createdAt: true,
                },

                orderBy: {
                    createdAt: "desc",
                },
            }),
        ]);

    const ultimaActividad =
        new Map<
            number,
            {
                nombre: string;
                fecha: Date;
            }
        >();

    for (const log of logs) {
        let equipoId:
            number | null = null;

        if (
            log.entity ===
            "Equipo"
        ) {
            const parsedId =
                Number(log.entityId);

            equipoId =
                Number.isInteger(parsedId)
                    ? parsedId
                    : null;
        }

        if (
            log.entity ===
            "DetalleEquipo"
        ) {
            const detalleId =
                Number(log.entityId);

            equipoId =
                detalleIdToEquipoId.get(
                    detalleId
                ) ?? null;
        }

        if (!equipoId) {
            continue;
        }

        const nombre =
            log.actor?.nombre ||
            log.actor?.email ||
            "Sistema";

        const actual =
            ultimaActividad.get(
                equipoId
            );

        if (
            !actual ||
            log.createdAt >
            actual.fecha
        ) {
            ultimaActividad.set(
                equipoId,
                {
                    nombre,
                    fecha:
                        log.createdAt,
                }
            );
        }
    }

    for (
        const evento
        of eventosAgente
    ) {
        const metadata =
            evento.metadata as
            | {
                tecnicoInstaladorNombre?: unknown;
                tecnicoInstaladorEmail?: unknown;
            }
            | null;

        const tecnicoNombre =
            typeof metadata?.tecnicoInstaladorNombre ===
                "string"
                ? metadata.tecnicoInstaladorNombre.trim()
                : "";

        const tecnicoEmail =
            typeof metadata?.tecnicoInstaladorEmail ===
                "string"
                ? metadata.tecnicoInstaladorEmail.trim()
                : "";

        const nombre =
            tecnicoNombre ||
            tecnicoEmail ||
            "Sistema";

        const actual =
            ultimaActividad.get(
                evento.equipoId
            );

        if (
            !actual ||
            evento.createdAt >
            actual.fecha
        ) {
            ultimaActividad.set(
                evento.equipoId,
                {
                    nombre,
                    fecha:
                        evento.createdAt,
                }
            );
        }
    }

    return new Map(
        Array.from(
            ultimaActividad.entries()
        ).map(
            ([
                equipoId,
                actividad,
            ]) => [
                    equipoId,
                    actividad.nombre,
                ]
        )
    );
}

function buildInventarioExcel(
    equipos: Awaited<ReturnType<typeof getInventarioByEmpresa>>,
    mes: string,
    ultimoEditorPorEquipo = new Map<number, string>()
): Buffer {
    const porEmpresa: Record<string, typeof equipos> = {};

    for (const e of equipos) {
        const empresa = normalizeEmpresa(
            e.solicitante?.empresa?.nombre ?? e.empresa?.nombre ?? "SIN_EMPRESA"
        );
        porEmpresa[empresa] ??= [];
        porEmpresa[empresa].push(e);
    }

    const wb = XLSX.utils.book_new();

    const empresasOrdenadas =
        Object.entries(porEmpresa).sort(
            ([empresaA], [empresaB]) =>
                empresaA.localeCompare(
                    empresaB,
                    "es",
                    {
                        sensitivity: "base",
                    }
                )
        );

    for (
        const [empresa, items]
        of empresasOrdenadas
    ) {
        if (items.length === 0) {
            continue;
        }

        /*
         * Mismo criterio visual utilizado por EquiposPage:
         *
         * 1. Empresa
         * 2. Solicitante
         * 3. ID del equipo
         *
         * Como cada hoja ya corresponde a una empresa,
         * aquí ordenamos solicitante -> ID.
         */
        const itemsOrdenados =
            [...items].sort(
                (a, b) => {
                    const solicitanteA =
                        (
                            a.solicitante?.nombre ??
                            ""
                        )
                            .trim()
                            .toLowerCase();

                    const solicitanteB =
                        (
                            b.solicitante?.nombre ??
                            ""
                        )
                            .trim()
                            .toLowerCase();

                    const comparacionSolicitante =
                        solicitanteA.localeCompare(
                            solicitanteB,
                            "es",
                            {
                                sensitivity:
                                    "base",
                                numeric: true,
                            }
                        );

                    if (
                        comparacionSolicitante !==
                        0
                    ) {
                        return comparacionSolicitante;
                    }

                    return (
                        a.id_equipo -
                        b.id_equipo
                    );
                }
            );

        const rows =
            itemsOrdenados.map(
                (e, i) => ({
                    "Código":
                        i + 1,

                    "USUARIO":
                        e.solicitante?.nombre ??
                        "",

                    "CORREO":
                        e.solicitante?.email ??
                        "",

                    "ESTADO EQUIPO":
                        formatEstadoEquipo(
                            e.estado
                        ),

                    "SERIAL":
                        e.serial ?? "",

                    "MARCA":
                        e.marca ?? "",

                    "MODELO":
                        e.modelo ?? "",

                    "CPU":
                        e.procesador ?? "",

                    "RAM":
                        e.ram ?? "",

                    "DISCO":
                        e.disco ?? "",

                    "SISTEMA OPERATIVO":
                        e.detalle?.so ??
                        "",

                    "TEAMVIEWER":
                        e.detalle?.teamViewer ??
                        "",

                    /*
                     * ==========================================
                     * ADICIONALES
                     * ==========================================
                     */
                    "ADICIONALES":
                        formatAdicionalesExcel(
                            e.adicionales
                        ),

                    "SERIALES ADICIONALES":
                        formatSerialesAdicionalesExcel(
                            e.adicionales
                        ),

                    "ORIGEN ADICIONALES":
                        formatOrigenesAdicionalesExcel(
                            e.adicionales
                        ),

                    "ESTADO ADICIONALES":
                        formatEstadosAdicionalesExcel(
                            e.adicionales
                        ),

                    "REVISADO":
                        formatRevisado(
                            e.detalle?.revisado
                        ),

                    "ÚLTIMA EDICIÓN POR":
                        ultimoEditorPorEquipo.get(
                            e.id_equipo
                        ) ?? "",
                })
            );

        const headers = [
            "Código",
            "USUARIO",
            "CORREO",
            "ESTADO EQUIPO",
            "SERIAL",
            "MARCA",
            "MODELO",
            "CPU",
            "RAM",
            "DISCO",
            "SISTEMA OPERATIVO",
            "TEAMVIEWER",

            /*
             * Adicionales.
             */
            "ADICIONALES",
            "SERIALES ADICIONALES",
            "ORIGEN ADICIONALES",
            "ESTADO ADICIONALES",

            "REVISADO",
            "ÚLTIMA EDICIÓN POR",
        ];

        const ws = XLSX.utils.json_to_sheet(rows, { header: headers });

        styleSheet(
            ws,
            rows.length,
            headers.length,
            getEmpresaStyle(empresa)
        );

        /*
 * Ajustar ancho de columnas especiales.
 */
        const adicionalesIndex =
            headers.indexOf(
                "ADICIONALES"
            );

        const serialesAdicionalesIndex =
            headers.indexOf(
                "SERIALES ADICIONALES"
            );

        const origenAdicionalesIndex =
            headers.indexOf(
                "ORIGEN ADICIONALES"
            );

        const estadoAdicionalesIndex =
            headers.indexOf(
                "ESTADO ADICIONALES"
            );

        if (
            ws["!cols"]
        ) {
            if (
                adicionalesIndex >= 0
            ) {
                ws["!cols"][
                    adicionalesIndex
                ] = {
                    wch: 45,
                };
            }

            if (
                serialesAdicionalesIndex >=
                0
            ) {
                ws["!cols"][
                    serialesAdicionalesIndex
                ] = {
                    wch: 32,
                };
            }

            if (
                origenAdicionalesIndex >=
                0
            ) {
                ws["!cols"][
                    origenAdicionalesIndex
                ] = {
                    wch: 25,
                };
            }

            if (
                estadoAdicionalesIndex >=
                0
            ) {
                ws["!cols"][
                    estadoAdicionalesIndex
                ] = {
                    wch: 28,
                };
            }
        }

        XLSX.utils.book_append_sheet(
            wb,
            ws,
            empresa.substring(
                0,
                31
            )
        );
    }

    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

/* ======================================================
    Export MANUAL (Web)
   GET /api/inventario/export
====================================================== */
export async function exportInventario(
    req: Request,
    res: Response
) {
    try {
        const user =
            (req as any).user;

        const mes =
            typeof req.query.mes === "string" &&
                /^\d{4}-\d{2}$/.test(
                    req.query.mes
                )
                ? req.query.mes
                : "SIN_MES";

        let empresaId:
            number | undefined;

        /*
         * Cliente: siempre exporta solamente
         * los equipos de su propia empresa.
         */
        if (
            user?.rol ===
            "CLIENTE"
        ) {
            empresaId =
                user.empresaId;
        } else {
            empresaId =
                parsePositiveIntQuery(
                    req.query.empresaId
                );
        }

        const createdFrom =
            parseDateQuery(
                req.query.createdFrom
            );

        const createdTo =
            parseDateQuery(
                req.query.createdTo
            );

        const updatedFrom =
            parseDateQuery(
                req.query.updatedFrom
            );

        const updatedTo =
            parseDateQuery(
                req.query.updatedTo
            );

        /*
 * =====================================================
 * Filtros generales de equipos
 * =====================================================
 */

        const marca =
            typeof req.query.marca ===
                "string"
                ? req.query.marca.trim()
                : undefined;

        const estado =
            typeof req.query.estado ===
                "string" &&
                Object.values(
                    EstadoEquipo
                ).includes(
                    req.query.estado as EstadoEquipo
                )
                ? req.query.estado as EstadoEquipo
                : undefined;

        const propiedad =
            req.query.propiedad === "Empresa" ||
                req.query.propiedad === "Personal" ||
                req.query.propiedad === "Externo"
                ? req.query.propiedad
                : undefined;

        const propietarioExterno =
            typeof req.query.propietarioExterno ===
                "string"
                ? req.query.propietarioExterno.trim()
                : undefined;

        const anioPcDesde =
            parsePositiveIntQuery(
                req.query.anioPcDesde
            );

        const anioPcHasta =
            parsePositiveIntQuery(
                req.query.anioPcHasta
            );

        const anioPcOrigen =
            req.query.anioPcOrigen === "AUTO" ||
                req.query.anioPcOrigen === "MANUAL" ||
                req.query.anioPcOrigen === "NO_DETERMINADO"
                ? req.query.anioPcOrigen
                : undefined;

        /*
 * =====================================================
 * Filtros Agente / Script RIDS
 * =====================================================
 */

        const agente =
            req.query.agente === "INSTALADO" ||
                req.query.agente === "NO_INSTALADO" ||
                req.query.agente === "ACTIVO" ||
                req.query.agente === "SIN_CONEXION"
                ? req.query.agente
                : undefined;

        const agenteDesde =
            typeof req.query.agenteDesde === "string" &&
                /^\d{4}-\d{2}-\d{2}$/.test(
                    req.query.agenteDesde
                )
                ? new Date(
                    `${req.query.agenteDesde}T00:00:00.000Z`
                )
                : undefined;

        const agenteHasta =
            typeof req.query.agenteHasta === "string" &&
                /^\d{4}-\d{2}-\d{2}$/.test(
                    req.query.agenteHasta
                )
                ? new Date(
                    `${req.query.agenteHasta}T23:59:59.999Z`
                )
                : undefined;

        /*
         * Filtros de actividad del técnico.
         */
        const auditTecnicoId =
            parsePositiveIntQuery(
                req.query.auditTecnicoId
            );

        const auditFrom =
            parseDateQuery(
                req.query.auditFrom
            );

        const auditTo =
            parseDateQuery(
                req.query.auditTo
            );

        const auditAction =
            parseAuditActionQuery(
                req.query.auditAction
            );

        /*
 * Filtro de solicitantes con múltiples equipos.
 */
        const solicitanteMultiplesEquipos =
            req.query.solicitanteMultiplesEquipos ===
                "MULTIPLES"
                ? "MULTIPLES" as const
                : undefined;

        /*
         * Validar expresamente IDs enviados.
         */
        if (
            req.query.auditTecnicoId &&
            !auditTecnicoId
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "auditTecnicoId inválido",
                });
        }

        const equipos =
            await getInventarioByEmpresa({
                ...(empresaId
                    ? {
                        empresaId,
                    }
                    : {}),

                ...(marca
                    ? {
                        marca,
                    }
                    : {}),

                ...(estado
                    ? {
                        estado,
                    }
                    : {}),

                ...(propiedad
                    ? {
                        propiedad,
                    }
                    : {}),

                ...(propietarioExterno
                    ? {
                        propietarioExterno,
                    }
                    : {}),

                ...(anioPcDesde
                    ? {
                        anioPcDesde,
                    }
                    : {}),

                ...(anioPcHasta
                    ? {
                        anioPcHasta,
                    }
                    : {}),

                ...(anioPcOrigen
                    ? {
                        anioPcOrigen,
                    }
                    : {}),

                ...(createdFrom
                    ? {
                        createdFrom,
                    }
                    : {}),

                ...(createdTo
                    ? {
                        createdTo,
                    }
                    : {}),

                ...(updatedFrom
                    ? {
                        updatedFrom,
                    }
                    : {}),

                ...(updatedTo
                    ? {
                        updatedTo,
                    }
                    : {}),

                ...(agente
                    ? {
                        agente,
                    }
                    : {}),

                ...(agenteDesde
                    ? {
                        agenteDesde,
                    }
                    : {}),

                ...(agenteHasta
                    ? {
                        agenteHasta,
                    }
                    : {}),

                ...(auditTecnicoId
                    ? {
                        auditTecnicoId,
                    }
                    : {}),

                ...(auditFrom
                    ? {
                        auditFrom,
                    }
                    : {}),

                ...(auditTo
                    ? {
                        auditTo,
                    }
                    : {}),

                ...(auditAction
                    ? {
                        auditAction,
                    }
                    : {}),

                ...(solicitanteMultiplesEquipos
                    ? {
                        solicitanteMultiplesEquipos,
                    }
                    : {}),
            });

        if (
            equipos.length ===
            0
        ) {
            return res
                .status(404)
                .json({
                    error:
                        "No existen equipos para los filtros seleccionados.",
                });
        }

        const ultimoEditorPorEquipo =
            await obtenerUltimoEditorPorEquipo(
                equipos
            );

        const buffer =
            buildInventarioExcel(
                equipos,
                mes,
                ultimoEditorPorEquipo
            );

        const tecnico =
            auditTecnicoId
                ? await prisma.tecnico.findUnique({
                    where: {
                        id_tecnico:
                            auditTecnicoId,
                    },

                    select: {
                        nombre: true,
                    },
                })
                : null;

        const empresaSuffix =
            empresaId
                ? String(
                    empresaId
                )
                : "TODAS";

        const tecnicoSuffix =
            tecnico?.nombre
                ? `_TECNICO_${tecnico.nombre
                    .trim()
                    .replace(
                        /[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g,
                        "_"
                    )}`
                : "";

        const fileName =
            `Inventario_${empresaSuffix}_${mes}${tecnicoSuffix}.xlsx`;

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(
                fileName
            )}"`
        );

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        return res.send(
            buffer
        );
    } catch (err) {
        console.error(
            "❌ EXPORT INVENTARIO:",
            err
        );

        return res
            .status(500)
            .json({
                error:
                    "Error exportando inventario",
            });
    }
}

/* ======================================================
    Export AUTOMÁTICO (Power Automate)
   POST /api/inventario/export/sharepoint
====================================================== */
export async function exportInventarioForSharepoint(
    req: Request,
    res: Response
) {
    try {
        // Mes actual
        const now = new Date();
        const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        const timestamp = now.toISOString().slice(0, 10); // YYYY-MM-DD

        const equipos = await getInventarioByEmpresa({});
        if (!equipos.length) {
            return res.status(404).json({ ok: false, error: "Sin inventario" });
        }

        const ultimoEditorPorEquipo = await obtenerUltimoEditorPorEquipo(equipos);

        const porEmpresa: Record<string, typeof equipos> = {};
        for (const e of equipos) {
            const empresa = normalizeEmpresa(
                e.solicitante?.empresa?.nombre ?? e.empresa?.nombre ?? "SIN_EMPRESA"
            );
            porEmpresa[empresa] ??= [];
            porEmpresa[empresa].push(e);
        }

        // Construir archivos por empresa
        const archivos = Object.entries(porEmpresa)
            .map(([empresa, items]) => {
                const sharepointPath = resolveSharepointPath(empresa);
                if (!sharepointPath) {
                    console.warn(`⚠️ Empresa sin ruta SharePoint: ${empresa}`);
                    return null;
                }

                const buffer = buildInventarioExcel(items, mes, ultimoEditorPorEquipo);

                return {
                    empresa,
                    sharepointPath,
                    fileName: `Inventario_${empresa}_${mes}_${timestamp}.xlsx`,
                    contentBase64: buffer.toString("base64"),
                };
            })
            .filter(Boolean);

        // Verificar si hay archivos para subir
        if (!archivos.length) {
            return res.status(404).json({
                ok: false,
                error: "Ninguna empresa tiene ruta SharePoint definida",
            });
        }

        // Responder con los archivos listos para subir a SharePoint
        return res.json({
            ok: true,
            mes,
            totalArchivos: archivos.length,
            archivos,
        });
    } catch (err) {
        console.error("❌ EXPORT SP:", err);
        return res.status(500).json({ ok: false, error: "Error interno" });
    }
}

// ======================================================
/*  Obtener Inventario
   GET /api/inventario
====================================================== */
export async function getInventario(
    req: Request,
    res: Response
): Promise<Response> {
    try {
        const params: { empresaId?: number } = {};

        if (req.query.empresaId) {
            const id = Number(req.query.empresaId);
            if (Number.isNaN(id)) {
                return res.status(400).json({ error: "empresaId inválido" });
            }
            params.empresaId = id;
        }

        const equipos = await getInventarioByEmpresa(params);

        const data = equipos.map(e => ({
            id_equipo: e.id_equipo,
            empresa: e.solicitante?.empresa?.nombre ?? e.empresa?.nombre ?? null,
            usuario: e.solicitante?.nombre ?? null,
            correo: e.solicitante?.email ?? null,

            usuarioEmpresa: e.detalle?.usuarioEmpresa ?? null,
            usuarioRids: e.detalle?.adminRidsUsuario ?? null,

            serial: e.serial,
            marca: e.marca,
            modelo: e.modelo,
            procesador: e.procesador,
            ram: e.ram,
            disco: e.disco,

            so: e.detalle?.so ?? null,
            licenciaUsuario: e.detalle?.office ?? null,
            teamViewer: e.detalle?.teamViewer ?? null,
            claveTeamViewer: e.detalle?.claveTv ?? null,
            macWifi: e.detalle?.macWifi ?? null,

            propiedad: e.propiedad,
            estadoEquipo: e.estado,
            anioPc: e.anioPc ?? null,
            tipoEquipo: e.tipo,
            fechaIngreso: formatFechaChile(e.createdAt),
            revisado: formatRevisado(e.detalle?.revisado),
        }));

        return res.json({
            ok: true,
            total: data.length,
            data
        });
    } catch (err) {
        console.error("❌ ERROR GET INVENTARIO:", err);
        return res.status(500).json({ ok: false, error: "Error obteniendo inventario" });
    }
}