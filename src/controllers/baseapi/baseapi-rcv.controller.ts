// src/controllers/baseapi/baseapi-rcv.controller.ts
import type { Request, Response } from "express";
import {
    consultarComprasRcvBaseApi,
    consultarVentasRcvBaseApi,
} from "../../service/baseapi/baseapi-rcv.service.js";

import { prisma } from "../../lib/prisma.js";

import {
    anotarDocumentosCobranza,
} from "../../service/baseapi/cobranza/cobranza-estado.service.js";

// Función para parsear la empresa desde la query, validando que sea "econnet" o "rids", y lanzando un error descriptivo si no es así.
function parseEmpresa(value: unknown): "econnet" | "rids" {
    const empresa = String(value ?? "").toLowerCase();

    if (empresa !== "econnet" && empresa !== "rids") {
        throw new Error("Empresa inválida. Usa empresa=econnet o empresa=rids");
    }

    return empresa;
}

function assertClientePuedeConsultarTipo(req: Request, tipo: "ventas" | "compras") {
    const rol = getUserRole(req);

    if (rol === "CLIENTE" && tipo === "compras") {
        const error: any = new Error("Los clientes solo pueden consultar RCV de ventas relacionados a su empresa");
        error.statusCode = 403;
        throw error;
    }
}

function getDetalleVentasBaseApi(data: any): any[] {
    if (Array.isArray(data)) return data;

    if (Array.isArray(data?.detalleVentas)) return data.detalleVentas;
    if (Array.isArray(data?.ventas)) return data.ventas;
    if (Array.isArray(data?.documentos)) return data.documentos;
    if (Array.isArray(data?.items)) return data.items;

    if (Array.isArray(data?.data?.datos)) return data.data.datos;
    if (Array.isArray(data?.data?.detalleVentas)) return data.data.detalleVentas;
    if (Array.isArray(data?.data?.ventas)) return data.data.ventas;
    if (Array.isArray(data?.data?.documentos)) return data.data.documentos;
    if (Array.isArray(data?.data?.items)) return data.data.items;

    return [];
}

function getDetalleComprasBaseApi(data: any): any[] {
    if (Array.isArray(data)) return data;

    if (Array.isArray(data?.detalleCompras)) return data.detalleCompras;
    if (Array.isArray(data?.compras)) return data.compras;
    if (Array.isArray(data?.documentos)) return data.documentos;
    if (Array.isArray(data?.items)) return data.items;

    if (Array.isArray(data?.data?.datos)) return data.data.datos;
    if (Array.isArray(data?.data?.detalleCompras)) return data.data.detalleCompras;
    if (Array.isArray(data?.data?.compras)) return data.data.compras;
    if (Array.isArray(data?.data?.documentos)) return data.data.documentos;
    if (Array.isArray(data?.data?.items)) return data.data.items;

    return [];
}

function getRutDocumentoBaseApi(doc: any): string {
    return normalizeRut(
        doc?.["Rut cliente"] ??
        doc?.["RUT Cliente"] ??
        doc?.["Rut Receptor"] ??
        doc?.["RUT Receptor"] ??
        doc?.["Rut Proveedor"] ??
        doc?.["RUT Proveedor"] ??
        doc?.rutCliente ??
        doc?.rutReceptor ??
        doc?.rutProveedor ??
        doc?.rut ??
        doc?.RUT ??
        ""
    );
}

function parsePeriodo(req: Request) {
    const mes = String(req.query.mes ?? "").padStart(2, "0");
    const ano = String(req.query.ano ?? "");

    if (!/^\d{4}$/.test(ano)) {
        throw new Error("Año inválido");
    }

    if (!/^\d{2}$/.test(mes)) {
        throw new Error("Mes inválido");
    }

    const mesNum = Number(mes);

    if (mesNum < 1 || mesNum > 12) {
        throw new Error("Mes fuera de rango. Debe estar entre 01 y 12");
    }

    return { mes, ano };
}

function getEmpresasConsulta(req: Request): Array<"econnet" | "rids"> {
    const rol = String(req.user?.rol ?? "").toUpperCase().trim();

    if (rol === "CLIENTE") {
        return ["rids", "econnet"];
    }

    return [parseEmpresa(req.query.empresa)];
}

function parseForceRefresh(value: unknown): boolean {
    return String(value ?? "false").toLowerCase() === "true";
}

