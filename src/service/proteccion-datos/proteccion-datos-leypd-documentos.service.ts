// src/service/proteccion-datos/proteccion-datos-leypd-documentos.service.ts

/* =========================================================
   DOCUMENTOS LEY PD EN EL FORMULARIO PÚBLICO

   Un campo CHECKBOX puede referenciar documentos de la carpeta
   LEYPD de la empresa del destinatario (campo.documentosLeypd).

   - El documento se busca en LeypdDocumentoGenerado (registro del
     worker) por elemento + nombreBase, para la empresa del
     destinatario.
   - Se entrega convertido a PDF por Microsoft Graph
     (?format=pdf), siempre la versión vigente en SharePoint.
   - La ruta de SharePoint nunca se expone: el enlace público
     pasa por el backend y se valida con el token del destinatario.

   Prueba: solo empresas en PD_DOCS_LEYPD_EMPRESAS
   ("12,34" o "*" para todas; vacío = desactivado).
   ========================================================= */

import fetch from "node-fetch";

import {
    prisma,
} from "../../lib/prisma.js";

import {
    obtenerTokenSharepoint,
} from "../../ms/graph.js";

import {
    listarHijosCarpeta,
} from "../../ms/sharepoint.js";

import {
    obtenerCarpetaElementoLeypd,
} from "../leypd/leypd-catalogo.js";

import type {
    DocumentoLeypdCampoConsentimiento,
} from "./proteccion-datos.types.js";

/* =========================================================
   CONFIGURACIÓN
   ========================================================= */

const GRAPH =
    "https://graph.microsoft.com/v1.0";

/** Tope de tamaño del PDF convertido. */
const MAX_PDF_BYTES =
    25 * 1024 * 1024;

/** Tiempo máximo para la conversión en Graph. */
const TIMEOUT_MS =
    60_000;

function empresasHabilitadas():
    "TODAS" |
    Set<number> {

    const valor =
        (process.env.PD_DOCS_LEYPD_EMPRESAS ?? "")
            .trim();

    if (valor === "*") {
        return "TODAS";
    }

    return new Set(
        valor
            .split(",")
            .map((v) => Number(v.trim()))
            .filter((n) => Number.isInteger(n) && n > 0),
    );
}

export function documentosLeypdHabilitados(
    empresaId:
        number |
        null,
): boolean {

    if (!empresaId) {
        return false;
    }

    const habilitadas =
        empresasHabilitadas();

    return habilitadas === "TODAS" ||
        habilitadas.has(empresaId);
}

/** URL base pública del backend (incluye /api). */
function apiPublica(): string {

    const configurada =
        process.env.PUBLIC_API_URL?.trim();

    if (configurada) {
        return configurada.replace(/\/+$/, "");
    }

    const railway =
        process.env.RAILWAY_PUBLIC_DOMAIN?.trim();

    if (railway) {
        return `https://${railway}/api`;
    }

    return `http://localhost:${process.env.PORT ?? 4000}/api`;
}

/* =========================================================
   RESOLVER DOCUMENTOS DE UNA EMPRESA
   ========================================================= */

export type DocumentoLeypdResuelto = {
    titulo:
    string;

    /** Nombre del PDF que verá el destinatario. */
    nombre:
    string;

    ruta:
    string;

    driveId:
    string;

    itemId:
    string;

    cTag:
    string | null;

    modificadoAt:
    string | null;
};

type RegistroDocumento = {
    ruta:
    string;

    itemId:
    string;

    cTag:
    string | null;

    modificadoAt?:
    string | null;
};

function escaparRegex(
    texto:
        string,
): string {
    return texto.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
    );
}

/**
 * Busca, entre los documentos registrados de la empresa, el que
 * corresponde a elemento + nombreBase, directamente en la carpeta
 * del elemento (sin subcarpetas). Ej.:
 * "01 Política de Privacidad/01 Politica_Privacidad_NORMEN.docx"
 */
