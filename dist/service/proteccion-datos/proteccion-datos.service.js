// src/service/proteccion-datos/proteccion-datos.service.ts
import { EstadoCampaniaProteccionDatos, Prisma, } from "@prisma/client";
import sanitizeHtml from "sanitize-html";
import { prisma, } from "../../lib/prisma.js";
import { hashDocumento, } from "./proteccion-datos-documento.service.js";
/* =========================================================
   CAMPOS LEGALES INMUTABLES
   ========================================================= */
/**
 * Una vez que la campaña deja de BORRADOR,
 * estos campos ya no pueden modificarse.
 *
 * Esto garantiza que la campaña siga representando
 * exactamente el documento enviado a los destinatarios.
 */
const CAMPOS_LEGALES_INMUTABLES = [
    "tituloDocumento",
    "versionDocumento",
    "contenidoHtml",
    "configuracionConsentimiento",
];
/* =========================================================
   SANITIZACIÓN HTML
   ========================================================= */
/**
 * Sanitización específica para documentos legales.
 *
 * Se permiten etiquetas típicas de documentos:
 * encabezados, párrafos, listas, tablas, enlaces, etc.
 *
 * NO se permiten:
 * - script
 * - iframe
 * - event handlers
 * - javascript:
 */
export function sanitizarDocumentoProteccionDatos(html) {
    if (typeof html !== "string" ||
        !html.trim()) {
        throw new Error("El contenido del documento es obligatorio");
    }
    const contenidoSeguro = sanitizeHtml(html, {
        allowedTags: [
            "p",
            "br",
            "strong",
            "b",
            "em",
            "i",
            "u",
            "s",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "ul",
            "ol",
            "li",
            "blockquote",
            "table",
            "thead",
            "tbody",
            "tfoot",
            "tr",
            "th",
            "td",
            "a",
            "div",
            "span",
            "hr",
        ],
        allowedAttributes: {
            a: [
                "href",
                "target",
                "rel",
            ],
            th: [
                "colspan",
                "rowspan",
            ],
            td: [
                "colspan",
                "rowspan",
            ],
            "*": [
                "class",
            ],
        },
        allowedSchemes: [
            "http",
            "https",
            "mailto",
        ],
        allowProtocolRelative: false,
        transformTags: {
            a: sanitizeHtml.simpleTransform("a", {
                rel: "noopener noreferrer",
            }),
        },
    })
        .trim();
    if (!contenidoSeguro) {
        throw new Error("El documento quedó vacío después de sanitizar el contenido");
    }
    return contenidoSeguro;
}
/* =========================================================
   SANITIZACIÓN CORREO
   ========================================================= */
/**
 * Sanitización del cuerpo HTML del correo.
 *
 * Se mantiene separada del documento legal porque
 * sus requerimientos pueden cambiar independientemente.
 */
export function sanitizarCorreoProteccionDatos(html) {
    if (typeof html !== "string" ||
        !html.trim()) {
        throw new Error("El cuerpo del correo es obligatorio");
    }
    const contenidoSeguro = sanitizeHtml(html, {
        allowedTags: [
            ...sanitizeHtml.defaults.allowedTags,
            "h1",
            "h2",
            "h3",
            "img",
        ],
        allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            a: [
                "href",
                "target",
                "rel",
            ],
            img: [
                "src",
                "alt",
                "title",
                "width",
                "height",
            ],
            "*": [
                "class",
                "style",
            ],
        },
        allowedSchemes: [
            "http",
            "https",
            "mailto",
            "cid",
        ],
        allowProtocolRelative: false,
        transformTags: {
            a: sanitizeHtml.simpleTransform("a", {
                rel: "noopener noreferrer",
            }),
        },
    })
        .trim();
    if (!contenidoSeguro) {
        throw new Error("El cuerpo del correo quedó vacío después de sanitizarlo");
    }
    return contenidoSeguro;
}
/* =========================================================
   HELPERS
   ========================================================= */
function toPrismaJson(value) {
    return JSON.parse(JSON.stringify(value));
}
function normalizarTextoObligatorio(value, campo) {
    if (typeof value !== "string" ||
        !value.trim()) {
        throw new Error(`${campo} es obligatorio`);
    }
    return value.trim();
}
function normalizarTextoOpcional(value) {
    if (value === undefined ||
        value === null) {
        return null;
    }
    const limpio = value.trim();
    return limpio ||
        null;
}
/* =========================================================
   CONFIGURACIÓN CONSENTIMIENTO
   ========================================================= */