function getUserRole(req: Request): string {
    return String(req.user?.rol ?? "").toUpperCase().trim();
}

function normalizeRut(value: unknown): string {
    return String(value ?? "")
        .replace(/\./g, "")
        .replace(/-/g, "")
        .replace(/\s/g, "")
        .toUpperCase()
        .trim();
}

function mergeRcvResponses(
    responses: Array<{
        empresa: "rids" | "econnet";
        cached: boolean;
        cacheUpdatedAt?: Date | string | null;
        data: any;
    }>,
    tipo: "ventas" | "compras"
) {
    const detalleVentas: any[] = [];
    const detalleCompras: any[] = [];

    for (const response of responses) {
        const documentos =
            tipo === "ventas"
                ? getDetalleVentasBaseApi(response.data)
                : getDetalleComprasBaseApi(response.data);

        const documentosConOrigen = documentos.map((doc: any) => ({
            ...doc,
            empresaOrigen: response.empresa,
        }));

        if (tipo === "ventas") {
            detalleVentas.push(...documentosConOrigen);
        } else {
            detalleCompras.push(...documentosConOrigen);
        }
    }

    const documentos = tipo === "ventas" ? detalleVentas : detalleCompras;

    return {
        empresasConsultadas: responses.map((r) => r.empresa),
        fuentes: responses.map((r) => ({
            empresa: r.empresa,
            cached: r.cached,
            cacheUpdatedAt: r.cacheUpdatedAt,
        })),

        detalleVentas,
        ventas: detalleVentas,

        detalleCompras,
        compras: detalleCompras,

        documentos,
        data: {
            datos: documentos,
            totalRegistros: documentos.length,
        },

        total: documentos.length,
    };
}

async function getClienteRutPermitido(req: Request): Promise<string | null> {
    const rol = getUserRole(req);

    if (rol !== "CLIENTE") {
        return null;
    }

    const user = req.user as {
        id: number;
        rol: string;
        empresaId?: number | null;
    };

    const empresaId = Number(user.empresaId);

    if (!empresaId) {
        const error: any = new Error("Tu usuario no tiene una empresa asociada");
        error.statusCode = 403;
        throw error;
    }

    const empresa = await prisma.empresa.findUnique({
        where: {
            id_empresa: empresaId,
        },
        select: {
            id_empresa: true,
            nombre: true,
            detalleEmpresa: {
                select: {
                    rut: true,
                },
            },
        },
    });

    if (!empresa) {
        const error: any = new Error("Empresa asociada no encontrada");
        error.statusCode = 404;
        throw error;
    }

    const rut = empresa.detalleEmpresa?.rut;

    if (!rut) {
        const error: any = new Error("La empresa asociada no tiene RUT registrado");
        error.statusCode = 400;
        throw error;
    }

    return normalizeRut(rut);
}

function filtrarRcvPorRutCliente(
    data: any,
    rutClienteNormalizado: string,
    tipo: "ventas" | "compras"
) {
    if (!data || typeof data !== "object") return data;

    const clone: any =
        typeof structuredClone === "function"
            ? structuredClone(data)
            : JSON.parse(JSON.stringify(data));

    const documentos =
        tipo === "ventas"
            ? getDetalleVentasBaseApi(clone)
            : getDetalleComprasBaseApi(clone);

    const filtrados = documentos.filter((doc: any) => {
        const rutDoc = getRutDocumentoBaseApi(doc);

        if (rutDoc) {
            return rutDoc === rutClienteNormalizado;
        }

        return normalizeRut(JSON.stringify(doc)).includes(rutClienteNormalizado);
    });

    console.log("[RCV CLIENTE FILTRO BASEAPI]", {
        tipo,
        rutClienteNormalizado,
        totalAntes: documentos.length,
        totalDespues: filtrados.length,
        ejemploAntes: documentos[0]
            ? {
                folio: documentos[0]?.Folio ?? documentos[0]?.folio,
                rut: getRutDocumentoBaseApi(documentos[0]),
                razon: documentos[0]?.["Razon Social"] ?? documentos[0]?.razonSocial,
                keys: Object.keys(documentos[0]),
            }
            : null,
        ejemplosDespues: filtrados.slice(0, 5).map((doc: any) => ({
            folio: doc?.Folio ?? doc?.folio,
            rut: getRutDocumentoBaseApi(doc),
            razon: doc?.["Razon Social"] ?? doc?.razonSocial,
        })),
    });

    return {
        ...clone,
        detalleVentas: tipo === "ventas" ? filtrados : clone.detalleVentas ?? [],
        ventas: tipo === "ventas" ? filtrados : clone.ventas ?? [],
        detalleCompras: tipo === "compras" ? filtrados : clone.detalleCompras ?? [],
        compras: tipo === "compras" ? filtrados : clone.compras ?? [],
        documentos: filtrados,
        total: filtrados.length,
        data: {
            ...(clone.data && typeof clone.data === "object" ? clone.data : {}),
            datos: filtrados,
            totalRegistros: filtrados.length,
        },
    };
}

