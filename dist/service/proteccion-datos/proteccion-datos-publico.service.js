// src/service/proteccion-datos/proteccion-datos-publico.service.ts
import { EstadoCampaniaProteccionDatos, EstadoConsentimientoDatos, Prisma, TipoEventoConsentimientoDatos, } from "@prisma/client";
import { prisma, } from "../../lib/prisma.js";
import { hashTokenConsentimiento, } from "./proteccion-datos-token.service.js";
import { crearUrlFirmadaDocumentoProteccionDatos, } from "./proteccion-datos-documentos.service.js";
/* =========================================================
   ERROR PÚBLICO DEL MÓDULO
   ========================================================= */
export class ProteccionDatosPublicError extends Error {
    statusCode;
    code;
    constructor(statusCode, code, message) {
        super(message);
        this.name =
            "ProteccionDatosPublicError";
        this.statusCode =
            statusCode;
        this.code =
            code;
    }
}
/* =========================================================
   JSON HELPERS
   ========================================================= */
function toPrismaJson(value) {
    return JSON.parse(JSON.stringify(value));
}
function fromPrismaJson(value) {
    if (value === null) {
        return null;
    }
    return value;
}
/* =========================================================
   TOKEN
   ========================================================= */
function validarTokenPublico(token) {
    if (typeof token !== "string" ||
        !token.trim()) {
        throw new ProteccionDatosPublicError(400, "TOKEN_INVALIDO", "El enlace de consentimiento no es válido");
    }
    /*
     * randomBytes(32).toString("hex")
     * genera 64 caracteres hexadecimales.
     */
    const tokenLimpio = token.trim();
    if (!/^[a-f0-9]{64}$/i.test(tokenLimpio)) {
        throw new ProteccionDatosPublicError(400, "TOKEN_INVALIDO", "El enlace de consentimiento no es válido");
    }
    return tokenLimpio;
}
/* =========================================================
   OBTENER CONSENTIMIENTO POR TOKEN
   ========================================================= */
async function buscarConsentimientoPorToken(token) {
    const tokenLimpio = validarTokenPublico(token);
    const tokenHash = hashTokenConsentimiento(tokenLimpio);
    const consentimiento = await prisma.consentimientoDatos.findUnique({
        where: {
            tokenHash,
        },
        include: {
            campania: {
                select: {
                    id: true,
                    nombre: true,
                    tituloDocumento: true,
                    estado: true,
                    configuracionConsentimiento: true,
                },
            },
        },
    });
    if (!consentimiento) {
        throw new ProteccionDatosPublicError(404, "CONSENTIMIENTO_NO_ENCONTRADO", "El enlace no existe o ya no es válido");
    }
    /* =====================================================
       EXPIRACIÓN DE TOKEN
       ===================================================== */
    if (consentimiento.tokenExpiresAt &&
        consentimiento.tokenExpiresAt <
            new Date()) {
        /*
         * No actualizamos aquí necesariamente a EXPIRADO.
         *
         * El estado funcional puede ser, por ejemplo,
         * ACEPTADO, mientras el token posteriormente expira.
         *
         * Por eso la expiración del token se valida
         * independientemente.
         */
        throw new ProteccionDatosPublicError(410, "TOKEN_EXPIRADO", "El enlace de consentimiento ha expirado");
    }
    return consentimiento;
}
/* =========================================================
   VALIDAR CAMPAÑA
   ========================================================= */
function validarCampaniaPublica(estado) {
    if (estado ===
        EstadoCampaniaProteccionDatos.CANCELADA) {
        throw new ProteccionDatosPublicError(410, "CAMPANIA_CANCELADA", "Esta campaña ya no se encuentra disponible");
    }
    /*
     * Permitimos ACTIVA y FINALIZADA para consulta.
     *
     * Una campaña finalizada puede seguir necesitando
     * mostrar una respuesta histórica ya registrada.
     */
}
/* =========================================================
   CONFIGURACIÓN
   ========================================================= */
function obtenerConfiguracion(value) {
    return fromPrismaJson(value);
}
/* =========================================================
   PREPARAR CONFIGURACIÓN PARA EL CLIENTE PÚBLICO
   ========================================================= */
