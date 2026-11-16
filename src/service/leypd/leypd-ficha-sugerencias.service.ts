// src/service/leypd/leypd-ficha-sugerencias.service.ts

import {
    prisma,
} from "../../lib/prisma.js";

export interface SugerenciaFichaLeypd {
    valor:
    | string
    | number
    | boolean
    | null;

    fuente:
    "CRM";

    confirmado:
    false;

    actualizadoPor:
    null;

    fecha:
    null;
}

function sugerencia(
    valor:
        | string
        | number
        | boolean
        | null
): SugerenciaFichaLeypd {
    return {
        valor,
        fuente:
            "CRM",
        confirmado:
            false,
        actualizadoPor:
            null,
        fecha:
            null,
    };
}

/* =====================================================
   CONTACTOS DEL CRM (selector de las preguntas 4, 9, 10 y 11)
===================================================== */

export interface ContactoFichaLeypd {
    id: number;
    nombre: string;
    cargo: string;
    email: string | null;
    telefono: string | null;
    principal: boolean;
    sucursal: string | null;
}

export interface ContactosFichaLeypd {
    /** Correo y teléfono de la empresa (ficha de empresa › Cliente). */
    contactoEmpresa: {
        email: string | null;
        telefono: string | null;
    } | null;

    /** Contactos de la ficha de empresa, principal primero. */
    contactos: ContactoFichaLeypd[];
}

/**
 * Datos para que RIDS elija un contacto del CRM en la ficha Ley PD.
 * No se guardan solos: solo completan el texto de la pregunta.
 */
export async function obtenerContactosFichaLeypd(
    empresaId: number
): Promise<ContactosFichaLeypd> {
    const [
        detalle,
        contactos,
    ] =
        await Promise.all([
            prisma.detalleEmpresa.findUnique({
                where: {
                    empresa_id:
                        empresaId,
                },

                select: {
                    email:
                        true,

                    telefono:
                        true,
                },
            }),

            prisma.contactoEmpresa.findMany({
                where: {
                    empresaId,
                },

                select: {
                    id:
                        true,

                    nombre:
                        true,

                    cargo:
                        true,

                    email:
                        true,

                    telefono:
                        true,

                    principal:
                        true,

                    sucursal: {
                        select: {
                            nombre:
                                true,
                        },
                    },
                },

                orderBy: [
                    {
                        principal:
                            "desc",
                    },
                    {
                        nombre:
                            "asc",
                    },
                ],
            }),
        ]);

    const email =
        detalle?.email?.trim() ||
        null;

    const telefono =
        detalle?.telefono?.trim() ||
        null;

    return {
        contactoEmpresa:
            email ||
                telefono
                ? {
                    email,
                    telefono,
                }
                : null,

        contactos:
            contactos.map(
                (contacto) => ({
                    id:
                        contacto.id,

                    nombre:
                        contacto.nombre,

                    cargo:
                        contacto.cargo,

                    email:
                        contacto.email?.trim() ||
                        null,

                    telefono:
                        contacto.telefono?.trim() ||
                        null,

                    principal:
                        contacto.principal,

                    sucursal:
                        contacto.sucursal?.nombre ??
                        null,
                })
            ),
    };
}

/* =====================================================
   SUGERENCIAS
===================================================== */

export async function obtenerSugerenciasFichaLeypd(
    empresaId: number
) {
    const empresa =
        await prisma.empresa.findUnique({
            where: {
                id_empresa:
                    empresaId,
            },

            include: {
                detalleEmpresa:
                    true,

                fichaTecnicaEmpresa:
                    true,

                contactoEmpresas: {
                    where: {
                        principal:
                            true,
                    },

                    take:
                        1,
                },
            },
        });

    if (!empresa) {
        throw new Error(
            "EMPRESA_NO_ENCONTRADA"
        );
    }

    const contactoPrincipal =
        empresa.contactoEmpresas[0] ??
        null;

    /*
  * Pregunta 4: correo y teléfono de la EMPRESA
  * (detalle_empresas), igual que el worker (ficha.py → desde_crm).
  * Se publica en el aviso legal: nunca el de una persona.
  * Para usar un contacto, RIDS lo elige en el selector.
  */
    const contactoOficialTexto =
        [
            empresa.detalleEmpresa?.email,
            empresa.detalleEmpresa?.telefono,
        ]
            .map((v) => v?.trim())
            .filter(Boolean)
            .join(" · ") ||
        null;

    /*
     * Preguntas 9 y 10:
     * responsable humano
     */
    const responsableTexto =
        contactoPrincipal
            ? [
                contactoPrincipal.nombre,
                contactoPrincipal.cargo,
                contactoPrincipal.telefono,
                contactoPrincipal.email,
            ]
                .filter(Boolean)
                .join(" · ")
            : null;

    return {
        razonSocial:
            sugerencia(
                empresa.razonSocial ??
                empresa.nombre
            ),

        rut:
            sugerencia(
                empresa.detalleEmpresa
                    ?.rut ??
                null
            ),

        domicilioLegal:
            sugerencia(
                empresa.detalleEmpresa
                    ?.direccion ??
                null
            ),

        sitioWeb:
            sugerencia(
                empresa
                    .fichaTecnicaEmpresa
                    ?.dominioWeb ??
                empresa.dominios[0] ??
                null
            ),

        hostingProveedor:
            sugerencia(
                empresa
                    .fichaTecnicaEmpresa
                    ?.hostingProveedor ??
                null
            ),

        contactoOficialEmpresa:
            sugerencia(
                contactoOficialTexto
            ),

        responsableDerechosTitulares:
            sugerencia(
                responsableTexto
            ),

        responsableIncidentesSeguridad:
            sugerencia(
                responsableTexto
            ),
    };
}