/* =========================================================
   INFORMACIÓN ENVÍO DE FACTURA
========================================================= */

function getTipoDocBaseApi(
    doc: any
): string {
    return String(
        doc?.["Tipo Doc"] ??
        doc?.tipoDoc ??
        doc?.tipoDTE ??
        ""
    ).trim();
}

function getFolioBaseApi(
    doc: any
): string {
    return String(
        doc?.["Folio"] ??
        doc?.folio ??
        doc?.Nro ??
        doc?.numero ??
        ""
    ).trim();
}

function getEmpresaDocumentoBaseApi(
    doc: any
): "econnet" | "rids" | null {
    const value =
        String(
            doc?.empresaOrigen ??
            doc?.empresaKey ??
            doc?.empresa ??
            ""
        )
            .trim()
            .toLowerCase();

    if (
        value === "econnet" ||
        value === "rids"
    ) {
        return value;
    }

    return null;
}

function getFacturaEnvioKey(
    params: {
        empresaKey: string;
        tipoDoc: string;
        folio: string;
        rutContraparte: string;
    }
) {
    return [
        String(
            params.empresaKey ??
            ""
        )
            .trim()
            .toLowerCase(),

        String(
            params.tipoDoc ??
            ""
        )
            .trim(),

        String(
            params.folio ??
            ""
        )
            .trim(),

        normalizeRut(
            params.rutContraparte
        ),
    ].join("|");
}

