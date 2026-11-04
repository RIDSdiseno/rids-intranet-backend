// src/validators/leypd/leypd.schemas.ts

import {
    z,
} from "zod";

/* =====================================================
   PARAMS
===================================================== */

export const empresaIdSchema =
    z.coerce
        .number()
        .int()
        .positive();

export const numeroElementoSchema =
    z.coerce
        .number()
        .int()
        .min(1)
        .max(13);

export const actualizacionIdSchema =
    z.coerce
        .number()
        .int()
        .positive();

export const tokenLeypdSchema =
    z.string()
        .trim()
        .min(32)
        .max(256);

/* =====================================================
   ESTADOS
===================================================== */

export const estadoLeypdSchema =
    z.enum([
        "NO_INICIADO",
        "EN_PROGRESO",
        "IMPLEMENTADO",
        "NO_APLICA",
    ]);

/* =====================================================
   ELEMENTO
===================================================== */

export const actualizarElementoLeypdSchema =
    z.object({
        estado:
            estadoLeypdSchema,

        responsable:
            z.string()
                .trim()
                .max(120)
                .nullable()
                .optional(),

        fechaCompromiso:
            z.string()
                .regex(
                    /^\d{4}-\d{2}-\d{2}$/,
                    "La fecha debe tener formato YYYY-MM-DD"
                )
                .nullable()
                .optional(),

        evidencia:
            z.string()
                .trim()
                .max(1000)
                .nullable()
                .optional(),

        observaciones:
            z.string()
                .trim()
                .max(2000)
                .nullable()
                .optional(),
    });

/* =====================================================
   FICHA
===================================================== */

export const guardarFichaLeypdSchema =
    z.object({
        datos:
            z.record(
                z.string(),
                z.unknown()
            ),
    });

export const guardarFichaPublicaLeypdSchema =
    z.object({
        nombre:
            z.string()
                .trim()
                .max(120)
                .nullable()
                .optional(),

        datos:
            z.record(
                z.string(),
                z.unknown()
            ),
    });

export const enviarFichaPublicaLeypdSchema =
    z.object({
        nombre:
            z.string()
                .trim()
                .min(2)
                .max(120),

        datos:
            z.record(
                z.string(),
                z.unknown()
            ),
    });

/* =====================================================
   SHAREPOINT
===================================================== */

export const vincularSharepointLeypdSchema =
    z.object({
        url:
            z.string()
                .trim()
                .min(10)
                .max(2000)
                .refine(
                    (valor) =>
                        /^https:\/\/[^/]+\.sharepoint\.com\//i.test(
                            valor
                        ),
                    "Debe ser una URL de SharePoint"
                ),
    });