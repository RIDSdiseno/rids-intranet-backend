// src/service/leypd/leypd-sharepoint.service.ts

import type {
    Prisma,
} from "@prisma/client";

import {
    prisma,
} from "../../lib/prisma.js";

import {
    LEYPD_ELEMENTOS,
    formatearNumeroLeypd,
    type LeypdCatalogoItem,
} from "./leypd-catalogo.js";

import {
    listarHijosCarpeta,
    resolverCarpetaDesdeUrl,
    type DriveItemGraph,
} from "../../ms/sharepoint.js";

/* =====================================================
   TIPOS
===================================================== */

export type DocumentoSharepointLeypd = {
    nombre: string;
    webUrl: string;
    tamano: number | null;
    modificadoAt: string | null;
    esCarpeta: boolean;
};

export type ElementoSharepointLeypd = {
    numero: number;
    carpetaEsperada: string;
    existe: boolean;
    itemId: string | null;
    webUrl: string | null;
    documentos: DocumentoSharepointLeypd[];

    /** Documentos esperados que no se encontraron. */
    faltantes: string[];

    /** Documentos condicionales que no se encontraron. */
    opcionalesFaltantes: string[];
};

type DocumentoEsperado = {
    etiqueta: string;
    prefijo: string;
    opcional: boolean;
    esCarpeta: boolean;
};

/* =====================================================
   HELPERS
===================================================== */

/**
 * Normaliza para comparar nombres:
 * sin tildes, minúsculas, espacios simples.
 */
