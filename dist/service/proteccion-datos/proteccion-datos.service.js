// src/service/proteccion-datos/proteccion-datos.service.ts
import { EstadoCampaniaProteccionDatos, Prisma, } from "@prisma/client";
import sanitizeHtml from "sanitize-html";
import { prisma, } from "../../lib/prisma.js";
import { hashDocumento, } from "./proteccion-datos-documento.service.js";
import { obtenerElementoCatalogo, } from "../leypd/leypd-catalogo.js";
import { LEYPD_ELEMENTO_CONSENTIMIENTO, ORIGENES_CAMPANIA_PROTECCION_DATOS, } from "./proteccion-datos.types.js";
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
        /* Documentos de la carpeta LEYPD de cada empresa */
        const documentosLeypd = (campo.documentosLeypd ?? []).map((referencia, referenciaIndex) => {
            const titulo = referencia
                ?.titulo
                ?.trim();
            const elemento = obtenerElementoCatalogo(Number(referencia?.elemento));
            const documentoCatalogo = elemento?.documentos.find((d) => d.nombreBase ===
                referencia?.nombreBase &&
                d.tipo !==
                    "CARPETA" &&
                d.tipo !==
                    "JS" &&
                !d.subcarpeta);
            if (!titulo) {
                throw new Error(`El documento Ley PD #${referenciaIndex + 1} de "${label}" no tiene título`);
            }
            if (!elemento ||
                !documentoCatalogo) {
                throw new Error(`El documento Ley PD "${titulo}" no existe en el catálogo`);
            }
            return {
                elemento: elemento.numero,
                nombreBase: documentoCatalogo.nombreBase,
                titulo,
            };
        });
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
            ...(documentosLeypd.length >
                0
                ? {
                    documentosLeypd,
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
/**
 * Valida y normaliza el contexto de la campaña.
 *
 * Reglas:
 * - origen por defecto GENERAL
 * - LEYPD exige empresa y elemento 04
 * - GENERAL no puede asociarse a un elemento Ley PD
 * - si hay empresa, debe existir y estar activa
 */
async function resolverContextoCampania(input) {
    const origen = input.origen ??
        "GENERAL";
    if (!ORIGENES_CAMPANIA_PROTECCION_DATOS.includes(origen)) {
        throw new Error("El origen de la campaña no es válido");
    }
    const empresaId = input.empresaId ??
        null;
    if (origen ===
        "LEYPD") {
        if (empresaId ===
            null) {
            throw new Error("Una campaña Ley PD debe estar asociada a una empresa");
        }
        if (input.leypdElementoNumero !==
            LEYPD_ELEMENTO_CONSENTIMIENTO) {
            throw new Error("Una campaña Ley PD debe asociarse al elemento 04 (Gestión del consentimiento)");
        }
    }
    else if (input.leypdElementoNumero !==
        undefined &&
        input.leypdElementoNumero !==
            null) {
        throw new Error("Solo las campañas Ley PD pueden asociarse a un elemento Ley PD");
    }
    if (empresaId !==
        null) {
        const empresa = await prisma.empresa.findUnique({
            where: {
                id_empresa: empresaId,
            },
            select: {
                isActive: true,
            },
        });
        if (!empresa) {
            throw new Error("La empresa asociada a la campaña no existe");
        }
        if (!empresa.isActive) {
            throw new Error("La empresa asociada a la campaña está inactiva");
        }
    }
    return {
        empresaId,
        origen,
        leypdElementoNumero: origen ===
            "LEYPD"
            ? LEYPD_ELEMENTO_CONSENTIMIENTO
            : null,
    };
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
    const contexto = await resolverContextoCampania(input);
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
            empresaId: contexto.empresaId,
            origen: contexto.origen,
            leypdElementoNumero: contexto.leypdElementoNumero,
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
        ...(params?.empresaId !==
            undefined
            ? {
                empresaId: params.empresaId,
            }
            : {}),
        ...(params?.origen
            ? {
                origen: params.origen,
            }
            : {}),
        ...(params?.leypdElementoNumero !==
            undefined
            ? {
                leypdElementoNumero: params.leypdElementoNumero,
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
    /* Empresa: solo en BORRADOR y en campañas generales (las Ley PD quedan fijas) */
    if (input.empresaId !==
        undefined) {
        if (campaniaActual.estado !==
            EstadoCampaniaProteccionDatos.BORRADOR) {
            throw new Error("La empresa solo puede cambiarse mientras la campaña está en BORRADOR");
        }
        if (campaniaActual.origen ===
            "LEYPD") {
            throw new Error("La empresa de una campaña Ley PD no puede cambiarse");
        }
        if (input.empresaId ===
            null) {
            data.empresa = {
                disconnect: true,
            };
        }
        else {
            const empresa = await prisma.empresa.findUnique({
                where: {
                    id_empresa: input.empresaId,
                },
                select: {
                    isActive: true,
                },
            });
            if (!empresa) {
                throw new Error("La empresa asociada a la campaña no existe");
            }
            if (!empresa.isActive) {
                throw new Error("La empresa asociada a la campaña está inactiva");
            }
            data.empresa = {
                connect: {
                    id_empresa: input.empresaId,
                },
            };
        }
    }
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
function fechaMayor(a, b) {
    if (!a) {
        return b;
    }
    if (!b) {
        return a;
    }
    return a > b
        ? a
        : b;
}
export async function resumenEmpresasProteccionDatos(params) {
    const campanias = await prisma.campaniaProteccionDatos.findMany({
        where: params?.estado
            ? {
                estado: params.estado,
            }
            : {},
        select: {
            id: true,
            nombre: true,
            tituloDocumento: true,
            versionDocumento: true,
            estado: true,
            empresaId: true,
            fechaEnvioInicial: true,
            fechaFin: true,
            createdAt: true,
        },
        orderBy: {
            createdAt: "desc",
        },
    });
    const grupos = await prisma.consentimientoDatos.groupBy({
        by: [
            "campaniaId",
            "empresaId",
            "estado",
        ],
        where: {
            campaniaId: {
                in: campanias.map((c) => c.id),
            },
        },
        _count: {
            _all: true,
            fechaEnvio: true,
        },
        _max: {
            fechaEnvio: true,
        },
    });
    /* Nombres de empresa (de los destinatarios y de las campañas) */
    const idsEmpresa = [
        ...new Set([
            ...grupos.map((g) => g.empresaId),
            ...campanias.map((c) => c.empresaId),
        ].filter((id) => id !==
            null)),
    ];
    const empresas = await prisma.empresa.findMany({
        where: {
            id_empresa: {
                in: idsEmpresa,
            },
        },
        select: {
            id_empresa: true,
            nombre: true,
        },
    });
    const nombreEmpresa = new Map(empresas.map((e) => [
        e.id_empresa,
        e.nombre,
    ]));
    const campaniaPorId = new Map(campanias.map((c) => [
        c.id,
        c,
    ]));
    /* empresaId -> campaniaId -> resumen */
    const porEmpresa = new Map();
    const fila = (empresaId, campaniaId) => {
        const c = campaniaPorId.get(campaniaId);
        if (!c) {
            return null;
        }
        let mapa = porEmpresa.get(empresaId);
        if (!mapa) {
            mapa =
                new Map();
            porEmpresa.set(empresaId, mapa);
        }
        let r = mapa.get(campaniaId);
        if (!r) {
            r = {
                id: c.id,
                nombre: c.nombre,
                tituloDocumento: c.tituloDocumento,
                versionDocumento: c.versionDocumento,
                estado: c.estado,
                fechaEnvioInicial: c.fechaEnvioInicial,
                fechaFin: c.fechaFin,
                createdAt: c.createdAt,
                destinatarios: 0,
                enviados: 0,
                aceptados: 0,
                rechazados: 0,
                revocados: 0,
                pendientes: 0,
                errores: 0,
                ultimoEnvio: null,
            };
            mapa.set(campaniaId, r);
        }
        return r;
    };
    for (const g of grupos) {
        const r = fila(g.empresaId, g.campaniaId);
        if (!r) {
            continue;
        }
        const n = g._count._all;
        r.destinatarios +=
            n;
        r.enviados +=
            g._count.fechaEnvio;
        r.ultimoEnvio =
            fechaMayor(r.ultimoEnvio, g._max.fechaEnvio);
        switch (g.estado) {
            case "ACEPTADO":
                r.aceptados += n;
                break;
            case "RECHAZADO":
                r.rechazados += n;
                break;
            case "REVOCADO":
                r.revocados += n;
                break;
            case "ERROR_ENVIO":
                r.errores += n;
                break;
            case "PENDIENTE":
            case "ENVIADO":
                r.pendientes += n;
                break;
            default:
                break;
        }
    }
    /* Campañas sin destinatarios: bajo la empresa de la campaña */
    const conDestinatarios = new Set(grupos.map((g) => g.campaniaId));
    for (const c of campanias) {
        if (!conDestinatarios.has(c.id)) {
            fila(c.empresaId, c.id);
        }
    }
    const resultado = [...porEmpresa.entries()].map(([empresaId, mapa,]) => {
        const detalle = [...mapa.values()].sort((a, b) => b.createdAt.getTime() -
            a.createdAt.getTime());
        const suma = (k) => detalle.reduce((t, d) => t + d[k], 0);
        return {
            empresaId,
            empresaNombre: empresaId === null
                ? "Sin empresa"
                : nombreEmpresa.get(empresaId) ??
                    `Empresa ${empresaId}`,
            campanias: detalle.length,
            campaniasEnviadas: detalle.filter((d) => d.enviados >
                0).length,
            destinatarios: suma("destinatarios"),
            enviados: suma("enviados"),
            aceptados: suma("aceptados"),
            rechazados: suma("rechazados"),
            revocados: suma("revocados"),
            pendientes: suma("pendientes"),
            errores: suma("errores"),
            ultimoEnvio: detalle.reduce((f, d) => fechaMayor(f, d.ultimoEnvio), null),
            campaniasDetalle: detalle,
        };
    });
    /*
 * Empresas activas sin campañas: solo sin filtro de estado.
 * Con un estado elegido, se muestran solo las empresas que tienen
 * campañas en ese estado.
 */
    const conFila = new Set(resultado.map((r) => r.empresaId));
    const activas = params?.estado
        ? []
        : await prisma.empresa.findMany({
            where: {
                isActive: true,
            },
            select: {
                id_empresa: true,
                nombre: true,
            },
        });
    for (const e of activas) {
        if (conFila.has(e.id_empresa)) {
            continue;
        }
        resultado.push({
            empresaId: e.id_empresa,
            empresaNombre: e.nombre,
            campanias: 0,
            campaniasEnviadas: 0,
            destinatarios: 0,
            enviados: 0,
            aceptados: 0,
            rechazados: 0,
            revocados: 0,
            pendientes: 0,
            errores: 0,
            ultimoEnvio: null,
            campaniasDetalle: [],
        });
    }
    /*
     * Primero las empresas con campañas (envío más reciente primero),
     * luego las sin campañas por nombre; "Sin empresa" al final.
     */
    return resultado.sort((a, b) => {
        if (a.empresaId === null) {
            return 1;
        }
        if (b.empresaId === null) {
            return -1;
        }
        if ((a.campanias > 0) !==
            (b.campanias > 0)) {
            return a.campanias > 0
                ? -1
                : 1;
        }
        const fa = a.ultimoEnvio?.getTime() ??
            0;
        const fb = b.ultimoEnvio?.getTime() ??
            0;
        return fb - fa ||
            a.empresaNombre.localeCompare(b.empresaNombre, "es");
    });
}
//# sourceMappingURL=proteccion-datos.service.js.map