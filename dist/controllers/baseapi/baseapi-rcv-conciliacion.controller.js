import { conciliarDocumentoRcv, desconciliarDocumentoRcv, listarConciliacionRcv, observarDocumentoRcv, } from "../../service/baseapi/baseapi-rcv-conciliacion.service.js";
function parseEmpresa(value) {
    const empresa = String(value ?? "").toLowerCase();
    if (empresa !== "econnet" && empresa !== "rids") {
        throw new Error("Empresa inválida. Usa empresa=econnet o empresa=rids");
    }
    return empresa;
}
function parseTipo(value) {
    const tipo = String(value ?? "").toLowerCase();
    if (tipo !== "ventas" && tipo !== "compras") {
        throw new Error("Tipo inválido. Usa tipo=ventas o tipo=compras");
    }
    return tipo;
}
function parsePeriodo(req) {
    const mes = String(req.query.mes ?? "").padStart(2, "0");
    const ano = String(req.query.ano ?? "");
    if (!/^\d{4}$/.test(ano))
        throw new Error("Año inválido");
    if (!/^\d{2}$/.test(mes))
        throw new Error("Mes inválido");
    const mesNum = Number(mes);
    if (mesNum < 1 || mesNum > 12) {
        throw new Error("Mes fuera de rango");
    }
    return { mes, ano };
}
function parseForceRefresh(value) {
    return String(value ?? "false").toLowerCase() === "true";
}
function parseConciliadoAt(value) {
    if (!value) {
        return new Date();
    }
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
        throw new Error("Fecha de conciliación inválida");
    }
    return date;
}
function getErrorStatus(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("inválida") ||
        message.includes("inválido") ||
        message.includes("fuera de rango") ||
        message.includes("Debes seleccionar") ||
        message.includes("Debes ingresar")) {
        return 400;
    }
    return 500;
}
function getResponsable(req) {
    const user = req.user;
    return (user?.email ??
        user?.nombre ??
        req.body.responsable ??
        (user?.id ? `usuario:${user.id}` : null));
}
function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
function parseCorreosDestino(value) {
    if (Array.isArray(value)) {
        return value
            .map((email) => String(email).trim().toLowerCase())
            .filter(Boolean);
    }
    return String(value ?? "")
        .split(/[,;\n\r]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}
export async function getConciliacionRcv(req, res) {
    try {
        const empresa = parseEmpresa(req.query.empresa);
        const tipo = parseTipo(req.query.tipo);
        const { mes, ano } = parsePeriodo(req);
        const forceRefresh = parseForceRefresh(req.query.forceRefresh);
        const resultado = await listarConciliacionRcv({
            empresa,
            mes,
            ano,
            tipo,
            forceRefresh,
        });
        res.json({
            ok: true,
            provider: "baseapi",
            empresa,
            tipo,
            mes,
            ano,
            cached: resultado.cached,
            cacheUpdatedAt: resultado.cacheUpdatedAt,
            meta: resultado.meta,
            data: resultado.data,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(getErrorStatus(error)).json({
            ok: false,
            provider: "baseapi",
            error: message,
        });
    }
}
export async function postConciliarRcv(req, res) {
    try {
        const empresa = parseEmpresa(req.body.empresa);
        const tipoRcv = parseTipo(req.body.tipoRcv);
        const formaPago = String(req.body.formaPago ?? "").trim();
        if (!formaPago) {
            return res.status(400).json({
                ok: false,
                error: "Debes seleccionar una forma de pago o validación",
            });
        }
        const enviarCorreo = Boolean(req.body.enviarCorreo);
        const correosDestino = parseCorreosDestino(req.body.correoDestino);
        if (enviarCorreo && correosDestino.length === 0) {
            return res.status(400).json({
                ok: false,
                error: "Debes agregar al menos un correo destino",
            });
        }
        const correosInvalidos = correosDestino.filter((email) => !isValidEmail(email));
        if (enviarCorreo && correosInvalidos.length > 0) {
            return res.status(400).json({
                ok: false,
                error: `Correos destino inválidos: ${correosInvalidos.join(", ")}`,
            });
        }
        const resultado = await conciliarDocumentoRcv({
            empresa,
            tipoRcv,
            tipoDoc: String(req.body.tipoDoc),
            folio: String(req.body.folio),
            rutContraparte: String(req.body.rutContraparte),
            razonSocial: req.body.razonSocial,
            fechaDocto: req.body.fechaDocto ? new Date(req.body.fechaDocto) : null,
            montoNeto: Number(req.body.montoNeto ?? 0),
            montoIva: Number(req.body.montoIva ?? 0),
            montoTotal: Number(req.body.montoTotal ?? 0),
            estadoRcv: req.body.estadoRcv ?? null,
            origenRcv: req.body.origenRcv ?? null,
            formaPago,
            observacion: req.body.observacion ?? null,
            conciliadoAt: parseConciliadoAt(req.body.conciliadoAt),
            responsable: getResponsable(req),
            enviarCorreo,
            correoDestino: enviarCorreo ? correosDestino : [],
        });
        res.json({
            ok: true,
            data: resultado,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(getErrorStatus(error)).json({
            ok: false,
            error: message,
        });
    }
    return;
}
export async function postDesconciliarRcv(req, res) {
    try {
        const empresa = parseEmpresa(req.body.empresa);
        const tipoRcv = parseTipo(req.body.tipoRcv);
        const resultado = await desconciliarDocumentoRcv({
            empresa,
            tipoRcv,
            tipoDoc: String(req.body.tipoDoc),
            folio: String(req.body.folio),
            rutContraparte: String(req.body.rutContraparte),
        });
        res.json({
            ok: true,
            data: resultado,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(getErrorStatus(error)).json({
            ok: false,
            error: message,
        });
    }
}
export async function postObservarRcv(req, res) {
    try {
        const empresa = parseEmpresa(req.body.empresa);
        const tipoRcv = parseTipo(req.body.tipoRcv);
        const resultado = await observarDocumentoRcv({
            empresa,
            tipoRcv,
            tipoDoc: String(req.body.tipoDoc),
            folio: String(req.body.folio),
            rutContraparte: String(req.body.rutContraparte),
            observacion: String(req.body.observacion ?? ""),
            responsable: getResponsable(req),
        });
        res.json({
            ok: true,
            data: resultado,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(getErrorStatus(error)).json({
            ok: false,
            error: message,
        });
    }
}
//# sourceMappingURL=baseapi-rcv-conciliacion.controller.js.map