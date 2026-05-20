// src/controllers/simpleapi.controller.ts
import { consultarVentasRCV, consultarResumenVentasRCV, consultarComprasRCV, consultarResumenComprasRCV, } from "../service/simple-api/simpleapi.service.js";
import { prisma } from "../lib/prisma.js";
const EMPRESAS_PERMITIDAS = {
    econnet: process.env.ECONNET_RUT_EMPRESA ?? process.env.RUT_EMPRESA ?? "",
    rids: process.env.RIDS_RUT_EMPRESA ?? "",
};
function getAuthUser(req) {
    return req.user;
}
function normalizeRut(rut) {
    return String(rut ?? "")
        .replace(/\./g, "")
        .replace(/\s/g, "")
        .toLowerCase()
        .trim();
}
function validarMesAno(mes, ano) {
    if (!mes || !ano) {
        return "Parámetros requeridos: mes (01-12) y ano (ej: 2026)";
    }
    const mesNormalizado = String(mes).padStart(2, "0");
    if (!/^\d{2}$/.test(mesNormalizado) ||
        Number(mesNormalizado) < 1 ||
        Number(mesNormalizado) > 12) {
        return "Mes inválido. Debe estar entre 01 y 12";
    }
    if (!/^\d{4}$/.test(ano)) {
        return "Año inválido. Debe tener formato YYYY";
    }
    return null;
}
async function getRutEmpresaCliente(req) {
    const user = getAuthUser(req);
    if (!user?.empresaId) {
        return {
            ok: false,
            status: 403,
            error: "Usuario cliente sin empresa asociada",
        };
    }
    const empresaDB = await prisma.empresa.findUnique({
        where: {
            id_empresa: user.empresaId,
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
    const rutCliente = empresaDB?.detalleEmpresa?.rut;
    if (!empresaDB || !rutCliente) {
        return {
            ok: false,
            status: 403,
            error: "La empresa del usuario no tiene RUT configurado",
        };
    }
    return {
        ok: true,
        empresaId: empresaDB.id_empresa,
        nombre: empresaDB.nombre,
        rutCliente: normalizeRut(rutCliente),
    };
}
const EMPRESAS_EMISORAS_CLIENTE = [
    {
        empresa: "rids",
        rutEmpresa: process.env.RIDS_RUT_EMPRESA ?? "",
    },
    {
        empresa: "econnet",
        rutEmpresa: process.env.RUT_EMPRESA ?? "",
    },
].filter((e) => e.rutEmpresa);
function getDetalleVentasFromData(data) {
    if (Array.isArray(data))
        return data;
    // Estructura normalizada actual de tu caché
    if (Array.isArray(data?.ventas))
        return data.ventas;
    // Estructuras posibles directas
    if (Array.isArray(data?.detalleVentas))
        return data.detalleVentas;
    if (Array.isArray(data?.detalle))
        return data.detalle;
    if (Array.isArray(data?.documentos))
        return data.documentos;
    // Estructuras anidadas en data
    if (Array.isArray(data?.data?.ventas))
        return data.data.ventas;
    if (Array.isArray(data?.data?.detalleVentas))
        return data.data.detalleVentas;
    if (Array.isArray(data?.data?.detalle))
        return data.data.detalle;
    if (Array.isArray(data?.data?.documentos))
        return data.data.documentos;
    // Estructuras anidadas en response
    if (Array.isArray(data?.response?.ventas))
        return data.response.ventas;
    if (Array.isArray(data?.response?.detalleVentas))
        return data.response.detalleVentas;
    if (Array.isArray(data?.response?.detalle))
        return data.response.detalle;
    if (Array.isArray(data?.response?.documentos))
        return data.response.documentos;
    // Estructuras anidadas en resultado
    if (Array.isArray(data?.resultado?.ventas))
        return data.resultado.ventas;
    if (Array.isArray(data?.resultado?.detalleVentas))
        return data.resultado.detalleVentas;
    if (Array.isArray(data?.resultado?.detalle))
        return data.resultado.detalle;
    if (Array.isArray(data?.resultado?.documentos))
        return data.resultado.documentos;
    // Estructura raw, por si guardaste la respuesta original de SimpleAPI
    if (Array.isArray(data?.raw?.ventas))
        return data.raw.ventas;
    if (Array.isArray(data?.raw?.detalleVentas))
        return data.raw.detalleVentas;
    if (Array.isArray(data?.raw?.detalle))
        return data.raw.detalle;
    if (Array.isArray(data?.raw?.documentos))
        return data.raw.documentos;
    if (Array.isArray(data?.raw?.data?.ventas))
        return data.raw.data.ventas;
    if (Array.isArray(data?.raw?.data?.detalleVentas))
        return data.raw.data.detalleVentas;
    if (Array.isArray(data?.raw?.data?.detalle))
        return data.raw.data.detalle;
    if (Array.isArray(data?.raw?.data?.documentos))
        return data.raw.data.documentos;
    return [];
}
function getRutReceptorFromDoc(doc) {
    return normalizeRut(doc?.rutReceptor ??
        doc?.RutReceptor ??
        doc?.RUTReceptor ??
        doc?.rut_receptor ??
        doc?.receptorRut ??
        doc?.rutCliente ??
        doc?.RutCliente ??
        doc?.RUTRecep ??
        doc?.RutRecep ??
        doc?.rutRecep ??
        doc?.rut_recep ??
        doc?.rut_receptor_dte ??
        doc?.rut ??
        doc?.Rut ??
        doc?.RUT ??
        doc?.receptor?.rut ??
        doc?.receptor?.RUT ??
        doc?.Receptor?.RUTRecep ??
        doc?.Receptor?.RutRecep ??
        doc?.Encabezado?.Receptor?.RUTRecep ??
        doc?.Encabezado?.Receptor?.RutRecep);
}
function getNombreReceptorFromDoc(doc) {
    return String(doc?.razonSocialReceptor ??
        doc?.RazonSocialReceptor ??
        doc?.RznSocRecep ??
        doc?.rznSocRecep ??
        doc?.nombreReceptor ??
        doc?.receptorNombre ??
        doc?.razon_social_receptor ??
        doc?.receptor?.razonSocial ??
        doc?.Receptor?.RznSocRecep ??
        doc?.Encabezado?.Receptor?.RznSocRecep ??
        "").trim();
}
function filtrarVentasPorRutReceptor(data, rutCliente) {
    const detalleVentas = getDetalleVentasFromData(data);
    console.log("🔎 Filtrando ventas cliente:", {
        rutCliente,
        totalAntes: detalleVentas.length,
        dataKeys: data && typeof data === "object" ? Object.keys(data) : null,
        ventasIsArray: Array.isArray(data?.ventas),
        ventasLength: Array.isArray(data?.ventas) ? data.ventas.length : null,
        primerDocumento: detalleVentas[0]
            ? {
                folio: detalleVentas[0]?.folio ??
                    detalleVentas[0]?.Folio ??
                    detalleVentas[0]?.folioDTE ??
                    detalleVentas[0]?.FolioDTE,
                receptorNombre: getNombreReceptorFromDoc(detalleVentas[0]),
                rutDetectado: getRutReceptorFromDoc(detalleVentas[0]),
                keys: Object.keys(detalleVentas[0] ?? {}),
            }
            : null,
    });
    const detalleFiltrado = detalleVentas.filter((doc) => {
        const rutDoc = getRutReceptorFromDoc(doc);
        return rutDoc === rutCliente;
    });
    console.log("✅ Ventas filtradas cliente:", {
        rutCliente,
        totalAntes: detalleVentas.length,
        totalDespues: detalleFiltrado.length,
        ejemplosFiltrados: detalleFiltrado.slice(0, 5).map((doc) => ({
            folio: doc?.folio ??
                doc?.Folio ??
                doc?.folioDTE ??
                doc?.FolioDTE,
            receptorNombre: getNombreReceptorFromDoc(doc),
            rutDetectado: getRutReceptorFromDoc(doc),
        })),
    });
    return {
        ...data,
        // Para compatibilidad con tu backend actual
        detalleVentas: detalleFiltrado,
        // Para compatibilidad con tu frontend/caché actual
        ventas: detalleFiltrado,
        total: detalleFiltrado.length,
    };
}
function sumarMontosDetalleVentas(detalleVentas) {
    return detalleVentas.reduce((acc, doc) => {
        acc.totalDocumentos += 1;
        acc.montoExento += Number(doc?.montoExento ?? doc?.MntExe ?? doc?.monto_exento ?? 0);
        acc.montoNeto += Number(doc?.montoNeto ?? doc?.MntNeto ?? doc?.monto_neto ?? 0);
        acc.montoIVA += Number(doc?.montoIVA ?? doc?.IVA ?? doc?.monto_iva ?? 0);
        acc.montoTotal += Number(doc?.montoTotal ?? doc?.MntTotal ?? doc?.monto_total ?? 0);
        return acc;
    }, {
        totalDocumentos: 0,
        montoExento: 0,
        montoNeto: 0,
        montoIVA: 0,
        montoTotal: 0,
    });
}
function resolverRutEmpresa(empresaRaw) {
    const empresa = String(empresaRaw ?? "").toLowerCase().trim();
    if (!empresa) {
        return {
            ok: false,
            status: 400,
            error: "Debe enviar empresa. Ejemplo: empresa=econnet",
        };
    }
    const rutEmpresa = EMPRESAS_PERMITIDAS[empresa];
    if (!rutEmpresa) {
        return {
            ok: false,
            status: 400,
            error: `Empresa inválida o sin RUT configurado: ${empresa}`,
        };
    }
    return {
        ok: true,
        empresa,
        rutEmpresa,
        empresaId: null,
    };
}
function parseForceRefresh(req) {
    return req.query.refresh === "true";
}
// ============================================================
// GET /api/facturas/ventas?mes=01&ano=2026&empresa=econnet&refresh=true
// ============================================================
export async function getVentasRCV(req, res) {
    try {
        const mes = req.query.mes;
        const ano = req.query.ano;
        const forceRefresh = parseForceRefresh(req);
        const errorPeriodo = validarMesAno(mes, ano);
        if (errorPeriodo) {
            res.status(400).json({
                ok: false,
                error: errorPeriodo,
            });
            return;
        }
        const user = getAuthUser(req);
        console.log("👤 USER FACTURAS:", {
            user,
            rawUser: req.user,
        });
        /**
         * CLIENTE:
         * Consulta ventas de RIDS + ECONNET,
         * pero solo muestra documentos emitidos hacia su empresa.
         */
        if (user?.rol === "CLIENTE") {
            const clienteResult = await getRutEmpresaCliente(req);
            if (!clienteResult.ok) {
                res.status(clienteResult.status).json({
                    ok: false,
                    error: clienteResult.error,
                });
                return;
            }
            const rutCliente = clienteResult.rutCliente;
            console.log("🏢 RCV ventas CLIENTE:", {
                clienteEmpresaId: clienteResult.empresaId,
                clienteNombre: clienteResult.nombre,
                rutCliente,
                emisores: EMPRESAS_EMISORAS_CLIENTE,
                mes,
                ano,
                forceRefresh,
            });
            const resultados = await Promise.all(EMPRESAS_EMISORAS_CLIENTE.map(async (emisor) => {
                const resultado = await consultarVentasRCV(mes, ano, emisor.empresa, emisor.rutEmpresa, forceRefresh);
                const dataFiltrada = filtrarVentasPorRutReceptor(resultado.data, rutCliente);
                const ventasFiltradas = getDetalleVentasFromData(dataFiltrada).map((doc) => ({
                    ...doc,
                    empresaEmisora: emisor.empresa,
                    rutEmpresaEmisora: emisor.rutEmpresa,
                }));
                console.log("🏷️ Ventas filtradas por emisor:", {
                    emisor: emisor.empresa,
                    rutEmpresa: emisor.rutEmpresa,
                    totalFiltrado: ventasFiltradas.length,
                    ejemplos: ventasFiltradas.slice(0, 3).map((doc) => ({
                        folio: doc?.folio ?? doc?.Folio ?? doc?.folioDTE ?? doc?.FolioDTE,
                        rutReceptor: getRutReceptorFromDoc(doc),
                        empresaEmisora: doc.empresaEmisora,
                    })),
                });
                return {
                    source: resultado.source,
                    empresa: emisor.empresa,
                    rutEmpresa: emisor.rutEmpresa,
                    data: {
                        ...dataFiltrada,
                        ventas: ventasFiltradas,
                        detalleVentas: ventasFiltradas,
                        total: ventasFiltradas.length,
                    },
                };
            }));
            const detalleVentas = resultados.flatMap((r) => getDetalleVentasFromData(r.data));
            const totales = sumarMontosDetalleVentas(detalleVentas);
            res.json({
                ok: true,
                source: "multi-emisor",
                empresa: "rids-econnet",
                rutEmpresa: EMPRESAS_EMISORAS_CLIENTE.map((e) => e.rutEmpresa).join(","),
                cliente: {
                    empresaId: clienteResult.empresaId,
                    nombre: clienteResult.nombre,
                    rut: rutCliente,
                },
                emisores: resultados.map((r) => ({
                    empresa: r.empresa,
                    rutEmpresa: r.rutEmpresa,
                    source: r.source,
                    totalFiltrado: getDetalleVentasFromData(r.data).length,
                })),
                data: {
                    caratula: {
                        rutReceptor: rutCliente,
                        nombreCliente: clienteResult.nombre,
                    },
                    resumenCliente: totales,
                    detalleVentas,
                    ventas: detalleVentas,
                    total: detalleVentas.length,
                },
            });
            return;
        }
        /**
         * ADMIN / TECNICO:
         * Mantiene comportamiento actual.
         * Consulta solo la empresa seleccionada por query param.
         */
        const empresaResult = resolverRutEmpresa(req.query.empresa);
        if (!empresaResult.ok) {
            res.status(empresaResult.status).json({
                ok: false,
                error: empresaResult.error,
            });
            return;
        }
        console.log("🏢 RCV ventas:", {
            empresa: empresaResult.empresa,
            rutEmpresa: empresaResult.rutEmpresa,
            mes,
            ano,
            forceRefresh,
        });
        const resultado = await consultarVentasRCV(mes, ano, empresaResult.empresa, empresaResult.rutEmpresa, forceRefresh);
        res.json({
            ok: true,
            source: resultado.source,
            empresa: empresaResult.empresa,
            rutEmpresa: empresaResult.rutEmpresa,
            data: resultado.data,
        });
    }
    catch (error) {
        console.error("❌ Error consultando ventas RCV:", error?.message ?? error);
        res.status(500).json({
            ok: false,
            error: error?.message ?? "Error interno al consultar ventas",
        });
    }
}
// ============================================================
// GET /api/facturas/ventas/resumen?mes=01&ano=2026&empresa=econnet
// ============================================================
export async function getResumenVentasRCV(req, res) {
    try {
        const mes = req.query.mes;
        const ano = req.query.ano;
        const forceRefresh = parseForceRefresh(req);
        const errorPeriodo = validarMesAno(mes, ano);
        if (errorPeriodo) {
            res.status(400).json({
                ok: false,
                error: errorPeriodo,
            });
            return;
        }
        const user = getAuthUser(req);
        /**
         * CLIENTE:
         * El resumen debe calcularse desde las ventas filtradas por rutReceptor.
         */
        if (user?.rol === "CLIENTE") {
            const clienteResult = await getRutEmpresaCliente(req);
            if (!clienteResult.ok) {
                res.status(clienteResult.status).json({
                    ok: false,
                    error: clienteResult.error,
                });
                return;
            }
            const rutCliente = clienteResult.rutCliente;
            const resultados = await Promise.all(EMPRESAS_EMISORAS_CLIENTE.map(async (emisor) => {
                const resultado = await consultarVentasRCV(mes, ano, emisor.empresa, emisor.rutEmpresa, forceRefresh);
                const dataFiltrada = filtrarVentasPorRutReceptor(resultado.data, rutCliente);
                return {
                    source: resultado.source,
                    empresa: emisor.empresa,
                    rutEmpresa: emisor.rutEmpresa,
                    data: dataFiltrada,
                };
            }));
            const detalleVentas = resultados.flatMap((r) => getDetalleVentasFromData(r.data));
            const resumenCliente = sumarMontosDetalleVentas(detalleVentas);
            res.json({
                ok: true,
                source: "multi-emisor",
                empresa: "rids-econnet",
                rutEmpresa: EMPRESAS_EMISORAS_CLIENTE.map((e) => e.rutEmpresa).join(","),
                cliente: {
                    empresaId: clienteResult.empresaId,
                    nombre: clienteResult.nombre,
                    rut: rutCliente,
                },
                data: {
                    resumenCliente,
                    resumenes: [
                        {
                            operacion: "VENTAS_CLIENTE",
                            tipoDocCodigo: 0,
                            tipoDocNombre: "Ventas emitidas por RIDS/ECONNET hacia cliente",
                            totalDocumentos: resumenCliente.totalDocumentos,
                            montoExento: resumenCliente.montoExento,
                            montoNeto: resumenCliente.montoNeto,
                            montoIVA: resumenCliente.montoIVA,
                            montoTotal: resumenCliente.montoTotal,
                        },
                    ],
                },
            });
            return;
        }
        /**
         * ADMIN / TECNICO:
         * Mantiene comportamiento actual.
         */
        const empresaResult = resolverRutEmpresa(req.query.empresa);
        if (!empresaResult.ok) {
            res.status(empresaResult.status).json({
                ok: false,
                error: empresaResult.error,
            });
            return;
        }
        const resultado = await consultarResumenVentasRCV(mes, ano, empresaResult.empresa, empresaResult.rutEmpresa, forceRefresh);
        res.json({
            ok: true,
            source: resultado.source,
            empresa: empresaResult.empresa,
            rutEmpresa: empresaResult.rutEmpresa,
            data: resultado.data,
        });
    }
    catch (error) {
        console.error("❌ Error consultando resumen RCV:", error?.message ?? error);
        res.status(500).json({
            ok: false,
            error: error?.message ?? "Error interno al consultar resumen",
        });
    }
}
// ============================================================
// GET /api/facturas/compras?mes=01&ano=2026&empresa=econnet&refresh=true
// ============================================================
export async function getComprasRCV(req, res) {
    try {
        const user = getAuthUser(req);
        if (user?.rol === "CLIENTE") {
            res.status(403).json({
                ok: false,
                error: "Los usuarios cliente no tienen acceso al módulo de compras",
            });
            return;
        }
        const mes = req.query.mes;
        const ano = req.query.ano;
        const forceRefresh = parseForceRefresh(req);
        const errorPeriodo = validarMesAno(mes, ano);
        if (errorPeriodo) {
            res.status(400).json({
                ok: false,
                error: errorPeriodo,
            });
            return;
        }
        const empresaResult = resolverRutEmpresa(req.query.empresa);
        if (!empresaResult.ok) {
            res.status(empresaResult.status).json({
                ok: false,
                error: empresaResult.error,
            });
            return;
        }
        console.log("🏢 RCV compras:", {
            empresa: empresaResult.empresa,
            rutEmpresa: empresaResult.rutEmpresa,
            mes,
            ano,
            forceRefresh,
        });
        const resultado = await consultarComprasRCV(mes, ano, empresaResult.empresa, empresaResult.rutEmpresa, forceRefresh);
        res.json({
            ok: true,
            source: resultado.source,
            empresa: empresaResult.empresa,
            rutEmpresa: empresaResult.rutEmpresa,
            data: resultado.data,
        });
    }
    catch (error) {
        console.error("❌ Error consultando compras RCV:", error?.message ?? error);
        res.status(500).json({
            ok: false,
            error: error?.message ?? "Error interno al consultar compras",
        });
    }
}
// ============================================================
// GET /api/facturas/compras/resumen?mes=01&ano=2026&empresa=econnet
// ============================================================
export async function getResumenComprasRCV(req, res) {
    try {
        const user = getAuthUser(req);
        if (user?.rol === "CLIENTE") {
            res.status(403).json({
                ok: false,
                error: "Los usuarios cliente no tienen acceso al módulo de compras",
            });
            return;
        }
        const mes = req.query.mes;
        const ano = req.query.ano;
        const forceRefresh = parseForceRefresh(req);
        const errorPeriodo = validarMesAno(mes, ano);
        if (errorPeriodo) {
            res.status(400).json({
                ok: false,
                error: errorPeriodo,
            });
            return;
        }
        const empresaResult = resolverRutEmpresa(req.query.empresa);
        if (!empresaResult.ok) {
            res.status(400).json({
                ok: false,
                error: empresaResult.error,
            });
            return;
        }
        const resultado = await consultarResumenComprasRCV(mes, ano, empresaResult.empresa, empresaResult.rutEmpresa, forceRefresh);
        res.json({
            ok: true,
            source: resultado.source,
            empresa: empresaResult.empresa,
            rutEmpresa: empresaResult.rutEmpresa,
            data: resultado.data,
        });
    }
    catch (error) {
        console.error("❌ Error consultando resumen compras RCV:", error?.message ?? error);
        res.status(500).json({
            ok: false,
            error: error?.message ?? "Error interno al consultar resumen compras",
        });
    }
}
//# sourceMappingURL=Simpleapi.controller.js.map