function validarConfiguracionConsentimiento(config) {
    if (config ===
        undefined ||
        config ===
            null) {
        return null;
    }
    /* =====================================================
       VERSIÓN DEL ESQUEMA
       ===================================================== */
    if (config.schemaVersion !==
        2) {
        throw new Error("schemaVersion de la configuración debe ser 2");
    }
    /* =====================================================
       DATOS GENERALES
       ===================================================== */
    const tituloFormulario = config.tituloFormulario
        ?.trim();
    if (!tituloFormulario) {
        throw new Error("tituloFormulario es obligatorio");
    }
    const textoBoton = config.textoBoton
        ?.trim();
    if (!textoBoton) {
        throw new Error("textoBoton es obligatorio");
    }
    const descripcionFormulario = config.descripcionFormulario
        ?.trim() ||
        undefined;
    /* =====================================================
       CAMPOS
       ===================================================== */
    if (!Array.isArray(config.campos)) {
        throw new Error("campos debe ser un arreglo");
    }
    if (config.campos.length ===
        0) {
        throw new Error("El formulario debe contener al menos un campo");
    }
    const keys = new Set();
    const campos = config.campos.map((campo, index) => validarCampoConsentimiento(campo, index, keys));
    return {
        schemaVersion: 2,
        tituloFormulario,
        ...(descripcionFormulario
            ? {
                descripcionFormulario,
            }
            : {}),
        textoBoton,
        campos,
    };
}
function validarCampoConsentimiento(campo, index, keys) {
    if (!campo ||
        typeof campo !==
            "object") {
        throw new Error(`El campo #${index + 1} no es válido`);
    }
    /* =====================================================
       KEY
       ===================================================== */
    const key = campo.key
        ?.trim()
        .toLowerCase();
    if (!key) {
        throw new Error(`El campo #${index + 1} no tiene key`);
    }
    if (!/^[a-z0-9_]+$/.test(key)) {
        throw new Error(`La key "${key}" contiene caracteres no permitidos`);
    }
    if (keys.has(key)) {
        throw new Error(`La key "${key}" está duplicada`);
    }
    keys.add(key);
    /* =====================================================
       LABEL
       ===================================================== */
    const label = campo.label
        ?.trim();
    if (!label) {
        throw new Error(`El campo "${key}" debe tener un título`);
    }
    /* =====================================================
       TIPO
       ===================================================== */
    if (campo.tipo !==
        "TEXT" &&
        campo.tipo !==
            "CHECKBOX" &&
        campo.tipo !==
            "RADIO") {
        throw new Error(`El tipo del campo "${label}" no es válido`);
    }
    /* =====================================================
       OBLIGATORIO
       ===================================================== */
    if (typeof campo.obligatorio !==
        "boolean") {
        throw new Error(`El campo "${label}" debe indicar si es obligatorio`);
    }
    const descripcion = campo.descripcion
        ?.trim() ||
        undefined;
    /* =====================================================
       TEXT
       ===================================================== */
    if (campo.tipo ===
        "TEXT") {
        const placeholder = campo.placeholder
            ?.trim() ||
            undefined;
        return {
            key,
            tipo: "TEXT",
            label,
            ...(descripcion
                ? {
                    descripcion,
                }
                : {}),
            obligatorio: campo.obligatorio,
            ...(placeholder
                ? {
                    placeholder,
                }
                : {}),
        };
    }
    /* =====================================================
       CHECKBOX
       ===================================================== */
    /* =====================================================
    CHECKBOX
    ===================================================== */
    if (campo.tipo ===
        "CHECKBOX") {
        const documentos = campo.documentos
            ?.map((documento, documentoIndex) => {
            const titulo = documento
                ?.titulo
                ?.trim();
            const nombre = documento
                ?.nombre
                ?.trim();
            const path = documento
                ?.path
                ?.trim();
            if (!titulo) {
                throw new Error(`El documento #${documentoIndex + 1} de "${label}" no tiene título`);
            }
            if (!nombre) {
                throw new Error(`El documento "${titulo}" no tiene nombre`);
            }
            if (!path ||
                !path.startsWith("formularios/") ||
                path.includes("..")) {
                throw new Error(`La ruta del documento "${titulo}" no es válida`);
            }
            if (documento.contentType !==
                "application/pdf") {
                throw new Error(`El documento "${titulo}" debe ser PDF`);
            }
            if (!Number.isInteger(documento.size) ||
                documento.size <=
                    0) {
                throw new Error(`El tamaño del documento "${titulo}" no es válido`);
            }
            if (typeof documento.sha256 !==
                "string" ||
                !/^[a-f0-9]{64}$/i.test(documento.sha256)) {
                throw new Error(`El hash del documento "${titulo}" no es válido`);
            }
            return {
                titulo,
                nombre,
                path,
                contentType: "application/pdf",
                size: documento.size,
                sha256: documento.sha256,
            };
        }) ??
            [];
        return {
            key,
            tipo: "CHECKBOX",
            label,
            ...(descripcion
                ? {
                    descripcion,
                }
                : {}),
            obligatorio: campo.obligatorio,
            ...(documentos.length >
                0
                ? {
                    documentos,
                }
                : {}),
        };
    }
    /* =====================================================
       RADIO
       ===================================================== */
    if (!Array.isArray(campo.opciones) ||
        campo.opciones.length <
            2) {
        throw new Error(`El campo "${label}" debe tener al menos dos opciones`);
    }
    const values = new Set();
    const opciones = campo.opciones.map((opcion, opcionIndex) => {
        const value = opcion.value
            ?.trim();
        const opcionLabel = opcion.label
            ?.trim();
        if (!value) {
            throw new Error(`La opción #${opcionIndex + 1} de "${label}" no tiene value`);
        }
        if (!opcionLabel) {
            throw new Error(`La opción "${value}" de "${label}" no tiene label`);
        }
        if (values.has(value)) {
            throw new Error(`La opción "${value}" está repetida en "${label}"`);
        }
        values.add(value);
        return {
            value,
            label: opcionLabel,
        };
    });
    return {
        key,
        tipo: "RADIO",
        label,
        ...(descripcion
            ? {
                descripcion,
            }
            : {}),
        obligatorio: campo.obligatorio,
        opciones,
    };
}
/* =========================================================
   VALIDACIÓN DE FECHAS
   ========================================================= */