async function prepararConfiguracionPublica(configuracion) {
    if (!configuracion) {
        return null;
    }
    const campos = await Promise.all(configuracion.campos.map(async (campo) => {
        /* =================================================
           CAMPO SIN DOCUMENTOS
           ================================================= */
        if (!campo.documentos ||
            campo.documentos.length ===
                0) {
            return {
                ...campo,
                documentos: [],
            };
        }
        /* =================================================
           GENERAR URLs FIRMADAS
           ================================================= */
        const documentos = await Promise.all(campo.documentos.map(async (documento) => {
            const url = await crearUrlFirmadaDocumentoProteccionDatos(documento.path, 
            /*
             * 1 hora.
             */
            3600);
            return {
                titulo: documento.titulo,
                nombre: documento.nombre,
                contentType: documento.contentType,
                size: documento.size,
                sha256: documento.sha256,
                /*
                 * URL temporal.
                 *
                 * No exponemos el path
                 * interno del bucket.
                 */
                url,
            };
        }));
        return {
            ...campo,
            documentos,
        };
    }));
    return {
        ...configuracion,
        campos,
    };
}
/* =========================================================
   VALIDAR RESPUESTA CONTRA CONFIGURACIÓN
   ========================================================= */
function validarRespuesta(input, configuracion) {
    /* =====================================================
       ESTRUCTURA GENERAL
       ===================================================== */
    if (!input ||
        typeof input !==
            "object") {
        throw new ProteccionDatosPublicError(400, "RESPUESTA_INVALIDA", "La respuesta enviada no es válida");
    }
    if (typeof input.aceptado !==
        "boolean") {
        throw new ProteccionDatosPublicError(400, "RESPUESTA_INVALIDA", "Debes indicar una decisión");
    }
    if (!input.respuestas ||
        typeof input.respuestas !==
            "object" ||
        Array.isArray(input.respuestas)) {
        throw new ProteccionDatosPublicError(400, "RESPUESTAS_INVALIDAS", "Las respuestas del formulario no son válidas");
    }
    if (!configuracion) {
        return;
    }
    /* =====================================================
       MAPA DE CAMPOS
       ===================================================== */
    const camposPorKey = new Map(configuracion.campos.map((campo) => [
        campo.key,
        campo,
    ]));
    /* =====================================================
       NO ACEPTAR CAMPOS DESCONOCIDOS
       ===================================================== */
    for (const key of Object.keys(input.respuestas)) {
        if (!camposPorKey.has(key)) {
            throw new ProteccionDatosPublicError(400, "CAMPO_DESCONOCIDO", `El campo "${key}" no pertenece a este formulario`);
        }
    }
    /* =====================================================
       VALIDAR CAMPOS
       ===================================================== */
    for (const campo of configuracion.campos) {
        const valor = input.respuestas[campo.key];
        /* =================================================
           TEXT
           ================================================= */
        if (campo.tipo ===
            "TEXT") {
            if (valor !==
                undefined &&
                typeof valor !==
                    "string") {
                throw new ProteccionDatosPublicError(400, "VALOR_INVALIDO", `"${campo.label}" no tiene un valor válido`);
            }
            if (campo.obligatorio &&
                (typeof valor !==
                    "string" ||
                    !valor.trim())) {
                throw new ProteccionDatosPublicError(400, "CAMPO_REQUERIDO", `"${campo.label}" es obligatorio`);
            }
            continue;
        }
        /* =================================================
           CHECKBOX
           ================================================= */
        if (campo.tipo ===
            "CHECKBOX") {
            if (valor !==
                undefined &&
                typeof valor !==
                    "boolean") {
                throw new ProteccionDatosPublicError(400, "VALOR_INVALIDO", `"${campo.label}" no tiene un valor válido`);
            }
            if (input.aceptado &&
                campo.obligatorio &&
                valor !==
                    true) {
                throw new ProteccionDatosPublicError(400, "CAMPO_REQUERIDO", `Debes confirmar "${campo.label}"`);
            }
            continue;
        }
        /* =================================================
           RADIO
           ================================================= */
        if (campo.tipo ===
            "RADIO") {
            if (campo.obligatorio &&
                (typeof valor !==
                    "string" ||
                    !valor.trim())) {
                throw new ProteccionDatosPublicError(400, "CAMPO_REQUERIDO", `Debes responder "${campo.label}"`);
            }
            if (valor ===
                undefined) {
                continue;
            }
            if (typeof valor !==
                "string") {
                throw new ProteccionDatosPublicError(400, "VALOR_INVALIDO", `"${campo.label}" no tiene un valor válido`);
            }
            const opcionExiste = campo.opciones?.some((opcion) => opcion.value ===
                valor) ??
                false;
            if (!opcionExiste) {
                throw new ProteccionDatosPublicError(400, "OPCION_INVALIDA", `La opción seleccionada en "${campo.label}" no es válida`);
            }
        }
    }
}
/* =========================================================
   SERIALIZAR RESPUESTA PÚBLICA
   ========================================================= */