function normalizarNombre(
    valor: string
): string {
    return valor
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Documentos esperados de un elemento, según el catálogo.
 *
 * Se comparan por PREFIJO porque el sufijo de cliente
 * (p.ej. "_ALIANZ") puede no coincidir con el nombre
 * de la empresa en el CRM.
 */
function documentosEsperados(
    catalogo: LeypdCatalogoItem
): DocumentoEsperado[] {
    const nn =
        formatearNumeroLeypd(
            catalogo.numero
        );

    const base: DocumentoEsperado[] = [
        {
            etiqueta: `00 Ficha Elemento ${nn}`,
            prefijo: normalizarNombre(`00 Ficha Elemento ${nn}`),
            opcional: false,
            esCarpeta: false,
        },
        {
            etiqueta: `00 Informe RIDS Elemento ${nn}`,
            prefijo: normalizarNombre(`00 Informe RIDS Elemento ${nn}`),
            opcional: false,
            esCarpeta: false,
        },
    ];

    const delCatalogo =
        catalogo.documentos
            /*
             * Los documentos dentro de subcarpetas
             * no se revisan en esta versión.
             */
            .filter((d) => !d.subcarpeta)
            .map((d): DocumentoEsperado => {
                if (d.tipo === "CARPETA") {
                    return {
                        etiqueta: d.nombreBase,
                        prefijo: normalizarNombre(d.nombreBase),
                        opcional: Boolean(d.condicional),
                        esCarpeta: true,
                    };
                }

                const etiqueta =
                    `${String(d.orden).padStart(2, "0")} ${d.nombreBase}`;

                return {
                    etiqueta,
                    prefijo: normalizarNombre(etiqueta),
                    opcional: Boolean(d.condicional),
                    esCarpeta: false,
                };
            });

    return [
        ...base,
        ...delCatalogo,
    ];
}

function aDocumento(
    item: DriveItemGraph
): DocumentoSharepointLeypd {
    return {
        nombre: item.name,
        webUrl: item.webUrl,
        tamano: item.size ?? null,
        modificadoAt: item.lastModifiedDateTime ?? null,
        esCarpeta: Boolean(item.folder),
    };
}

/**
 * Busca un documento esperado entre los hijos de la carpeta.
 * Las carpetas pueden venir con o sin prefijo de orden
 * (p.ej. "Comunicacion_Usuarios" o "04 Comunicacion_Usuarios").
 */
function existeDocumento(
    esperado: DocumentoEsperado,
    hijos: DriveItemGraph[]
): boolean {
    return hijos.some((hijo) => {
        const nombre =
            normalizarNombre(hijo.name);

        if (esperado.esCarpeta) {
            return (
                Boolean(hijo.folder) &&
                (nombre === esperado.prefijo ||
                    nombre.endsWith(` ${esperado.prefijo}`))
            );
        }

        return (
            !hijo.folder &&
            nombre.startsWith(esperado.prefijo)
        );
    });
}

function leerElementosGuardados(
    valor: Prisma.JsonValue
): Record<string, ElementoSharepointLeypd> {
    if (
        !valor ||
        typeof valor !== "object" ||
        Array.isArray(valor)
    ) {
        return {};
    }

    return valor as unknown as Record<
        string,
        ElementoSharepointLeypd
    >;
}

async function asegurarEmpresa(
    empresaId: number
) {
    const empresa =
        await prisma.empresa.findUnique({
            where: {
                id_empresa: empresaId,
            },
            select: {
                id_empresa: true,
            },
        });

    if (!empresa) {
        throw new Error(
            "EMPRESA_NO_ENCONTRADA"
        );
    }
}

/* =====================================================
   OBTENER
===================================================== */

export async function obtenerSharepointLeypd(
    empresaId: number
) {
    await asegurarEmpresa(empresaId);

    const registro =
        await prisma.leypdSharepoint.findUnique({
            where: {
                empresaId,
            },
        });

    if (!registro) {
        return {
            vinculado: false,
            carpeta: null,
            checklist: null,
            sincronizadoAt: null,
            ultimoError: null,
            elementos: [] as ElementoSharepointLeypd[],
        };
    }

    const guardados =
        leerElementosGuardados(
            registro.elementos
        );

    return {
        vinculado: true,

        carpeta: {
            nombre: registro.carpetaNombre,
            webUrl: registro.carpetaWebUrl,
        },

        checklist:
            registro.checklistWebUrl
                ? {
                    nombre: registro.checklistNombre,
                    webUrl: registro.checklistWebUrl,
                }
                : null,

        sincronizadoAt: registro.sincronizadoAt,
        ultimoError: registro.ultimoError,

        elementos:
            LEYPD_ELEMENTOS.map(
                (catalogo): ElementoSharepointLeypd =>
                    guardados[String(catalogo.numero)] ?? {
                        numero: catalogo.numero,
                        carpetaEsperada: catalogo.carpeta,
                        existe: false,
                        itemId: null,
                        webUrl: null,
                        documentos: [],
                        faltantes: [],
                        opcionalesFaltantes: [],
                    }
            ),
    };
}

/* =====================================================
   SINCRONIZAR
===================================================== */

/**
 * Lee la carpeta LEYPD del cliente y actualiza:
 * - checklist
 * - existencia, URL y documentos de las 13 carpetas
 * - documentos faltantes según catálogo
 *
 * Solo lectura: no crea ni modifica nada en SharePoint.
 */
export async function sincronizarSharepointLeypd(
    empresaId: number
) {
    await asegurarEmpresa(empresaId);

    const registro =
        await prisma.leypdSharepoint.findUnique({
            where: {
                empresaId,
            },
        });

    if (!registro) {
        throw new Error(
            "SHAREPOINT_NO_VINCULADO"
        );
    }

    try {
        const hijosRaiz =
            await listarHijosCarpeta(
                registro.driveId,
                registro.carpetaItemId
            );

        /* -------------------- CHECKLIST -------------------- */

        const checklist =
            hijosRaiz.find(
                (item) =>
                    !item.folder &&
                    normalizarNombre(item.name).startsWith(
                        normalizarNombre("00 Checklist LEYPD")
                    ) &&
                    item.name.toLowerCase().endsWith(".xlsx")
            ) ?? null;

        /* -------------------- ELEMENTOS -------------------- */

        const carpetasRaiz =
            hijosRaiz.filter(
                (item) => Boolean(item.folder)
            );

        const elementos =
            await Promise.all(
                LEYPD_ELEMENTOS.map(
                    async (catalogo): Promise<ElementoSharepointLeypd> => {
                        const carpeta =
                            carpetasRaiz.find(
                                (item) =>
                                    normalizarNombre(item.name) ===
                                    normalizarNombre(catalogo.carpeta)
                            );

                        if (!carpeta) {
                            return {
                                numero: catalogo.numero,
                                carpetaEsperada: catalogo.carpeta,
                                existe: false,
                                itemId: null,
                                webUrl: null,
                                documentos: [],
                                faltantes: [],
                                opcionalesFaltantes: [],
                            };
                        }

                        const hijos =
                            await listarHijosCarpeta(
                                registro.driveId,
                                carpeta.id
                            );

                        const esperados =
                            documentosEsperados(catalogo);

                        const noEncontrados =
                            esperados.filter(
                                (e) => !existeDocumento(e, hijos)
                            );

                        return {
                            numero: catalogo.numero,
                            carpetaEsperada: catalogo.carpeta,
                            existe: true,
                            itemId: carpeta.id,
                            webUrl: carpeta.webUrl,

                            documentos:
                                hijos
                                    .map(aDocumento)
                                    .sort((a, b) =>
                                        a.nombre.localeCompare(b.nombre, "es")
                                    ),

                            faltantes:
                                noEncontrados
                                    .filter((e) => !e.opcional)
                                    .map((e) => e.etiqueta),

                            opcionalesFaltantes:
                                noEncontrados
                                    .filter((e) => e.opcional)
                                    .map((e) => e.etiqueta),
                        };
                    }
                )
            );

        const porNumero: Record<string, ElementoSharepointLeypd> = {};

        for (const elemento of elementos) {
            porNumero[String(elemento.numero)] = elemento;
        }

        await prisma.leypdSharepoint.update({
            where: {
                empresaId,
            },
            data: {
                checklistItemId: checklist?.id ?? null,
                checklistNombre: checklist?.name ?? null,
                checklistWebUrl: checklist?.webUrl ?? null,

                elementos:
                    porNumero as unknown as Prisma.InputJsonValue,

                sincronizadoAt: new Date(),
                ultimoError: null,
            },
        });
    } catch (error) {
        await prisma.leypdSharepoint.update({
            where: {
                empresaId,
            },
            data: {
                ultimoError:
                    error instanceof Error
                        ? error.message.slice(0, 500)
                        : "Error desconocido",
            },
        });

        throw error;
    }

    return obtenerSharepointLeypd(empresaId);
}

/* =====================================================
   VINCULAR
===================================================== */

/**
 * Vincula (o re-vincula) la carpeta LEYPD de una empresa
 * a partir de su URL y sincroniza inmediatamente.
 */
export async function vincularSharepointLeypd(
    empresaId: number,
    url: string,
    actorId: number | null
) {
    await asegurarEmpresa(empresaId);

    const carpeta =
        await resolverCarpetaDesdeUrl(url);

    await prisma.leypdSharepoint.upsert({
        where: {
            empresaId,
        },

        create: {
            empresaId,
            driveId: carpeta.driveId,
            carpetaItemId: carpeta.itemId,
            carpetaNombre: carpeta.nombre,
            carpetaWebUrl: carpeta.webUrl,
            vinculadoPorId: actorId,
        },

        /*
         * Re-vincular limpia el estado anterior:
         * puede ser otra carpeta.
         */
        update: {
            driveId: carpeta.driveId,
            carpetaItemId: carpeta.itemId,
            carpetaNombre: carpeta.nombre,
            carpetaWebUrl: carpeta.webUrl,
            checklistItemId: null,
            checklistNombre: null,
            checklistWebUrl: null,
            elementos: {},
            sincronizadoAt: null,
            ultimoError: null,
            vinculadoPorId: actorId,
        },
    });

    return sincronizarSharepointLeypd(empresaId);
}

/* =====================================================
   SINCRONIZAR TODAS (segundo plano)
===================================================== */

let sincronizacionMasivaEnCurso = false;

/**
 * Re-sincroniza todas las empresas vinculadas, una tras otra,
 * sin bloquear la respuesta HTTP.
 *
 * Se usa al terminar una actualización documental del worker,
 * para que los faltantes del CRM reflejen los documentos nuevos.
 * Cada error queda en ultimoError de su empresa.
 */
export function sincronizarTodasSharepointLeypdEnSegundoPlano() {
    if (sincronizacionMasivaEnCurso) {
        return {
            iniciada: false,
        };
    }

    sincronizacionMasivaEnCurso = true;

    void (async () => {
        try {
            const registros =
                await prisma.leypdSharepoint.findMany({
                    select: {
                        empresaId: true,
                    },
                });

            for (const registro of registros) {
                try {
                    await sincronizarSharepointLeypd(
                        registro.empresaId
                    );
                } catch (error) {
                    console.error(
                        "[LEYPD SHAREPOINT] Sincronización masiva, empresa",
                        registro.empresaId,
                        error instanceof Error
                            ? error.message
                            : error
                    );
                }
            }
        } finally {
            sincronizacionMasivaEnCurso = false;
        }
    })();

    return {
        iniciada: true,
    };
}