function validarRangoFechas(fechaInicio, fechaFin) {
    if (fechaInicio &&
        Number.isNaN(fechaInicio.getTime())) {
        throw new Error("fechaInicio no es válida");
    }
    if (fechaFin &&
        Number.isNaN(fechaFin.getTime())) {
        throw new Error("fechaFin no es válida");
    }
    if (fechaInicio &&
        fechaFin &&
        fechaFin <
            fechaInicio) {
        throw new Error("fechaFin no puede ser anterior a fechaInicio");
    }
}
/* =========================================================
   CREAR CAMPAÑA
   ========================================================= */
export async function crearCampaniaProteccionDatos(input) {
    const nombre = normalizarTextoObligatorio(input.nombre, "El nombre de la campaña");
    const tituloDocumento = normalizarTextoObligatorio(input.tituloDocumento, "El título del documento");
    const versionDocumento = normalizarTextoObligatorio(input.versionDocumento, "La versión del documento");
    const asuntoCorreo = normalizarTextoObligatorio(input.asuntoCorreo, "El asunto del correo");
    const contenidoHtml = sanitizarDocumentoProteccionDatos(input.contenidoHtml);
    const cuerpoCorreoHtml = sanitizarCorreoProteccionDatos(input.cuerpoCorreoHtml);
    const configuracionConsentimiento = validarConfiguracionConsentimiento(input.configuracionConsentimiento);
    validarRangoFechas(input.fechaInicio, input.fechaFin);
    /* =====================================================
       VALIDAR AUTOR
       ===================================================== */
    if (input.creadoPorId !== undefined &&
        input.creadoPorId !== null) {
        const tecnico = await prisma.tecnico.findUnique({
            where: {
                id_tecnico: input.creadoPorId,
            },
            select: {
                id_tecnico: true,
                status: true,
            },
        });
        if (!tecnico) {
            throw new Error("El técnico creador no existe");
        }
        if (!tecnico.status) {
            throw new Error("El técnico creador se encuentra desactivado");
        }
    }
    /* =====================================================
       HASH DEL DOCUMENTO SANITIZADO
       ===================================================== */
    const documentoHash = hashDocumento(contenidoHtml);
    /* =====================================================
   CONFIGURACIÓN JSON PARA PRISMA
   ===================================================== */
    const configuracionConsentimientoJson = configuracionConsentimiento
        ? toPrismaJson(configuracionConsentimiento)
        : Prisma.JsonNull;
    /* =====================================================
       CREACIÓN
       ===================================================== */
    return prisma.campaniaProteccionDatos.create({
        data: {
            nombre,
            descripcion: normalizarTextoOpcional(input.descripcion),
            tituloDocumento,
            versionDocumento,
            contenidoHtml,
            documentoHash,
            configuracionConsentimiento: configuracionConsentimientoJson,
            asuntoCorreo,
            cuerpoCorreoHtml,
            fechaInicio: input.fechaInicio ??
                null,
            fechaFin: input.fechaFin ??
                null,
            creadoPorId: input.creadoPorId ??
                null,
        },
        include: {
            creadoPor: {
                select: {
                    id_tecnico: true,
                    nombre: true,
                    email: true,
                },
            },
            _count: {
                select: {
                    destinatarios: true,
                },
            },
        },
    });
}
/* =========================================================
   LISTAR CAMPAÑAS
   ========================================================= */