function buscarRegistro(
    registros:
        RegistroDocumento[],

    referencia:
        DocumentoLeypdCampoConsentimiento,
): RegistroDocumento | null {

    const carpeta =
        obtenerCarpetaElementoLeypd(
            referencia.elemento,
        );

    if (!carpeta) {
        return null;
    }

    const patron =
        new RegExp(
            `^\\d+ ${escaparRegex(referencia.nombreBase)}_.+\\.(docx|xlsx|pdf)$`,
            "i",
        );

    return registros.find(
        (registro) => {

            const [
                primera,
                archivo,
                ...resto
            ] =
                registro.ruta.split("/");

            return primera?.normalize("NFC") ===
                carpeta.normalize("NFC") &&
                archivo !== undefined &&
                resto.length === 0 &&
                patron.test(archivo);
        },
    ) ?? null;
}

function nombrePdf(
    ruta:
        string,
): string {

    const archivo =
        ruta.split("/").pop() ??
        "documento";

    return archivo.replace(
        /\.(docx|xlsx|pdf)$/i,
        "",
    ) + ".pdf";
}

/**
 * Resuelve las referencias de un campo para una empresa.
 * Las que aún no existen en SharePoint se omiten.
 */
export async function resolverDocumentosLeypd(
    empresaId:
        number,

    referencias:
        DocumentoLeypdCampoConsentimiento[],
): Promise<
    (DocumentoLeypdResuelto | null)[]
> {

    const [
        sharepoint,
        registros,
    ] =
        await Promise.all([
            prisma.leypdSharepoint.findUnique({
                where: {
                    empresaId,
                },

                select: {
                    driveId:
                        true,

                    elementos:
                        true,
                },
            }),

            prisma.leypdDocumentoGenerado.findMany({
                where: {
                    empresaId,
                },

                select: {
                    ruta:
                        true,

                    itemId:
                        true,

                    cTag:
                        true,
                },
            }),
        ]);

    if (!sharepoint) {
        return referencias.map(
            () => null,
        );
    }

    /*
 * Documentos subidos a mano a SharePoint (no los generó el worker,
 * p. ej. "20 Politica_Privacidad_rids.cl.docx"): se buscan en la
 * carpeta del elemento. Una lectura por elemento.
 */
    const elementos =
        (sharepoint.elementos ?? {}) as Record<
            string,
            {
                itemId?: string | null;
            }
        >;

    const carpetas =
        new Map<
            number,
            Promise<RegistroDocumento[]>
        >();

    const archivosCarpeta =
        (numero: number) => {

            const existente =
                carpetas.get(numero);

            if (existente) {
                return existente;
            }

            const carpetaItemId =
                elementos[String(numero)]?.itemId;

            const carpeta =
                obtenerCarpetaElementoLeypd(
                    numero,
                );

            const lectura: Promise<RegistroDocumento[]> =
                carpetaItemId && carpeta
                    ? listarHijosCarpeta(
                        sharepoint.driveId,
                        carpetaItemId,
                    )
                        .then((items) =>
                            items
                                .filter((item) => !item.folder)
                                .map((item) => ({
                                    ruta:
                                        `${carpeta}/${item.name}`,

                                    itemId:
                                        item.id,

                                    cTag:
                                        null,

                                    modificadoAt:
                                        item.lastModifiedDateTime ??
                                        null,
                                })),
                        )
                        .catch((error: unknown) => {
                            console.error(
                                "[ProteccionDatos] No se pudo leer la carpeta del elemento",
                                numero,
                                error instanceof Error
                                    ? error.message
                                    : error,
                            );

                            return [];
                        })
                    : Promise.resolve([]);

            carpetas.set(
                numero,
                lectura,
            );

            return lectura;
        };

    return await Promise.all(referencias.map(
        async (referencia) => {

            const registro =
                buscarRegistro(
                    registros,
                    referencia,
                ) ??
                buscarRegistro(
                    await archivosCarpeta(
                        referencia.elemento,
                    ),
                    referencia,
                );

            if (!registro) {
                return null;
            }

            return {
                titulo:
                    referencia.titulo,

                nombre:
                    nombrePdf(
                        registro.ruta,
                    ),

                ruta:
                    registro.ruta,

                driveId:
                    sharepoint.driveId,

                itemId:
                    registro.itemId,

                cTag:
                    registro.cTag,

                modificadoAt:
                    registro.modificadoAt ??
                    null,
            };
        },
    ));
}

/* =========================================================
   AGREGAR A LA CONFIGURACIÓN PÚBLICA
   ========================================================= */