async function anotarDocumentosEnvioFactura(
    documentos: any[]
) {
    if (
        documentos.length ===
        0
    ) {
        return documentos;
    }

    /*
     * =====================================================
     * 1. Identificadores presentes en la respuesta RCV
     * =====================================================
     */

    const empresas =
        [
            ...new Set(
                documentos
                    .map(
                        (
                            doc
                        ) =>
                            getEmpresaDocumentoBaseApi(
                                doc
                            )
                    )
                    .filter(
                        (
                            value
                        ): value is
                            "econnet" |
                            "rids" =>
                            value !==
                            null
                    )
            ),
        ];

    const tiposDoc =
        [
            ...new Set(
                documentos
                    .map(
                        (
                            doc
                        ) =>
                            getTipoDocBaseApi(
                                doc
                            )
                    )
                    .filter(
                        Boolean
                    )
            ),
        ];

    const folios =
        [
            ...new Set(
                documentos
                    .map(
                        (
                            doc
                        ) =>
                            getFolioBaseApi(
                                doc
                            )
                    )
                    .filter(
                        Boolean
                    )
            ),
        ];

    const ruts =
        [
            ...new Set(
                documentos
                    .map(
                        (
                            doc
                        ) =>
                            getRutDocumentoBaseApi(
                                doc
                            )
                    )
                    .filter(
                        Boolean
                    )
            ),
        ];

    if (
        empresas.length ===
        0 ||
        tiposDoc.length ===
        0 ||
        folios.length ===
        0 ||
        ruts.length ===
        0
    ) {
        return documentos.map(
            (
                doc
            ) => ({
                ...doc,

                facturaEnvio: {
                    tieneRegistro:
                        false,

                    estado:
                        "SIN_ENVIO",

                    totalDestinatarios:
                        0,

                    enviados:
                        0,

                    pendientes:
                        0,

                    procesando:
                        0,

                    errores:
                        0,

                    cancelados:
                        0,

                    ultimoEnvioAt:
                        null,

                    ultimoIntentoAt:
                        null,

                    asunto:
                        null,

                    destinatarios:
                        [],
                },
            })
        );
    }

    /*
     * =====================================================
     * 2. Cargar envíos existentes EN BATCH
     * =====================================================
     */

    const envios =
        await prisma
            .rcvFacturaEnvio
            .findMany({
                where: {
                    empresaKey: {
                        in:
                            empresas,
                    },

                    tipoRcv:
                        "ventas",

                    tipoDoc: {
                        in:
                            tiposDoc,
                    },

                    folio: {
                        in:
                            folios,
                    },

                    rutContraparte: {
                        in:
                            ruts,
                    },
                },

                select: {
                    id:
                        true,

                    empresaKey:
                        true,

                    tipoRcv:
                        true,

                    tipoDoc:
                        true,

                    folio:
                        true,

                    rutContraparte:
                        true,

                    razonSocial:
                        true,

                    emailDestino:
                        true,

                    nombreDestino:
                        true,

                    asunto:
                        true,

                    estado:
                        true,

                    automatico:
                        true,

                    montoTotal:
                        true,

                    fechaEmision:
                        true,

                    intentos:
                        true,

                    ultimoIntentoAt:
                        true,

                    procesandoAt:
                        true,

                    enviadoAt:
                        true,

                    error:
                        true,

                    createdAt:
                        true,

                    updatedAt:
                        true,
                },

                orderBy: [
                    {
                        createdAt:
                            "asc",
                    },

                    {
                        id:
                            "asc",
                    },
                ],
            });

    /*
     * =====================================================
     * 3. Agrupar por factura
     * =====================================================
     */

    const enviosPorFactura =
        new Map<
            string,
            typeof envios
        >();

    for (
        const envio
        of envios
    ) {
        const key =
            getFacturaEnvioKey({
                empresaKey:
                    envio
                        .empresaKey,

                tipoDoc:
                    envio
                        .tipoDoc,

                folio:
                    envio
                        .folio,

                rutContraparte:
                    envio
                        .rutContraparte,
            });

        const actual =
            enviosPorFactura.get(
                key
            ) ??
            [];

        actual.push(
            envio
        );

        enviosPorFactura.set(
            key,
            actual
        );
    }

    /*
     * =====================================================
     * 4. Anotar cada documento
     * =====================================================
     */

    return documentos.map(
        (
            doc
        ) => {
            const empresaKey =
                getEmpresaDocumentoBaseApi(
                    doc
                );

            const tipoDoc =
                getTipoDocBaseApi(
                    doc
                );

            const folio =
                getFolioBaseApi(
                    doc
                );

            const rutContraparte =
                getRutDocumentoBaseApi(
                    doc
                );

            if (
                !empresaKey ||
                !tipoDoc ||
                !folio ||
                !rutContraparte
            ) {
                return {
                    ...doc,

                    facturaEnvio: {
                        tieneRegistro:
                            false,

                        estado:
                            "SIN_ENVIO",

                        totalDestinatarios:
                            0,

                        enviados:
                            0,

                        pendientes:
                            0,

                        procesando:
                            0,

                        errores:
                            0,

                        cancelados:
                            0,

                        ultimoEnvioAt:
                            null,

                        ultimoIntentoAt:
                            null,

                        asunto:
                            null,

                        destinatarios:
                            [],
                    },
                };
            }

            const key =
                getFacturaEnvioKey({
                    empresaKey,
                    tipoDoc,
                    folio,
                    rutContraparte,
                });

            const registros =
                enviosPorFactura.get(
                    key
                ) ??
                [];

            if (
                registros.length ===
                0
            ) {
                return {
                    ...doc,

                    facturaEnvio: {
                        tieneRegistro:
                            false,

                        estado:
                            "SIN_ENVIO",

                        totalDestinatarios:
                            0,

                        enviados:
                            0,

                        pendientes:
                            0,

                        procesando:
                            0,

                        errores:
                            0,

                        cancelados:
                            0,

                        ultimoEnvioAt:
                            null,

                        ultimoIntentoAt:
                            null,

                        asunto:
                            null,

                        destinatarios:
                            [],
                    },
                };
            }

            const enviados =
                registros.filter(
                    (
                        item
                    ) =>
                        item.estado ===
                        "ENVIADO" ||
                        Boolean(
                            item.enviadoAt
                        )
                ).length;

            const pendientes =
                registros.filter(
                    (
                        item
                    ) =>
                        item.estado ===
                        "PENDIENTE"
                ).length;

            const procesando =
                registros.filter(
                    (
                        item
                    ) =>
                        item.estado ===
                        "PROCESANDO"
                ).length;

            const errores =
                registros.filter(
                    (
                        item
                    ) =>
                        item.estado ===
                        "ERROR"
                ).length;

            const cancelados =
                registros.filter(
                    (
                        item
                    ) =>
                        item.estado ===
                        "CANCELADO"
                ).length;

            let estado =
                "PARCIAL";

            if (
                enviados ===
                registros.length
            ) {
                estado =
                    "ENVIADO";
            } else if (
                pendientes ===
                registros.length
            ) {
                estado =
                    "PENDIENTE";
            } else if (
                procesando ===
                registros.length
            ) {
                estado =
                    "PROCESANDO";
            } else if (
                errores ===
                registros.length
            ) {
                estado =
                    "ERROR";
            } else if (
                cancelados ===
                registros.length
            ) {
                estado =
                    "CANCELADO";
            }

            const fechasEnvio =
                registros
                    .map(
                        (
                            item
                        ) =>
                            item
                                .enviadoAt
                    )
                    .filter(
                        (
                            value
                        ): value is Date =>
                            value !==
                            null
                    );

            const ultimoEnvioAt =
                fechasEnvio.length >
                    0
                    ? new Date(
                        Math.max(
                            ...fechasEnvio.map(
                                (
                                    fecha
                                ) =>
                                    fecha
                                        .getTime()
                            )
                        )
                    )
                    : null;

            const fechasIntento =
                registros
                    .map(
                        (
                            item
                        ) =>
                            item
                                .ultimoIntentoAt
                    )
                    .filter(
                        (
                            value
                        ): value is Date =>
                            value !==
                            null
                    );

            const ultimoIntentoAt =
                fechasIntento.length >
                    0
                    ? new Date(
                        Math.max(
                            ...fechasIntento.map(
                                (
                                    fecha
                                ) =>
                                    fecha
                                        .getTime()
                            )
                        )
                    )
                    : null;

            const ultimoConAsunto =
                [
                    ...registros,
                ]
                    .reverse()
                    .find(
                        (
                            item
                        ) =>
                            Boolean(
                                item.asunto
                            )
                    );

            return {
                ...doc,

                facturaEnvio: {
                    tieneRegistro:
                        true,

                    estado,

                    totalDestinatarios:
                        registros.length,

                    enviados,

                    pendientes,

                    procesando,

                    errores,

                    cancelados,

                    ultimoEnvioAt,

                    ultimoIntentoAt,

                    asunto:
                        ultimoConAsunto
                            ?.asunto ??
                        null,

                    destinatarios:
                        registros.map(
                            (
                                item
                            ) => ({
                                id:
                                    item.id,

                                nombre:
                                    item
                                        .nombreDestino,

                                email:
                                    item
                                        .emailDestino,

                                estado:
                                    item
                                        .estado,

                                enviadoAt:
                                    item
                                        .enviadoAt,

                                ultimoIntentoAt:
                                    item
                                        .ultimoIntentoAt,

                                intentos:
                                    item
                                        .intentos,

                                error:
                                    item
                                        .error,

                                automatico:
                                    item
                                        .automatico,
                            })
                        ),
                },
            };
        }
    );
}

