// src/service/baseapi/facturas/factura-envio-automatico.service.ts
import { prisma, } from "../../../lib/prisma.js";
import { consultarVentasRcvBaseApi, } from "../baseapi-rcv.service.js";
/* =========================================================
   CONSTANTES
========================================================= */
/*
 * Primera etapa:
 *
 * 33 = Factura Electrónica
 * 34 = Factura Exenta Electrónica
 *
 * No incluimos todavía:
 *
 * 56 = Nota de Débito
 * 61 = Nota de Crédito
 */
const TIPOS_FACTURA_ENVIABLES = new Set([
    "33",
    "34",
]);
/* =========================================================
   HELPERS RCV
========================================================= */
function getDocumentosVentas(data) {
    if (Array.isArray(data)) {
        return data;
    }
    if (Array.isArray(data?.detalleVentas)) {
        return data.detalleVentas;
    }
    if (Array.isArray(data?.ventas)) {
        return data.ventas;
    }
    if (Array.isArray(data?.documentos)) {
        return data.documentos;
    }
    if (Array.isArray(data?.items)) {
        return data.items;
    }
    if (Array.isArray(data?.data?.datos)) {
        return data.data.datos;
    }
    if (Array.isArray(data?.data?.detalleVentas)) {
        return data.data.detalleVentas;
    }
    if (Array.isArray(data?.data?.ventas)) {
        return data.data.ventas;
    }
    if (Array.isArray(data?.data?.documentos)) {
        return data.data.documentos;
    }
    return [];
}
function normalizeRut(value) {
    return String(value ??
        "")
        .replace(/[^0-9kK]/g, "")
        .toUpperCase()
        .trim();
}
function normalizeEmail(value) {
    return String(value ??
        "")
        .trim()
        .toLowerCase();
}
function getTipoDoc(doc) {
    return String(doc?.["Tipo Doc"] ??
        doc?.tipoDoc ??
        doc?.tipoDTE ??
        "").trim();
}
function getFolio(doc) {
    return String(doc?.["Folio"] ??
        doc?.folio ??
        doc?.Nro ??
        doc?.numero ??
        "").trim();
}
function getRutDocumento(doc) {
    return normalizeRut(doc?.["Rut cliente"] ??
        doc?.["RUT Cliente"] ??
        doc?.["Rut Receptor"] ??
        doc?.["RUT Receptor"] ??
        doc?.rutCliente ??
        doc?.rutReceptor ??
        doc?.rut ??
        doc?.RUT ??
        "");
}
function getRazonSocial(doc) {
    const value = doc?.["Razon Social"] ??
        doc?.["Razón Social"] ??
        doc?.razonSocial ??
        doc?.razon_social ??
        doc?.razonSocialReceptor ??
        null;
    if (value ===
        null ||
        value ===
            undefined) {
        return null;
    }
    const text = String(value).trim();
    return text ||
        null;
}
function toNumberCL(value) {
    if (typeof value ===
        "number") {
        return Number.isFinite(value)
            ? Math.round(value)
            : 0;
    }
    const raw = String(value ??
        "")
        .trim()
        .replace(/\$/g, "")
        .replace(/\s/g, "")
        .replace(/\./g, "")
        .replace(",", ".");
    const parsed = Number(raw);
    return Number.isFinite(parsed)
        ? Math.round(parsed)
        : 0;
}
function getMontoTotal(doc) {
    return toNumberCL(doc?.["Monto total"] ??
        doc?.["Monto Total"] ??
        doc?.montoTotal ??
        doc?.total ??
        0);
}
function getFechaDocumentoRaw(doc) {
    return (doc?.["Fecha Docto"] ??
        doc?.["Fecha Documento"] ??
        doc?.fechaDocto ??
        doc?.fechaDocumento ??
        doc?.fechaEmision ??
        null);
}
/* =========================================================
   FECHAS
========================================================= */
function parseFechaIso(value) {
    if (!value) {
        return null;
    }
    const raw = String(value).trim();
    if (!raw) {
        return null;
    }
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (iso) {
        return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }
    const chilena = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
    if (chilena) {
        const dia = Number(chilena[1]);
        const mes = Number(chilena[2]);
        const ano = Number(chilena[3]);
        const fecha = new Date(Date.UTC(ano, mes - 1, dia));
        if (fecha.getUTCFullYear() !==
            ano ||
            fecha.getUTCMonth() !==
                mes - 1 ||
            fecha.getUTCDate() !==
                dia) {
            return null;
        }
        return [
            ano,
            String(mes).padStart(2, "0"),
            String(dia).padStart(2, "0"),
        ].join("-");
    }
    return null;
}
function calcularDiasAntiguedad(fechaIso, referencia = new Date()) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaIso);
    if (!match) {
        return null;
    }
    const fechaDocumento = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const hoy = Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), referencia.getUTCDate());
    return Math.floor((hoy -
        fechaDocumento) /
        86_400_000);
}
/*
 * Convierte un año/mes a un número secuencial.
 *
 * Ejemplo:
 *
 * 2026-09 -> 2026 * 12 + 9
 *
 * Esto permite comparar correctamente períodos
 * incluso al pasar de diciembre a enero.
 */