async function construirRespuestaPublica(consentimiento) {
    const configuracionBase = obtenerConfiguracion(consentimiento
        .campania
        .configuracionConsentimiento);
    const configuracion = await prepararConfiguracionPublica(configuracionBase);
    return {
        nombre: consentimiento.nombre,
        email: consentimiento.email,
        empresaNombre: consentimiento.empresaNombre,
        documento: {
            titulo: consentimiento
                .campania
                .tituloDocumento,
            version: consentimiento
                .versionDocumento,
            html: consentimiento
                .snapshotDocumentoHtml,
            hash: consentimiento
                .documentoHash,
        },
        configuracion,
        estado: consentimiento.estado,
        respondido: consentimiento
            .fechaRespuesta !==
            null,
        fechaRespuesta: consentimiento
            .fechaRespuesta,
        fechaRevocacion: consentimiento
            .fechaRevocacion,
        respuesta: fromPrismaJson(consentimiento
            .respuestaJson),
    };
}
/* =========================================================
   GET PÚBLICO
   ========================================================= */
export async function obtenerConsentimientoPublico(token, contexto) {
    const consentimiento = await buscarConsentimientoPorToken(token);
    validarCampaniaPublica(consentimiento
        .campania
        .estado);
    /* =====================================================
       PRIMERA APERTURA
       ===================================================== */
    if (consentimiento
        .fechaAperturaFormulario ===
        null) {
        const ahora = new Date();
        /*
         * updateMany nos permite actualizar solamente
         * si otra request concurrente no lo hizo antes.
         */
        const resultado = await prisma.consentimientoDatos.updateMany({
            where: {
                id: consentimiento.id,
                fechaAperturaFormulario: null,
            },
            data: {
                fechaAperturaFormulario: ahora,
            },
        });
        /*
         * Solamente la request que realmente hizo
         * el update genera FORMULARIO_ABIERTO.
         */
        if (resultado.count ===
            1) {
            await prisma.consentimientoDatosEvento.create({
                data: {
                    consentimientoId: consentimiento.id,
                    tipo: TipoEventoConsentimientoDatos
                        .FORMULARIO_ABIERTO,
                    ip: contexto?.ip ??
                        null,
                    userAgent: contexto
                        ?.userAgent ??
                        null,
                },
            });
        }
        consentimiento.fechaAperturaFormulario =
            ahora;
    }
    return await construirRespuestaPublica(consentimiento);
}
/* =========================================================
   RESPONDER CONSENTIMIENTO
   ========================================================= */