/**
 * Agrega a campo.documentos los documentos Ley PD de la empresa
 * del destinatario, con un enlace al backend. Quita
 * documentosLeypd de la salida pública.
 */
export async function agregarDocumentosLeypdPublicos<
    C extends {
        key: string;

        documentos?: unknown[];

        documentosLeypd?: DocumentoLeypdCampoConsentimiento[];
    },
>(
    campos:
        C[],

    contexto: {
        token:
        string;

        empresaId:
        number | null;
    },
) {

    const habilitado =
        documentosLeypdHabilitados(
            contexto.empresaId,
        );

    return await Promise.all(
        campos.map(
            async (campo) => {

                const {
                    documentosLeypd,
                    ...resto
                } =
                    campo;

                if (
                    !habilitado ||
                    !contexto.empresaId ||
                    !documentosLeypd ||
                    documentosLeypd.length === 0
                ) {
                    return resto;
                }

                let resueltos:
                    (DocumentoLeypdResuelto | null)[];

                try {
                    resueltos =
                        await resolverDocumentosLeypd(
                            contexto.empresaId,
                            documentosLeypd,
                        );
                } catch (error) {
                    console.error(
                        "[ProteccionDatos] No se pudieron resolver documentos Ley PD:",
                        error instanceof Error
                            ? error.message
                            : error,
                    );

                    return resto;
                }

                const extra =
                    resueltos.flatMap(
                        (doc, indice) =>
                            doc
                                ? [
                                    {
                                        titulo:
                                            doc.titulo,

                                        nombre:
                                            doc.nombre,

                                        contentType:
                                            "application/pdf",

                                        origen:
                                            "LEYPD",

                                        url:
                                            `${apiPublica()}/proteccion-datos/publico/` +
                                            `${encodeURIComponent(contexto.token)}/documento-leypd/` +
                                            `${encodeURIComponent(campo.key)}/${indice}`,
                                    },
                                ]
                                : [],
                    );

                return {
                    ...resto,

                    documentos: [
                        ...(resto.documentos ?? []),
                        ...extra,
                    ],
                };
            },
        ),
    );
}

/* =========================================================
   DESCARGAR PDF DESDE SHAREPOINT
   ========================================================= */

export class DocumentoLeypdNoDisponibleError extends Error { }

/**
 * Devuelve el documento como PDF. Graph convierte .docx/.xlsx
 * con ?format=pdf y responde 302 a una URL pre-autenticada,
 * que se descarga sin el token.
 */
export async function descargarPdfLeypd(
    documento:
        DocumentoLeypdResuelto,
): Promise<Buffer> {

    const token =
        await obtenerTokenSharepoint();

    const esPdf =
        /\.pdf$/i.test(
            documento.ruta,
        );

    const url =
        `${GRAPH}/drives/${encodeURIComponent(documento.driveId)}` +
        `/items/${encodeURIComponent(documento.itemId)}/content` +
        (esPdf ? "" : "?format=pdf");

    const signal =
        AbortSignal.timeout(
            TIMEOUT_MS,
        );

    let respuesta =
        await fetch(url, {
            headers: {
                Authorization:
                    `Bearer ${token}`,
            },

            redirect:
                "manual",

            signal,
        });

    if (
        respuesta.status >= 300 &&
        respuesta.status < 400
    ) {
        const destino =
            respuesta.headers.get(
                "location",
            );

        if (!destino) {
            throw new DocumentoLeypdNoDisponibleError(
                "Graph no devolvió la ubicación del PDF",
            );
        }

        respuesta =
            await fetch(destino, {
                signal,
            });
    }

    if (!respuesta.ok) {
        const texto =
            await respuesta.text().catch(() => "");

        console.error(
            "[ProteccionDatos] Graph PDF",
            respuesta.status,
            documento.ruta,
            texto.slice(0, 300),
        );

        throw new DocumentoLeypdNoDisponibleError(
            `Graph ${respuesta.status}`,
        );
    }

    const buffer =
        Buffer.from(
            await respuesta.arrayBuffer(),
        );

    if (buffer.length > MAX_PDF_BYTES) {
        throw new DocumentoLeypdNoDisponibleError(
            "El PDF supera el tamaño permitido",
        );
    }

    return buffer;
}