// Función para consultar las RCV de ventas en BaseAPI, dado la empresa, el periodo, y si se debe forzar la actualización. Maneja la construcción del endpoint, el body de la petición, y la normalización de errores.
export async function getVentasRcvBaseApi(req: Request, res: Response) {
    try {
        assertClientePuedeConsultarTipo(req, "ventas");
        const empresas = getEmpresasConsulta(req);
        const { mes, ano } = parsePeriodo(req);
        const forceRefresh = parseForceRefresh(req.query.forceRefresh);

        const rutCliente = await getClienteRutPermitido(req);

        const resultados = await Promise.all(
            empresas.map(async (empresa) => {
                const resultado = await consultarVentasRcvBaseApi({
                    empresa,
                    mes,
                    ano,
                    forceRefresh,
                });

                const dataFiltrada = rutCliente
                    ? filtrarRcvPorRutCliente(resultado.data, rutCliente, "ventas")
                    : resultado.data;

                console.log("[RCV FILTRO RESULTADO]", {
                    empresa,
                    rutCliente,
                    keysOriginal: resultado.data ? Object.keys(resultado.data) : [],
                    keysFiltrada: dataFiltrada ? Object.keys(dataFiltrada) : [],

                    totalDataDatosOriginal: Array.isArray(resultado.data?.data?.datos)
                        ? resultado.data.data.datos.length
                        : null,

                    totalDataDatosFiltrada: Array.isArray(dataFiltrada?.data?.datos)
                        ? dataFiltrada.data.datos.length
                        : null,

                    muestraFiltrada: Array.isArray(dataFiltrada?.data?.datos)
                        ? dataFiltrada.data.datos.slice(0, 5).map((d: any) => ({
                            folio: d.Folio,
                            rut: d["Rut cliente"] ?? d["RUT Cliente"],
                            razonSocial: d["Razon Social"] ?? d["Razón Social"],
                            empresaOrigen: empresa,
                        }))
                        : null,
                });

                return {
                    empresa,
                    cached: resultado.cached,
                    cacheUpdatedAt: resultado.cacheUpdatedAt,
                    data: dataFiltrada,
                };
            })
        );

        let data = mergeRcvResponses(resultados, "ventas");

        // Anotar estadoPago en cada documento: CONFIRMADA | VENCIDA | PENDIENTE
        const documentosConCobranza =
            await anotarDocumentosCobranza(
                data.data?.datos ?? [],
                "ventas"
            );

        const documentosAnotados =
            await anotarDocumentosEnvioFactura(
                documentosConCobranza
            );

        data = {
            ...data,

            detalleVentas:
                documentosAnotados,

            ventas:
                documentosAnotados,

            documentos:
                documentosAnotados,

            total:
                documentosAnotados.length,

            data: {
                ...(data.data || {}),

                datos:
                    documentosAnotados,

                totalRegistros:
                    documentosAnotados.length,
            },
        };

        res.json({
            ok: true,
            provider: "baseapi",
            empresa: empresas.length === 1 ? empresas[0] : "todas",
            empresas,
            mes,
            ano,
            tipo: "ventas",
            cached: resultados.every((r) => r.cached),
            cacheUpdatedAt: resultados
                .map((r) => r.cacheUpdatedAt)
                .filter(Boolean)
                .sort()
                .at(-1),
            data,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        res.status(500).json({
            ok: false,
            provider: "baseapi",
            error: message,
            message,
        });
    }
}

// Función para consultar las RCV de compras en BaseAPI, dado la empresa, el periodo, y si se debe forzar la actualización. Maneja la construcción del endpoint, el body de la petición, y la normalización de errores.
export async function getComprasRcvBaseApi(req: Request, res: Response) {
    try {
        assertClientePuedeConsultarTipo(req, "compras");
        const empresas = getEmpresasConsulta(req);
        const { mes, ano } = parsePeriodo(req);
        const forceRefresh = parseForceRefresh(req.query.forceRefresh);

        const rutCliente = await getClienteRutPermitido(req);

        const resultados = await Promise.all(
            empresas.map(async (empresa) => {
                const resultado = await consultarComprasRcvBaseApi({
                    empresa,
                    mes,
                    ano,
                    forceRefresh,
                });

                const dataFiltrada = rutCliente
                    ? filtrarRcvPorRutCliente(resultado.data, rutCliente, "compras")
                    : resultado.data;

                return {
                    empresa,
                    cached: resultado.cached,
                    cacheUpdatedAt: resultado.cacheUpdatedAt,
                    data: dataFiltrada,
                };
            })
        );

        let data = mergeRcvResponses(resultados, "compras");

        // Anotar estadoPago en cada documento: CONFIRMADA | VENCIDA | PENDIENTE
        const documentosAnotados =
            await anotarDocumentosCobranza(
                data.data?.datos ?? [],
                "compras"
            );

        data = {
            ...data,

            detalleCompras:
                documentosAnotados,

            compras:
                documentosAnotados,

            documentos:
                documentosAnotados,

            total:
                documentosAnotados.length,

            data: {
                ...(data.data || {}),

                datos:
                    documentosAnotados,

                totalRegistros:
                    documentosAnotados.length,
            },
        };

        res.json({
            ok: true,
            provider: "baseapi",
            empresa: empresas.length === 1 ? empresas[0] : "todas",
            empresas,
            mes,
            ano,
            tipo: "compras",
            cached: resultados.every((r) => r.cached),
            cacheUpdatedAt: resultados
                .map((r) => r.cacheUpdatedAt)
                .filter(Boolean)
                .sort()
                .at(-1),
            data,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        res.status(500).json({
            ok: false,
            provider: "baseapi",
            error: message,
            message,
        });
    }
}