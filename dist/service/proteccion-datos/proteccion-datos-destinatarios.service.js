// src/service/proteccion-datos/proteccion-datos-destinatarios.service.ts
import { EstadoCampaniaProteccionDatos, EstadoConsentimientoDatos, TipoEventoConsentimientoDatos, } from "@prisma/client";
import { prisma, } from "../../lib/prisma.js";
/* =========================================================
   HELPERS
   ========================================================= */
function validarId(value, nombre) {
    if (!Number.isInteger(value) ||
        value <= 0) {
        throw new Error(`${nombre} inválido`);
    }
}
function normalizarEmail(value) {
    return value
        .trim()
        .toLowerCase();
}
function emailValido(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
/* =========================================================
   OBTENER CAMPAÑA PARA EDICIÓN DE DESTINATARIOS
   ========================================================= */
async function obtenerCampaniaEditable(campaniaId) {
    validarId(campaniaId, "ID de campaña");
    const campania = await prisma.campaniaProteccionDatos.findUnique({
        where: {
            id: campaniaId,
        },
        select: {
            id: true,
            estado: true,
            versionDocumento: true,
            documentoHash: true,
            contenidoHtml: true,
        },
    });
    if (!campania) {
        throw new Error("Campaña de protección de datos no encontrada");
    }
    if (campania.estado !==
        EstadoCampaniaProteccionDatos.BORRADOR) {
        throw new Error("Los destinatarios solo pueden modificarse mientras la campaña está en BORRADOR");
    }
    return campania;
}
/* =========================================================
   AGREGAR DESTINATARIOS
   ========================================================= */
export async function agregarDestinatariosCampania(campaniaId, input) {
    const campania = await obtenerCampaniaEditable(campaniaId);
    /* =====================================================
       VALIDAR INPUT
       ===================================================== */
    if (!input ||
        !Array.isArray(input.solicitanteIds)) {
        throw new Error("solicitanteIds debe ser un arreglo");
    }
    if (input.solicitanteIds.length ===
        0) {
        throw new Error("Debes seleccionar al menos un solicitante");
    }
    /*
     * Eliminamos duplicados y IDs inválidos.
     */
    const idsUnicos = [
        ...new Set(input.solicitanteIds),
    ];
    const idsValidos = idsUnicos.filter((id) => Number.isInteger(id) &&
        id > 0);
    if (idsValidos.length ===
        0) {
        throw new Error("No se recibieron IDs de solicitantes válidos");
    }
    const omitidos = [];
    /*
     * Registramos también los IDs inválidos enviados.
     */
    for (const id of idsUnicos) {
        if (!Number.isInteger(id) ||
            id <= 0) {
            omitidos.push({
                solicitanteId: Number(id),
                motivo: "ID de solicitante inválido",
            });
        }
    }
    /* =====================================================
       OBTENER SOLICITANTES
       ===================================================== */
    const solicitantes = await prisma.solicitante.findMany({
        where: {
            id_solicitante: {
                in: idsValidos,
            },
        },
        select: {
            id_solicitante: true,
            nombre: true,
            email: true,
            empresaId: true,
            isActive: true,
            deletedAt: true,
            deactivatedAt: true,
            empresa: {
                select: {
                    id_empresa: true,
                    nombre: true,
                    isActive: true,
                    deactivatedAt: true,
                },
            },
        },
    });
    /* =====================================================
       DETECTAR SOLICITANTES INEXISTENTES
       ===================================================== */
    const idsEncontrados = new Set(solicitantes.map((solicitante) => solicitante.id_solicitante));
    for (const id of idsValidos) {
        if (!idsEncontrados.has(id)) {
            omitidos.push({
                solicitanteId: id,
                motivo: "Solicitante no encontrado",
            });
        }
    }
    /* =====================================================
       EMAILS YA EXISTENTES EN LA CAMPAÑA
       ===================================================== */
    const existentes = await prisma.consentimientoDatos.findMany({
        where: {
            campaniaId: campania.id,
        },
        select: {
            email: true,
        },
    });
    const emailsUtilizados = new Set(existentes.map((item) => normalizarEmail(item.email)));
    /* =====================================================
       PREPARAR DESTINATARIOS VÁLIDOS
       ===================================================== */
    const validos = [];
    for (const solicitante of solicitantes) {
        /* -------------------------------------------------
           SOLICITANTE ACTIVO
           ------------------------------------------------- */
        if (!solicitante.isActive ||
            solicitante.deletedAt !==
                null ||
            solicitante.deactivatedAt !==
                null) {
            omitidos.push({
                solicitanteId: solicitante.id_solicitante,
                motivo: "Solicitante inactivo o eliminado",
            });
            continue;
        }
        /* -------------------------------------------------
           EMPRESA
           ------------------------------------------------- */
        if (!solicitante.empresa) {
            omitidos.push({
                solicitanteId: solicitante.id_solicitante,
                motivo: "El solicitante no tiene una empresa válida asociada",
            });
            continue;
        }
        if (!solicitante.empresa.isActive ||
            solicitante
                .empresa
                .deactivatedAt !==
                null) {
            omitidos.push({
                solicitanteId: solicitante.id_solicitante,
                motivo: "La empresa del solicitante se encuentra inactiva",
            });
            continue;
        }
        /* -------------------------------------------------
           EMAIL
           ------------------------------------------------- */
        if (!solicitante.email ||
            !solicitante.email.trim()) {
            omitidos.push({
                solicitanteId: solicitante.id_solicitante,
                motivo: "Solicitante sin correo electrónico",
            });
            continue;
        }
        const email = normalizarEmail(solicitante.email);
        if (!emailValido(email)) {
            omitidos.push({
                solicitanteId: solicitante.id_solicitante,
                motivo: "El correo electrónico del solicitante no es válido",
            });
            continue;
        }
        /* -------------------------------------------------
           DUPLICADO POR EMAIL
           ------------------------------------------------- */
        if (emailsUtilizados.has(email)) {
            omitidos.push({
                solicitanteId: solicitante.id_solicitante,
                motivo: "Este correo ya se encuentra agregado a la campaña",
            });
            continue;
        }
        /*
         * Lo agregamos inmediatamente al Set para evitar
         * duplicados dentro del mismo lote.
         */
        emailsUtilizados.add(email);
        validos.push({
            solicitanteId: solicitante.id_solicitante,
            empresaId: solicitante.empresa.id_empresa,
            nombre: solicitante.nombre,
            email,
            empresaNombre: solicitante.empresa.nombre,
        });
    }
    /* =====================================================
       NINGÚN DESTINATARIO VÁLIDO
       ===================================================== */
    if (validos.length ===
        0) {
        return {
            agregados: 0,
            omitidos,
        };
    }
    /* =====================================================
       CREAR CONSENTIMIENTOS
       ===================================================== */
    const agregados = await prisma.$transaction(async (tx) => {
        let cantidad = 0;
        for (const destinatario of validos) {
            const consentimiento = await tx.consentimientoDatos.create({
                data: {
                    campaniaId: campania.id,
                    solicitanteId: destinatario.solicitanteId,
                    empresaId: destinatario.empresaId,
                    /* =============================
                       SNAPSHOT DESTINATARIO
                       ============================= */
                    nombre: destinatario.nombre,
                    email: destinatario.email,
                    empresaNombre: destinatario.empresaNombre,
                    /* =============================
                       TOKEN

                       Se genera recién al enviar.
                       ============================= */
                    tokenHash: null,
                    tokenExpiresAt: null,
                    /* =============================
                       ESTADO
                       ============================= */
                    estado: EstadoConsentimientoDatos
                        .PENDIENTE,
                    /* =============================
                       SNAPSHOT DOCUMENTO
                       ============================= */
                    versionDocumento: campania.versionDocumento,
                    documentoHash: campania.documentoHash,
                    snapshotDocumentoHtml: campania.contenidoHtml,
                },
                select: {
                    id: true,
                    solicitanteId: true,
                    email: true,
                },
            });
            /* =========================================
               EVENTO CREADO
               ========================================= */
            await tx.consentimientoDatosEvento.create({
                data: {
                    consentimientoId: consentimiento.id,
                    tipo: TipoEventoConsentimientoDatos
                        .CREADO,
                    detalle: {
                        origen: "CRM",
                        solicitanteId: consentimiento.solicitanteId,
                        email: consentimiento.email,
                    },
                },
            });
            cantidad++;
        }
        return cantidad;
    });
    return {
        agregados,
        omitidos,
    };
}
/* =========================================================
   LISTAR DESTINATARIOS DE UNA CAMPAÑA
   ========================================================= */
export async function listarDestinatariosCampania(campaniaId) {
    validarId(campaniaId, "ID de campaña");
    const campania = await prisma.campaniaProteccionDatos.findUnique({
        where: {
            id: campaniaId,
        },
        select: {
            id: true,
            nombre: true,
            estado: true,
        },
    });
    if (!campania) {
        throw new Error("Campaña de protección de datos no encontrada");
    }
    const destinatarios = await prisma.consentimientoDatos.findMany({
        where: {
            campaniaId: campania.id,
        },
        orderBy: [
            {
                createdAt: "desc",
            },
            {
                id: "desc",
            },
        ],
        select: {
            id: true,
            solicitanteId: true,
            empresaId: true,
            nombre: true,
            email: true,
            empresaNombre: true,
            estado: true,
            fechaEnvio: true,
            fechaAperturaFormulario: true,
            fechaRespuesta: true,
            fechaRevocacion: true,
            aceptado: true,
            versionDocumento: true,
            evidenciaPath: true,
            createdAt: true,
            updatedAt: true,
            respuestaJson: true,
            documentoHash: true,
        },
    });
    return {
        campania: {
            id: campania.id,
            nombre: campania.nombre,
            estado: campania.estado,
        },
        total: destinatarios.length,
        destinatarios,
    };
}
/* =========================================================
   HISTORIAL DE EVENTOS DE UN CONSENTIMIENTO
   ========================================================= */
export async function listarEventosConsentimiento(campaniaId, consentimientoId) {
    validarId(campaniaId, "ID de campaña");
    validarId(consentimientoId, "ID de consentimiento");
    /* =====================================================
       VALIDAR CAMPAÑA
       ===================================================== */
    const campania = await prisma
        .campaniaProteccionDatos
        .findUnique({
        where: {
            id: campaniaId,
        },
        select: {
            id: true,
            nombre: true,
        },
    });
    if (!campania) {
        throw new Error("Campaña de protección de datos no encontrada");
    }
    /* =====================================================
       VALIDAR CONSENTIMIENTO
       ===================================================== */
    const consentimiento = await prisma
        .consentimientoDatos
        .findFirst({
        where: {
            id: consentimientoId,
            campaniaId: campania.id,
        },
        select: {
            id: true,
            estado: true,
            aceptado: true,
            fechaRespuesta: true,
            fechaRevocacion: true,
        },
    });
    if (!consentimiento) {
        throw new Error("El consentimiento no pertenece a esta campaña");
    }
    /* =====================================================
       EVENTOS
       ===================================================== */
    const eventos = await prisma
        .consentimientoDatosEvento
        .findMany({
        where: {
            consentimientoId: consentimiento.id,
        },
        orderBy: [
            {
                createdAt: "asc",
            },
            {
                id: "asc",
            },
        ],
        select: {
            id: true,
            tipo: true,
            detalle: true,
            ip: true,
            userAgent: true,
            createdAt: true,
        },
    });
    return {
        consentimiento: {
            id: consentimiento.id,
            estadoActual: consentimiento.estado,
            aceptadoOriginalmente: consentimiento.aceptado,
            fechaRespuesta: consentimiento.fechaRespuesta,
            fechaRevocacion: consentimiento.fechaRevocacion,
        },
        eventos,
    };
}
/* =========================================================
   QUITAR DESTINATARIO
   ========================================================= */
export async function quitarDestinatarioCampania(campaniaId, consentimientoId) {
    validarId(campaniaId, "ID de campaña");
    validarId(consentimientoId, "ID de consentimiento");
    const campania = await obtenerCampaniaEditable(campaniaId);
    const consentimiento = await prisma.consentimientoDatos.findFirst({
        where: {
            id: consentimientoId,
            campaniaId: campania.id,
        },
        select: {
            id: true,
            estado: true,
            fechaEnvio: true,
            fechaRespuesta: true,
            tokenHash: true,
        },
    });
    if (!consentimiento) {
        throw new Error("El destinatario no pertenece a esta campaña");
    }
    /*
     * Por seguridad no basta con que la campaña
     * siga en BORRADOR.
     *
     * El consentimiento además debe seguir intacto.
     */
    if (consentimiento.estado !==
        EstadoConsentimientoDatos.PENDIENTE ||
        consentimiento.fechaEnvio !==
            null ||
        consentimiento.fechaRespuesta !==
            null ||
        consentimiento.tokenHash !==
            null) {
        throw new Error("Este destinatario ya tiene actividad registrada y no puede eliminarse");
    }
    /*
     * ConsentimientoDatosEvento tiene onDelete Cascade
     * respecto de ConsentimientoDatos, por lo que el evento
     * CREADO también desaparecerá.
     *
     * Esto es aceptable porque la campaña sigue BORRADOR
     * y nunca se ha enviado ni respondido.
     */
    await prisma.consentimientoDatos.delete({
        where: {
            id: consentimiento.id,
        },
    });
    return {
        ok: true,
        consentimientoId: consentimiento.id,
    };
}
//# sourceMappingURL=proteccion-datos-destinatarios.service.js.map