export async function responderConsentimientoPublico(token, input, contexto) {
    const consentimiento = await buscarConsentimientoPorToken(token);
    validarCampaniaPublica(consentimiento
        .campania
        .estado);
    /* =====================================================
       SOLO CAMPAÑA ACTIVA PUEDE RECIBIR RESPUESTAS NUEVAS
       ===================================================== */
    if (consentimiento
        .campania
        .estado !==
        EstadoCampaniaProteccionDatos.ACTIVA) {
        throw new ProteccionDatosPublicError(409, "CAMPANIA_NO_ACTIVA", "La campaña ya no acepta nuevas respuestas");
    }
    /* =====================================================
       ESTADO RESPONDIBLE
       ===================================================== */
    if (consentimiento.estado !==
        EstadoConsentimientoDatos.ENVIADO &&
        consentimiento.estado !==
            EstadoConsentimientoDatos.PENDIENTE) {
        throw new ProteccionDatosPublicError(409, "RESPUESTA_YA_REGISTRADA", "Este consentimiento ya tiene una respuesta registrada");
    }
    const configuracion = obtenerConfiguracion(consentimiento
        .campania
        .configuracionConsentimiento);
    validarRespuesta(input, configuracion);
    const ahora = new Date();
    const nuevoEstado = input.aceptado
        ? EstadoConsentimientoDatos
            .ACEPTADO
        : EstadoConsentimientoDatos
            .RECHAZADO;
    const tipoEvento = input.aceptado
        ? TipoEventoConsentimientoDatos
            .ACEPTADO
        : TipoEventoConsentimientoDatos
            .RECHAZADO;
    /* =====================================================
       TRANSACCIÓN + BLOQUEO LÓGICO CONTRA DOBLE RESPUESTA
       ===================================================== */
    await prisma.$transaction(async (tx) => {
        /*
         * El update es condicionado.
         *
         * Solo podrá modificar:
         * PENDIENTE o ENVIADO.
         *
         * Si dos requests intentan responder
         * simultáneamente, solo una debería
         * encontrar el estado original.
         */
        const actualizado = await tx.consentimientoDatos.updateMany({
            where: {
                id: consentimiento.id,
                estado: {
                    in: [
                        EstadoConsentimientoDatos
                            .PENDIENTE,
                        EstadoConsentimientoDatos
                            .ENVIADO,
                    ],
                },
                fechaRespuesta: null,
            },
            data: {
                estado: nuevoEstado,
                aceptado: input.aceptado,
                fechaRespuesta: ahora,
                ipRespuesta: contexto?.ip ??
                    null,
                userAgent: contexto
                    ?.userAgent ??
                    null,
                respuestaJson: toPrismaJson(input),
            },
        });
        if (actualizado.count !==
            1) {
            throw new ProteccionDatosPublicError(409, "RESPUESTA_YA_REGISTRADA", "Este consentimiento ya tiene una respuesta registrada");
        }
        await tx.consentimientoDatosEvento.create({
            data: {
                consentimientoId: consentimiento.id,
                tipo: tipoEvento,
                detalle: toPrismaJson({
                    aceptado: input.aceptado,
                    respuestas: input.respuestas,
                }),
                ip: contexto?.ip ??
                    null,
                userAgent: contexto
                    ?.userAgent ??
                    null,
            },
        });
    });
    /*
     * Recuperamos el estado realmente persistido.
     */
    const actualizado = await buscarConsentimientoPorToken(token);
    return await construirRespuestaPublica(actualizado);
}
/* =========================================================
   REVOCAR
   ========================================================= */
export async function revocarConsentimientoPublico(token, input, contexto) {
    const consentimiento = await buscarConsentimientoPorToken(token);
    validarCampaniaPublica(consentimiento
        .campania
        .estado);
    /* =====================================================
       SOLO CONSENTIMIENTO ACEPTADO
       ===================================================== */
    if (consentimiento.estado !==
        EstadoConsentimientoDatos.ACEPTADO) {
        if (consentimiento.estado ===
            EstadoConsentimientoDatos.REVOCADO) {
            throw new ProteccionDatosPublicError(409, "YA_REVOCADO", "Este consentimiento ya fue revocado");
        }
        throw new ProteccionDatosPublicError(409, "NO_REVOCABLE", "Solo un consentimiento aceptado puede ser revocado");
    }
    const motivo = typeof input?.motivo ===
        "string"
        ? input.motivo
            .trim()
            .slice(0, 1000)
        : null;
    const ahora = new Date();
    await prisma.$transaction(async (tx) => {
        const actualizado = await tx.consentimientoDatos.updateMany({
            where: {
                id: consentimiento.id,
                estado: EstadoConsentimientoDatos
                    .ACEPTADO,
                fechaRevocacion: null,
            },
            data: {
                estado: EstadoConsentimientoDatos
                    .REVOCADO,
                fechaRevocacion: ahora,
                /*
                 * IMPORTANTE:
                 *
                 * NO tocamos:
                 *
                 * aceptado
                 * fechaRespuesta
                 * respuestaJson
                 *
                 * porque representan la
                 * aceptación histórica.
                 */
            },
        });
        if (actualizado.count !==
            1) {
            throw new ProteccionDatosPublicError(409, "YA_REVOCADO", "El consentimiento ya fue revocado");
        }
        await tx.consentimientoDatosEvento.create({
            data: {
                consentimientoId: consentimiento.id,
                tipo: TipoEventoConsentimientoDatos
                    .REVOCADO,
                detalle: motivo
                    ? toPrismaJson({
                        motivo,
                    })
                    : Prisma.JsonNull,
                ip: contexto?.ip ??
                    null,
                userAgent: contexto
                    ?.userAgent ??
                    null,
            },
        });
    });
    const actualizado = await buscarConsentimientoPorToken(token);
    return await construirRespuestaPublica(actualizado);
}
//# sourceMappingURL=proteccion-datos-publico.service.js.map