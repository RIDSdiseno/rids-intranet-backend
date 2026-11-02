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
     * Pregunta 4:
     * correo + teléfono oficiales
     */
    const contactoOficialTexto =
        contactoPrincipal
            ? [
                contactoPrincipal.email,

                // Utiliza esta propiedad solamente
                // si existe realmente en ContactoEmpresa.
                contactoPrincipal.telefono,
            ]
                .filter(Boolean)
                .join(" · ")
            : null;

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