export async function listarCampaniasProteccionDatos(params) {
    const estado = params?.estado;
    const search = params?.search
        ?.trim();
    const skip = Math.max(params?.skip ??
        0, 0);
    const take = Math.min(Math.max(params?.take ??
        50, 1), 100);
    const where = {
        ...(estado
            ? {
                estado,
            }
            : {}),
        ...(search
            ? {
                OR: [
                    {
                        nombre: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        tituloDocumento: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        versionDocumento: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                ],
            }
            : {}),
    };
    const [items, total,] = await prisma.$transaction([
        prisma.campaniaProteccionDatos.findMany({
            where,
            skip,
            take,
            orderBy: {
                createdAt: "desc",
            },
            include: {
                creadoPor: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
                _count: {
                    select: {
                        destinatarios: true,
                    },
                },
            },
        }),
        prisma.campaniaProteccionDatos.count({
            where,
        }),
    ]);
    return {
        items,
        total,
        skip,
        take,
    };
}
/* =========================================================
   OBTENER CAMPAÑA
   ========================================================= */
export async function obtenerCampaniaProteccionDatos(id) {
    if (!Number.isInteger(id) ||
        id <= 0) {
        throw new Error("ID de campaña inválido");
    }
    const campania = await prisma.campaniaProteccionDatos.findUnique({
        where: {
            id,
        },
        include: {
            creadoPor: {
                select: {
                    id_tecnico: true,
                    nombre: true,
                    email: true,
                },
            },
            _count: {
                select: {
                    destinatarios: true,
                },
            },
        },
    });
    if (!campania) {
        throw new Error("Campaña de protección de datos no encontrada");
    }
    return campania;
}
/* =========================================================
   COMPROBAR CAMPOS LEGALES
   ========================================================= */
function contieneCambiosLegales(input) {
    return CAMPOS_LEGALES_INMUTABLES.some((campo) => Object.prototype.hasOwnProperty.call(input, campo));
}
/* =========================================================
   ACTUALIZAR CAMPAÑA
   ========================================================= */
export async function actualizarCampaniaProteccionDatos(id, input) {
    const campaniaActual = await obtenerCampaniaProteccionDatos(id);
    /* =====================================================
       BLOQUEO DOCUMENTAL
       ===================================================== */
    if (campaniaActual.estado !==
        EstadoCampaniaProteccionDatos.BORRADOR &&
        contieneCambiosLegales(input)) {
        throw new Error("El documento y la configuración del consentimiento no pueden modificarse una vez que la campaña deja de estar en BORRADOR");
    }
    /* =====================================================
       FECHAS
       ===================================================== */
    const fechaInicio = input.fechaInicio !== undefined
        ? input.fechaInicio
        : campaniaActual.fechaInicio;
    const fechaFin = input.fechaFin !== undefined
        ? input.fechaFin
        : campaniaActual.fechaFin;
    validarRangoFechas(fechaInicio, fechaFin);
    /* =====================================================
       DATA UPDATE
       ===================================================== */
    const data = {};
    /* =====================================================
       METADATOS
       ===================================================== */
    if (input.nombre !== undefined) {
        data.nombre =
            normalizarTextoObligatorio(input.nombre, "El nombre de la campaña");
    }
    if (input.descripcion !== undefined) {
        data.descripcion =
            normalizarTextoOpcional(input.descripcion);
    }
    if (input.asuntoCorreo !== undefined) {
        data.asuntoCorreo =
            normalizarTextoObligatorio(input.asuntoCorreo, "El asunto del correo");
    }
    if (input.cuerpoCorreoHtml !== undefined) {
        data.cuerpoCorreoHtml =
            sanitizarCorreoProteccionDatos(input.cuerpoCorreoHtml);
    }
    if (input.fechaInicio !== undefined) {
        data.fechaInicio =
            input.fechaInicio;
    }
    if (input.fechaFin !== undefined) {
        data.fechaFin =
            input.fechaFin;
    }
    /* =====================================================
       DOCUMENTO LEGAL
       SOLO BORRADOR
       ===================================================== */
    let contenidoHtmlFinal;
    if (input.tituloDocumento !==
        undefined) {
        data.tituloDocumento =
            normalizarTextoObligatorio(input.tituloDocumento, "El título del documento");
    }
    if (input.versionDocumento !==
        undefined) {
        data.versionDocumento =
            normalizarTextoObligatorio(input.versionDocumento, "La versión del documento");
    }
    if (input.contenidoHtml !== undefined) {
        contenidoHtmlFinal =
            sanitizarDocumentoProteccionDatos(input.contenidoHtml);
        data.contenidoHtml =
            contenidoHtmlFinal;
        data.documentoHash =
            hashDocumento(contenidoHtmlFinal);
    }
    if (input.configuracionConsentimiento !==
        undefined) {
        const config = validarConfiguracionConsentimiento(input.configuracionConsentimiento);
        data.configuracionConsentimiento =
            config
                ? toPrismaJson(config)
                : Prisma.JsonNull;
    }
    /*
     * IMPORTANTE:
     *
     * No utilizamos input.estado aquí.
     *
     * Los cambios de estado deben pasar por funciones
     * explícitas:
     *
     * activarCampaniaProteccionDatos()
     * finalizarCampaniaProteccionDatos()
     * cancelarCampaniaProteccionDatos()
     *
     * De esta forma no se puede hacer:
     *
     * BORRADOR -> FINALIZADA
     *
     * simplemente enviando un PATCH arbitrario.
     */
    return prisma.campaniaProteccionDatos.update({
        where: {
            id,
        },
        data,
        include: {
            creadoPor: {
                select: {
                    id_tecnico: true,
                    nombre: true,
                    email: true,
                },
            },
            _count: {
                select: {
                    destinatarios: true,
                },
            },
        },
    });
}
/* =========================================================
   ACTIVAR CAMPAÑA
   ========================================================= */
export async function activarCampaniaProteccionDatos(id) {
    const campania = await obtenerCampaniaProteccionDatos(id);
    if (campania.estado !==
        EstadoCampaniaProteccionDatos.BORRADOR) {
        throw new Error("Solo una campaña en BORRADOR puede activarse");
    }
    const totalDestinatarios = await prisma.consentimientoDatos.count({
        where: {
            campaniaId: campania.id,
        },
    });
    if (totalDestinatarios ===
        0) {
        throw new Error("La campaña debe tener al menos un destinatario antes de activarse");
    }
    return prisma.campaniaProteccionDatos.update({
        where: {
            id,
        },
        data: {
            estado: EstadoCampaniaProteccionDatos.ACTIVA,
            fechaInicio: campania.fechaInicio ??
                new Date(),
        },
        include: {
            creadoPor: {
                select: {
                    id_tecnico: true,
                    nombre: true,
                    email: true,
                },
            },
            _count: {
                select: {
                    destinatarios: true,
                },
            },
        },
    });
}
/* =========================================================
   FINALIZAR CAMPAÑA
   ========================================================= */
export async function finalizarCampaniaProteccionDatos(id) {
    const campania = await obtenerCampaniaProteccionDatos(id);
    if (campania.estado !==
        EstadoCampaniaProteccionDatos.ACTIVA) {
        throw new Error("Solo una campaña ACTIVA puede finalizarse");
    }
    return prisma.campaniaProteccionDatos.update({
        where: {
            id,
        },
        data: {
            estado: EstadoCampaniaProteccionDatos.FINALIZADA,
            fechaFin: new Date(),
        },
        include: {
            creadoPor: {
                select: {
                    id_tecnico: true,
                    nombre: true,
                    email: true,
                },
            },
            _count: {
                select: {
                    destinatarios: true,
                },
            },
        },
    });
}
/* =========================================================
   CANCELAR CAMPAÑA
   ========================================================= */
export async function cancelarCampaniaProteccionDatos(id) {
    const campania = await obtenerCampaniaProteccionDatos(id);
    if (campania.estado ===
        EstadoCampaniaProteccionDatos.FINALIZADA) {
        throw new Error("Una campaña FINALIZADA no puede cancelarse");
    }
    if (campania.estado ===
        EstadoCampaniaProteccionDatos.CANCELADA) {
        throw new Error("La campaña ya se encuentra cancelada");
    }
    return prisma.campaniaProteccionDatos.update({
        where: {
            id,
        },
        data: {
            estado: EstadoCampaniaProteccionDatos.CANCELADA,
            fechaFin: new Date(),
        },
        include: {
            creadoPor: {
                select: {
                    id_tecnico: true,
                    nombre: true,
                    email: true,
                },
            },
            _count: {
                select: {
                    destinatarios: true,
                },
            },
        },
    });
}
//# sourceMappingURL=proteccion-datos.service.js.map