import { consultarComprasRcvBaseApi, consultarVentasRcvBaseApi, } from "../../service/baseapi/baseapi-rcv.service.js";
import { prisma } from "../../lib/prisma.js";
import { getOverride as getVencimientoOverride } from "./rcv-vencimientos.store.js";
// Función para parsear la empresa desde la query, validando que sea "econnet" o "rids", y lanzando un error descriptivo si no es así.
function parseEmpresa(value) {
    const empresa = String(value ?? "").toLowerCase();
    if (empresa !== "econnet" && empresa !== "rids") {
        throw new Error("Empresa inválida. Usa empresa=econnet o empresa=rids");
    }
    return empresa;
}
function assertClientePuedeConsultarTipo(req, tipo) {
    const rol = getUserRole(req);
    if (rol === "CLIENTE" && tipo === "compras") {
        const error = new Error("Los clientes solo pueden consultar RCV de ventas relacionados a su empresa");
        error.statusCode = 403;
        throw error;
    }
}
function getDetalleVentasBaseApi(data) {
    if (Array.isArray(data))
        return data;
    if (Array.isArray(data?.detalleVentas))
        return data.detalleVentas;
    if (Array.isArray(data?.ventas))
        return data.ventas;
    if (Array.isArray(data?.documentos))
        return data.documentos;
    if (Array.isArray(data?.items))
        return data.items;
    if (Array.isArray(data?.data?.datos))
        return data.data.datos;
    if (Array.isArray(data?.data?.detalleVentas))
        return data.data.detalleVentas;
    if (Array.isArray(data?.data?.ventas))
        return data.data.ventas;
    if (Array.isArray(data?.data?.documentos))
        return data.data.documentos;
    if (Array.isArray(data?.data?.items))
        return data.data.items;
    return [];
}
function getDetalleComprasBaseApi(data) {
    if (Array.isArray(data))
        return data;
    if (Array.isArray(data?.detalleCompras))
        return data.detalleCompras;
    if (Array.isArray(data?.compras))
        return data.compras;
    if (Array.isArray(data?.documentos))
        return data.documentos;
    if (Array.isArray(data?.items))
        return data.items;
    if (Array.isArray(data?.data?.datos))
        return data.data.datos;
    if (Array.isArray(data?.data?.detalleCompras))
        return data.data.detalleCompras;
    if (Array.isArray(data?.data?.compras))
        return data.data.compras;
    if (Array.isArray(data?.data?.documentos))
        return data.data.documentos;
    if (Array.isArray(data?.data?.items))
        return data.data.items;
    return [];
}
function getRutDocumentoBaseApi(doc) {
    return normalizeRut(doc?.["Rut cliente"] ??
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
        "");
}
function parsePeriodo(req) {
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
function getEmpresasConsulta(req) {
    const rol = String(req.user?.rol ?? "").toUpperCase().trim();
    if (rol === "CLIENTE") {
        return ["rids", "econnet"];
    }
    return [parseEmpresa(req.query.empresa)];
}
function parseForceRefresh(value) {
    return String(value ?? "false").toLowerCase() === "true";
}
function getUserRole(req) {
    return String(req.user?.rol ?? "").toUpperCase().trim();
}
function normalizeRut(value) {
    return String(value ?? "")
        .replace(/\./g, "")
        .replace(/-/g, "")
        .replace(/\s/g, "")
        .toUpperCase()
        .trim();
}
function mergeRcvResponses(responses, tipo) {
    const detalleVentas = [];
    const detalleCompras = [];
    for (const response of responses) {
        const documentos = tipo === "ventas"
            ? getDetalleVentasBaseApi(response.data)
            : getDetalleComprasBaseApi(response.data);
        const documentosConOrigen = documentos.map((doc) => ({
            ...doc,
            empresaOrigen: response.empresa,
        }));
        if (tipo === "ventas") {
            detalleVentas.push(...documentosConOrigen);
        }
        else {
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
async function getClienteRutPermitido(req) {
    const rol = getUserRole(req);
    if (rol !== "CLIENTE") {
        return null;
    }
    const user = req.user;
    const empresaId = Number(user.empresaId);
    if (!empresaId) {
        const error = new Error("Tu usuario no tiene una empresa asociada");
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
        const error = new Error("Empresa asociada no encontrada");
        error.statusCode = 404;
        throw error;
    }
    const rut = empresa.detalleEmpresa?.rut;
    if (!rut) {
        const error = new Error("La empresa asociada no tiene RUT registrado");
        error.statusCode = 400;
        throw error;
    }
    return normalizeRut(rut);
}
function filtrarRcvPorRutCliente(data, rutClienteNormalizado, tipo) {
    if (!data || typeof data !== "object")
        return data;
    const clone = typeof structuredClone === "function"
        ? structuredClone(data)
        : JSON.parse(JSON.stringify(data));
    const documentos = tipo === "ventas"
        ? getDetalleVentasBaseApi(clone)
        : getDetalleComprasBaseApi(clone);
    const filtrados = documentos.filter((doc) => {
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
        ejemplosDespues: filtrados.slice(0, 5).map((doc) => ({
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
// Función para consultar las RCV de ventas en BaseAPI, dado la empresa, el periodo, y si se debe forzar la actualización. Maneja la construcción del endpoint, el body de la petición, y la normalización de errores.
export async function getVentasRcvBaseApi(req, res) {
    try {
        assertClientePuedeConsultarTipo(req, "ventas");
        const empresas = getEmpresasConsulta(req);
        const { mes, ano } = parsePeriodo(req);
        const forceRefresh = parseForceRefresh(req.query.forceRefresh);
        const rutCliente = await getClienteRutPermitido(req);
        const resultados = await Promise.all(empresas.map(async (empresa) => {
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
                    ? dataFiltrada.data.datos.slice(0, 5).map((d) => ({
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
        }));
        let data = mergeRcvResponses(resultados, "ventas");
        // Anotar estadoPago en cada documento: CONFIRMADA | VENCIDA | PENDIENTE
        const now = new Date();
        async function parseFechaVencimiento(d) {
            const candidates = [
                d?.FchVenc,
                d?.FchVencimiento,
                d?.fechaVencimiento,
                d?.vencimiento,
                d?.fecha_vencimiento,
                d?.Vencimiento,
            ];
            for (const c of candidates) {
                if (!c)
                    continue;
                const raw = String(c).trim();
                const dt = new Date(raw);
                if (!Number.isNaN(dt.getTime()))
                    return dt;
                if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
                    const [day, month, year] = raw.slice(0, 10).split('/');
                    const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
                    if (!Number.isNaN(parsed.getTime()))
                        return parsed;
                }
            }
            return null;
        }
        async function annotateDocs(docs) {
            return Promise.all(docs.map(async (doc) => {
                try {
                    const tipoDoc = String(doc?.["Tipo Doc"] ?? doc?.tipoDoc ?? doc?.tipoDTE ?? "").trim();
                    const folio = String(doc?.["Folio"] ?? doc?.folio ?? doc?.Nro ?? doc?.numero ?? "").trim();
                    const empresaKey = String(doc?.empresaOrigen ?? doc?.empresa ?? doc?.empresaKey ?? "").toLowerCase() || undefined;
                    let estadoPago = null;
                    if (empresaKey && tipoDoc && folio) {
                        const conciliacion = await prisma.rcvConciliacion.findFirst({
                            where: {
                                empresaKey: empresaKey,
                                tipoDoc: tipoDoc,
                                folio: folio,
                            },
                            orderBy: { conciliadoAt: 'desc' }
                        });
                        if (conciliacion && conciliacion.estadoConciliacion === 'CONCILIADA') {
                            estadoPago = 'CONFIRMADA';
                        }
                    }
                    if (!estadoPago) {
                        // revisar si hay un override manual de vencimiento
                        let override = null;
                        // 1) intentar con la empresaKey del documento
                        if (empresaKey) {
                            override = await getVencimientoOverride(empresaKey, tipoDoc, folio);
                        }
                        // 2) si no se encontró, intentar con cualquiera de las empresas consultadas
                        if (!override && Array.isArray(empresas) && empresas.length > 0) {
                            for (const e of empresas) {
                                try {
                                    override = await getVencimientoOverride(String(e), tipoDoc, folio);
                                    if (override)
                                        break;
                                }
                                catch { /* ignore */ }
                            }
                        }
                        if (override) {
                            const dt = new Date(String(override));
                            if (!Number.isNaN(dt.getTime())) {
                                estadoPago = now > dt ? 'VENCIDA' : 'PENDIENTE';
                                // inyectar el vencimiento override en el documento para que la UI lo vea
                                try {
                                    const isoDate = dt.toISOString().slice(0, 10);
                                    for (const k of ["FchVenc", "FchVencimiento", "fechaVencimiento", "vencimiento", "fecha_vencimiento", "Vencimiento"]) {
                                        try {
                                            doc[k] = isoDate;
                                        }
                                        catch { }
                                    }
                                }
                                catch { }
                            }
                        }
                        if (!estadoPago) {
                            const fechaVenc = await parseFechaVencimiento(doc);
                            if (fechaVenc) {
                                estadoPago = now > fechaVenc ? 'VENCIDA' : 'PENDIENTE';
                            }
                            else {
                                estadoPago = 'PENDIENTE';
                            }
                        }
                    }
                    return { ...doc, estadoPago };
                }
                catch (e) {
                    return { ...doc, estadoPago: 'PENDIENTE' };
                }
            }));
        }
        data = {
            ...data,
            data: {
                ...(data.data || {}),
                datos: await annotateDocs(data.data?.datos ?? []),
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
    }
    catch (error) {
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
export async function getComprasRcvBaseApi(req, res) {
    try {
        assertClientePuedeConsultarTipo(req, "compras");
        const empresas = getEmpresasConsulta(req);
        const { mes, ano } = parsePeriodo(req);
        const forceRefresh = parseForceRefresh(req.query.forceRefresh);
        const rutCliente = await getClienteRutPermitido(req);
        const resultados = await Promise.all(empresas.map(async (empresa) => {
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
        }));
        let data = mergeRcvResponses(resultados, "compras");
        // Anotar estadoPago en cada documento: CONFIRMADA | VENCIDA | PENDIENTE
        const now = new Date();
        async function parseFechaVencimientoCompras(d) {
            const candidates = [
                d?.FchVenc,
                d?.FchVencimiento,
                d?.fechaVencimiento,
                d?.vencimiento,
                d?.fecha_vencimiento,
                d?.Vencimiento,
            ];
            for (const c of candidates) {
                if (!c)
                    continue;
                const raw = String(c).trim();
                const dt = new Date(raw);
                if (!Number.isNaN(dt.getTime()))
                    return dt;
                if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
                    const [day, month, year] = raw.slice(0, 10).split('/');
                    const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
                    if (!Number.isNaN(parsed.getTime()))
                        return parsed;
                }
            }
            return null;
        }
        async function annotateDocsCompras(docs) {
            return Promise.all(docs.map(async (doc) => {
                try {
                    const tipoDoc = String(doc?.["Tipo Doc"] ?? doc?.tipoDoc ?? doc?.tipoDTE ?? "").trim();
                    const folio = String(doc?.["Folio"] ?? doc?.folio ?? doc?.Nro ?? doc?.numero ?? "").trim();
                    const empresaKey = String(doc?.empresaOrigen ?? doc?.empresa ?? doc?.empresaKey ?? "").toLowerCase() || undefined;
                    let estadoPago = null;
                    if (empresaKey && tipoDoc && folio) {
                        const conciliacion = await prisma.rcvConciliacion.findFirst({
                            where: {
                                empresaKey: empresaKey,
                                tipoDoc: tipoDoc,
                                folio: folio,
                            },
                            orderBy: { conciliadoAt: 'desc' }
                        });
                        if (conciliacion && conciliacion.estadoConciliacion === 'CONCILIADA') {
                            estadoPago = 'CONFIRMADA';
                        }
                    }
                    if (!estadoPago) {
                        // intentar overrides manuales también para compras
                        let override = null;
                        if (empresaKey) {
                            override = await getVencimientoOverride(empresaKey, tipoDoc, folio).catch(() => null);
                        }
                        if (!override && Array.isArray(empresas) && empresas.length > 0) {
                            for (const e of empresas) {
                                try {
                                    override = await getVencimientoOverride(String(e), tipoDoc, folio);
                                    if (override)
                                        break;
                                }
                                catch { /* ignore */ }
                            }
                        }
                        if (override) {
                            const dt = new Date(String(override));
                            if (!Number.isNaN(dt.getTime())) {
                                estadoPago = now > dt ? 'VENCIDA' : 'PENDIENTE';
                                try {
                                    const isoDate = dt.toISOString().slice(0, 10);
                                    for (const k of ["FchVenc", "FchVencimiento", "fechaVencimiento", "vencimiento", "fecha_vencimiento", "Vencimiento"]) {
                                        try {
                                            doc[k] = isoDate;
                                        }
                                        catch { }
                                    }
                                }
                                catch { }
                            }
                        }
                        if (!estadoPago) {
                            const fechaVenc = await parseFechaVencimientoCompras(doc);
                            if (fechaVenc) {
                                estadoPago = now > fechaVenc ? 'VENCIDA' : 'PENDIENTE';
                            }
                            else {
                                estadoPago = 'PENDIENTE';
                            }
                        }
                    }
                    return { ...doc, estadoPago };
                }
                catch (e) {
                    return { ...doc, estadoPago: 'PENDIENTE' };
                }
            }));
        }
        data = {
            ...data,
            data: {
                ...(data.data || {}),
                datos: await annotateDocsCompras(data.data?.datos ?? []),
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({
            ok: false,
            provider: "baseapi",
            error: message,
            message,
        });
    }
}
//# sourceMappingURL=baseapi-rcv.controller.js.map