function getPeriodoNumerico(ano, mes) {
    return (Number(ano) *
        12 +
        Number(mes));
}
function getPeriodosNecesarios(diasAntiguedadMax, referencia = new Date()) {
    /*
     * +1 para cubrir el mes actual.
     *
     * Ejemplo:
     *
     * 30 días:
     * normalmente necesitamos mes actual + anterior.
     *
     * Usamos 28 como base conservadora para no perder
     * documentos al cambiar de mes.
     */
    const cantidadMeses = Math.max(1, Math.ceil(diasAntiguedadMax /
        28) +
        1);
    const periodos = [];
    for (let i = 0; i <
        cantidadMeses; i++) {
        const fecha = new Date(referencia.getFullYear(), referencia.getMonth() -
            i, 1);
        const ano = String(fecha.getFullYear());
        const mes = String(fecha.getMonth() +
            1).padStart(2, "0");
        periodos.push({
            ano,
            mes,
            periodo: `${ano}-${mes}`,
        });
    }
    return periodos;
}
/* =========================================================
   CARGAR RCV
   - modo manual: utiliza cache existente
   - scheduler: refresca mes actual + mes anterior
========================================================= */
async function cargarFacturasRcv(empresa, diasAntiguedadMax, options) {
    const periodos = getPeriodosNecesarios(diasAntiguedadMax);
    /*
     * Determinamos el período actual utilizando
     * America/Santiago para no depender del timezone
     * configurado en Railway / Node.
     */
    const partesActuales = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
    }).formatToParts(new Date());
    const getParteActual = (type) => partesActuales.find((item) => item.type ===
        type)?.value ??
        "";
    const anoActual = getParteActual("year");
    const mesActual = getParteActual("month");
    const periodoActualNumerico = getPeriodoNumerico(anoActual, mesActual);
    const documentos = [];
    console.log(`[FACTURA AUTO] ${empresa.toUpperCase()} períodos a consultar`, periodos.map((item) => item.periodo));
    /*
     * Consulta secuencial para evitar presión innecesaria
     * sobre BaseAPI.
     *
     * Cuando refrescarPeriodosRecientes=true:
     *
     * - mes actual     -> forceRefresh=true
     * - mes anterior   -> forceRefresh=true
     * - meses antiguos -> forceRefresh=false
     */
    for (const periodo of periodos) {
        try {
            const periodoNumerico = getPeriodoNumerico(periodo.ano, periodo.mes);
            const diferenciaMeses = periodoActualNumerico -
                periodoNumerico;
            const esPeriodoReciente = diferenciaMeses >=
                0 &&
                diferenciaMeses <=
                    1;
            const forceRefresh = Boolean(options
                ?.refrescarPeriodosRecientes) &&
                esPeriodoReciente;
            console.log(`[FACTURA AUTO] ${empresa.toUpperCase()} consultando período`, {
                periodo: periodo.periodo,
                diferenciaMeses,
                esPeriodoReciente,
                forceRefresh,
            });
            const resultado = await consultarVentasRcvBaseApi({
                empresa,
                mes: periodo.mes,
                ano: periodo.ano,
                forceRefresh,
            });
            const docs = getDocumentosVentas(resultado.data);
            documentos.push(...docs.map((doc) => ({
                ...doc,
                periodoFacturaOrigen: periodo.periodo,
            })));
            console.log(`[FACTURA AUTO] ✅ ${empresa.toUpperCase()} ${periodo.periodo}`, {
                documentos: docs.length,
                cached: resultado.cached,
                forceRefresh,
            });
        }
        catch (error) {
            console.error(`[FACTURA AUTO] ❌ ${empresa.toUpperCase()} ${periodo.periodo}`, {
                error: error instanceof Error
                    ? error.message
                    : String(error),
            });
        }
    }
    return documentos;
}
/* =========================================================
   RECEPTORES DE FACTURACIÓN
========================================================= */
async function prepararReceptoresFacturacionDesdeRcv(documentos) {
    /*
     * Reunimos todos los receptores identificables del RCV.
     *
     * Los que todavía no existen se crean como:
     *
     * activo = true
     * recibeFacturas = false
     * origen = RCV
     *
     * IMPORTANTE:
     * descubrir un receptor NO significa autorizarlo.
     */
    const receptoresPorRut = new Map();
    for (const documento of documentos) {
        const tipoDoc = getTipoDoc(documento);
        /*
         * Solo nos interesan actualmente
         * facturas 33 / 34.
         */
        if (!TIPOS_FACTURA_ENVIABLES.has(tipoDoc)) {
            continue;
        }
        const rut = getRutDocumento(documento);
        if (!rut) {
            continue;
        }
        const razonSocial = getRazonSocial(documento);
        const existente = receptoresPorRut.get(rut);
        /*
         * Conservamos la primera razón social útil.
         */
        if (!existente) {
            receptoresPorRut.set(rut, {
                rut,
                razonSocial,
            });
            continue;
        }
        if (!existente.razonSocial &&
            razonSocial) {
            existente.razonSocial =
                razonSocial;
        }
    }
    if (receptoresPorRut.size ===
        0) {
        return;
    }
    /*
     * Creamos únicamente receptores que aún
     * no existan.
     *
     * skipDuplicates + rut UNIQUE mantiene
     * esta operación idempotente.
     */
    await prisma
        .receptorFacturacion
        .createMany({
        data: Array.from(receptoresPorRut
            .values()).map((receptor) => ({
            rut: receptor.rut,
            razonSocial: receptor.razonSocial,
            activo: true,
            recibeFacturas: false,
            origen: "RCV",
        })),
        skipDuplicates: true,
    });
    /*
     * Actualizamos razón social únicamente
     * cuando disponemos de una.
     *
     * NO modificamos recibeFacturas.
     */
    for (const receptor of receptoresPorRut.values()) {
        if (!receptor.razonSocial) {
            continue;
        }
        await prisma
            .receptorFacturacion
            .update({
            where: {
                rut: receptor.rut,
            },
            data: {
                razonSocial: receptor.razonSocial,
            },
        });
    }
}
async function cargarReceptoresFacturacion(ruts) {
    const rutsUnicos = Array.from(new Set(ruts
        .map(normalizeRut)
        .filter(Boolean)));
    if (rutsUnicos.length ===
        0) {
        return new Map();
    }
    const receptores = await prisma
        .receptorFacturacion
        .findMany({
        where: {
            rut: {
                in: rutsUnicos,
            },
        },
        include: {
            empresa: {
                select: {
                    id_empresa: true,
                    nombre: true,
                },
            },
            contactos: {
                where: {
                    activo: true,
                    recibeFacturas: true,
                },
                orderBy: [
                    {
                        principal: "desc",
                    },
                    {
                        id: "asc",
                    },
                ],
            },
        },
    });
    const map = new Map();
    for (const receptor of receptores) {
        map.set(normalizeRut(receptor.rut), receptor);
    }
    return map;
}
/* =========================================================
   PROCESAR EMPRESA
========================================================= */
async function procesarEmpresa(empresa, options) {
    console.log(`[FACTURA AUTO] ▶ Iniciando ${empresa.toUpperCase()}`);
    const config = await prisma
        .rcvFacturaEnvioConfig
        .findUnique({
        where: {
            empresaKey: empresa,
        },
    });
    if (!config) {
        return {
            empresa,
            configurada: false,
            activa: false,
            envioAutomatico: false,
            diasAntiguedadMax: 0,
            documentosAnalizados: 0,
            facturasTipoPermitido: 0,
            fueraDeAntiguedad: 0,
            sinIdentificacion: 0,
            candidatos: 0,
            candidatosConDestinatario: 0,
            candidatosSinDestinatario: 0,
            detalle: [],
            error: "No existe RcvFacturaEnvioConfig",
        };
    }
    if (!config.activo) {
        return {
            empresa,
            configurada: true,
            activa: false,
            envioAutomatico: config
                .envioAutomatico,
            diasAntiguedadMax: config
                .diasAntiguedadMax,
            documentosAnalizados: 0,
            facturasTipoPermitido: 0,
            fueraDeAntiguedad: 0,
            sinIdentificacion: 0,
            candidatos: 0,
            candidatosConDestinatario: 0,
            candidatosSinDestinatario: 0,
            detalle: [],
        };
    }
    const documentos = await cargarFacturasRcv(empresa, config
        .diasAntiguedadMax, {
        refrescarPeriodosRecientes: options
            ?.refrescarPeriodosRecientes ??
            false,
    });
    /*
     * Descubrimos receptores presentes en el RCV.
     *
     * Los nuevos quedan:
     *
     * activo = true
     * recibeFacturas = false
     * origen = RCV
     *
     * Es decir: se registran, pero NO quedan
     * autorizados automáticamente.
     */
    if (options
        ?.descubrirReceptores) {
        await prepararReceptoresFacturacionDesdeRcv(documentos);
    }
    const rutsDocumentos = documentos
        .map((documento) => getRutDocumento(documento))
        .filter((rut) => Boolean(rut));
    const receptoresPorRut = await cargarReceptoresFacturacion(rutsDocumentos);
    /*
     * Cargamos envíos existentes de esta empresa emisora
     * una sola vez.
     */
    const enviosExistentes = await prisma
        .rcvFacturaEnvio
        .findMany({
        where: {
            empresaKey: empresa,
        },
        select: {
            tipoDoc: true,
            folio: true,
            rutContraparte: true,
            emailDestino: true,
            estado: true,
            enviadoAt: true,
        },
    });
    const enviosMap = new Map();
    for (const envio of enviosExistentes) {
        const key = [
            envio.tipoDoc,
            envio.folio,
            normalizeRut(envio
                .rutContraparte),
            String(envio.emailDestino)
                .trim()
                .toLowerCase(),
        ].join("|");
        enviosMap.set(key, envio);
    }
    let facturasTipoPermitido = 0;
    let fueraDeAntiguedad = 0;
    let sinIdentificacion = 0;
    const detalle = [];
    for (const documento of documentos) {
        const tipoDoc = getTipoDoc(documento);
        /*
         * Solamente 33 / 34.
         */
        if (!TIPOS_FACTURA_ENVIABLES.has(tipoDoc)) {
            continue;
        }
        facturasTipoPermitido++;
        const folio = getFolio(documento);
        const rutContraparte = getRutDocumento(documento);
        const fechaEmision = parseFechaIso(getFechaDocumentoRaw(documento));
        if (!folio ||
            !rutContraparte ||
            !fechaEmision) {
            sinIdentificacion++;
            continue;
        }
        const diasAntiguedad = calcularDiasAntiguedad(fechaEmision);
        if (diasAntiguedad ===
            null) {
            sinIdentificacion++;
            continue;
        }
        /*
         * Una fecha futura no debe disparar un envío.
         */
        if (diasAntiguedad <
            0) {
            continue;
        }
        if (diasAntiguedad >
            config
                .diasAntiguedadMax) {
            fueraDeAntiguedad++;
            continue;
        }
        const receptor = receptoresPorRut.get(rutContraparte);
        /*
         * Para simulación también mostramos los casos
         * sin destinatario, ya que sirven para auditoría.
         */
        if (!receptor) {
            detalle.push({
                empresaKey: empresa,
                tipoRcv: "ventas",
                tipoDoc,
                folio,
                rutContraparte,
                razonSocial: getRazonSocial(documento),
                montoTotal: getMontoTotal(documento),
                fechaEmision,
                diasAntiguedad,
                periodoOrigen: String(documento
                    ?.periodoFacturaOrigen ??
                    ""),
                empresaClienteId: null,
                empresaClienteNombre: null,
                empresaClienteActiva: false,
                empresaRecibeFacturas: false,
                destinatarios: [],
                tieneDestinatarios: false,
                yaRegistradaParaTodos: false,
            });
            continue;
        }
        const emailsUsados = new Set();
        const destinatarios = [];
        /*
         * Solo un receptor autorizado puede generar
         * destinatarios.
         */
        if (receptor.activo &&
            receptor.recibeFacturas) {
            for (const contacto of receptor.contactos) {
                const email = normalizeEmail(contacto.email);
                if (!email) {
                    continue;
                }
                if (emailsUsados.has(email)) {
                    continue;
                }
                emailsUsados.add(email);
                const key = [
                    tipoDoc,
                    folio,
                    rutContraparte,
                    email,
                ].join("|");
                const envio = enviosMap.get(key);
                destinatarios.push({
                    contactoId: contacto.id,
                    nombre: contacto.nombre ??
                        receptor.razonSocial ??
                        "Contacto facturación",
                    email,
                    cargo: null,
                    principal: contacto.principal,
                    yaRegistrado: Boolean(envio),
                    estadoEnvio: envio
                        ?.estado ??
                        null,
                    enviadoAt: envio
                        ?.enviadoAt ??
                        null,
                });
            }
        }
        destinatarios.sort((a, b) => Number(b.principal) -
            Number(a.principal));
        const tieneDestinatarios = destinatarios.length >
            0;
        const yaRegistradaParaTodos = tieneDestinatarios &&
            destinatarios.every((item) => item
                .yaRegistrado);
        detalle.push({
            empresaKey: empresa,
            tipoRcv: "ventas",
            tipoDoc,
            folio,
            rutContraparte,
            razonSocial: getRazonSocial(documento),
            montoTotal: getMontoTotal(documento),
            fechaEmision,
            diasAntiguedad,
            periodoOrigen: String(documento
                ?.periodoFacturaOrigen ??
                ""),
            empresaClienteId: receptor.empresaId ??
                null,
            empresaClienteNombre: receptor.empresa
                ?.nombre ??
                receptor.razonSocial ??
                null,
            empresaClienteActiva: receptor.activo,
            empresaRecibeFacturas: receptor.recibeFacturas,
            destinatarios,
            tieneDestinatarios,
            yaRegistradaParaTodos,
        });
    }
    /*
     * Ordenar de más reciente a más antigua.
     */
    detalle.sort((a, b) => a
        .diasAntiguedad -
        b
            .diasAntiguedad);
    const candidatosConDestinatario = detalle.filter((item) => item
        .tieneDestinatarios).length;
    const candidatosSinDestinatario = detalle.length -
        candidatosConDestinatario;
    console.log(`[FACTURA AUTO] ${empresa.toUpperCase()} resumen`, {
        documentosAnalizados: documentos.length,
        facturasTipoPermitido,
        fueraDeAntiguedad,
        sinIdentificacion,
        candidatos: detalle.length,
        candidatosConDestinatario,
        candidatosSinDestinatario,
    });
    return {
        empresa,
        configurada: true,
        activa: true,
        envioAutomatico: config
            .envioAutomatico,
        diasAntiguedadMax: config
            .diasAntiguedadMax,
        documentosAnalizados: documentos.length,
        facturasTipoPermitido,
        fueraDeAntiguedad,
        sinIdentificacion,
        candidatos: detalle.length,
        candidatosConDestinatario,
        candidatosSinDestinatario,
        detalle,
    };
}
/* =========================================================
   HELPERS ENVÍO
========================================================= */
function fechaIsoADate(fechaIso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaIso);
    if (!match) {
        return null;
    }
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}
function construirAsuntoFactura(params) {
    const nombreDocumento = params
        .tipoDoc ===
        "34"
        ? "Factura Exenta Electrónica"
        : "Factura Electrónica";
    const emisor = params
        .empresa ===
        "econnet"
        ? "ECONNET"
        : "RIDS";
    return (`${nombreDocumento} N° ${params.folio} - ${emisor}`);
}
async function ejecutarAnalisisFacturas(options) {
    const empresas = options
        ?.empresas ??
        [
            "econnet",
            "rids",
        ];
    const resultados = [];
    for (const empresa of empresas) {
        try {
            resultados.push(await procesarEmpresa(empresa, {
                descubrirReceptores: options
                    ?.descubrirReceptores ??
                    false,
                refrescarPeriodosRecientes: options
                    ?.refrescarPeriodosRecientes ??
                    false,
            }));
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error);
            resultados.push({
                empresa,
                configurada: false,
                activa: false,
                envioAutomatico: false,
                diasAntiguedadMax: 0,
                documentosAnalizados: 0,
                facturasTipoPermitido: 0,
                fueraDeAntiguedad: 0,
                sinIdentificacion: 0,
                candidatos: 0,
                candidatosConDestinatario: 0,
                candidatosSinDestinatario: 0,
                detalle: [],
                error: message,
            });
        }
    }
    const totalDocumentos = resultados.reduce((total, item) => total +
        item
            .documentosAnalizados, 0);
    const totalCandidatos = resultados.reduce((total, item) => total +
        item
            .candidatos, 0);
    return {
        modo: "SIMULACION",
        generadoAt: new Date(),
        empresas: resultados,
        totalDocumentos,
        totalCandidatos,
    };
}
/* =========================================================
   PROCESO PRINCIPAL
========================================================= */
export async function simularFacturasEmitidas(options) {
    console.log("[FACTURA AUTO] ========================================");
    console.log("[FACTURA AUTO] INICIO SIMULACIÓN");
    const resultado = await ejecutarAnalisisFacturas({
        ...(options?.empresas
            ? {
                empresas: options.empresas,
            }
            : {}),
        descubrirReceptores: false,
        /*
         * La simulación nunca fuerza una consulta
         * real al SII/BaseAPI.
         */
        refrescarPeriodosRecientes: false,
    });
    console.log("[FACTURA AUTO] RESUMEN FINAL", {
        totalDocumentos: resultado
            .totalDocumentos,
        totalCandidatos: resultado
            .totalCandidatos,
    });
    console.log("[FACTURA AUTO] ========================================");
    return resultado;
}
/* =========================================================
   PREPARAR ENVÍOS
========================================================= */
export async function prepararFacturasEmitidas(options) {
    console.log("[FACTURA AUTO] ========================================");
    console.log("[FACTURA AUTO] INICIO PREPARACIÓN");
    /*
     * Reutilizamos exactamente el mismo detector
     * de la simulación.
     *
     * Esto evita tener dos lógicas distintas para:
     *
     * - empresa
     * - RUT
     * - antigüedad
     * - destinatarios
     * - permisos
     */
    const simulacion = await ejecutarAnalisisFacturas({
        ...(options?.empresas
            ? {
                empresas: options.empresas,
            }
            : {}),
        descubrirReceptores: true,
        refrescarPeriodosRecientes: options
            ?.refrescarPeriodosRecientes ??
            false,
    });
    const empresas = simulacion
        .empresas
        .filter((item) => item
        .configurada &&
        item
            .activa)
        .map((item) => item
        .empresa);
    /*
     * Un documento puede tener uno o varios
     * destinatarios.
     *
     * Cada destinatario genera una fila
     * independiente en RcvFacturaEnvio.
     */
    const registrosPreparar = [];
    let candidatosEnviables = 0;
    for (const resultadoEmpresa of simulacion.empresas) {
        if (!resultadoEmpresa
            .configurada ||
            !resultadoEmpresa
                .activa) {
            continue;
        }
        for (const documento of resultadoEmpresa
            .detalle) {
            if (!documento
                .tieneDestinatarios) {
                continue;
            }
            /*
             * Contamos documentos, no destinatarios.
             */
            candidatosEnviables++;
            for (const destinatario of documento
                .destinatarios) {
                const email = destinatario
                    .email
                    .trim()
                    .toLowerCase();
                if (!email) {
                    continue;
                }
                /*
                 * Aunque la simulación ya informa
                 * yaRegistrado, NO dependemos de eso
                 * para la idempotencia.
                 *
                 * La garantía real será:
                 *
                 * @@unique(...)
                 * +
                 * skipDuplicates
                 */
                registrosPreparar.push({
                    empresaKey: documento
                        .empresaKey,
                    tipoRcv: documento
                        .tipoRcv,
                    tipoDoc: documento
                        .tipoDoc,
                    folio: documento
                        .folio,
                    rutContraparte: documento
                        .rutContraparte,
                    razonSocial: documento
                        .razonSocial,
                    emailDestino: email,
                    nombreDestino: destinatario
                        .nombre ??
                        null,
                    asunto: construirAsuntoFactura({
                        empresa: documento
                            .empresaKey,
                        tipoDoc: documento
                            .tipoDoc,
                        folio: documento
                            .folio,
                    }),
                    estado: "PENDIENTE",
                    automatico: true,
                    montoTotal: documento
                        .montoTotal,
                    fechaEmision: fechaIsoADate(documento
                        .fechaEmision),
                });
            }
        }
    }
    /*
     * Defensa adicional:
     *
     * evitamos duplicados dentro del mismo array
     * antes de llegar a Prisma.
     */
    const registrosUnicosMap = new Map();
    for (const registro of registrosPreparar) {
        const key = [
            registro
                .empresaKey,
            registro
                .tipoRcv,
            registro
                .tipoDoc,
            registro
                .folio,
            normalizeRut(registro
                .rutContraparte),
            registro
                .emailDestino
                .trim()
                .toLowerCase(),
        ].join("|");
        registrosUnicosMap.set(key, registro);
    }
    const registrosUnicos = Array.from(registrosUnicosMap.values());
    const registrosEsperados = registrosUnicos.length;
    let nuevos = 0;
    if (registrosEsperados >
        0) {
        /*
         * La constraint de Prisma es:
         *
         * @@unique([
         *   empresaKey,
         *   tipoRcv,
         *   tipoDoc,
         *   folio,
         *   rutContraparte,
         *   emailDestino
         * ])
         *
         * PostgreSQL + skipDuplicates hace que este
         * endpoint sea idempotente incluso si se ejecuta
         * repetidamente.
         */
        const resultadoCreate = await prisma
            .rcvFacturaEnvio
            .createMany({
            data: registrosUnicos,
            skipDuplicates: true,
        });
        nuevos =
            resultadoCreate
                .count;
    }
    const existentes = registrosEsperados -
        nuevos;
    console.log("[FACTURA AUTO] PREPARACIÓN FINALIZADA", {
        documentosEvaluados: simulacion
            .totalCandidatos,
        candidatosEnviables,
        registrosEsperados,
        nuevos,
        existentes,
        emailsEnviados: 0,
    });
    console.log("[FACTURA AUTO] ========================================");
    return {
        modo: "PREPARACION",
        generadoAt: new Date(),
        empresas,
        documentosEvaluados: simulacion
            .totalCandidatos,
        candidatosEnviables,
        registrosEsperados,
        nuevos,
        existentes,
        emailsEnviados: 0,
    };
}
//# sourceMappingURL=factura-envio-automatico.service.js.map