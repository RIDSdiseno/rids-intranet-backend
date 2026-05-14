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
        res.status(500).json({
            ok: false,
            provider: "baseapi",
            error: message,
        });
    }
}
function getResponsable(req) {
    const user = req.user;
    return (user?.email ??
        user?.nombre ??
        req.body.responsable ??
        (user?.id ? `usuario:${user.id}` : null));
}
export async function postConciliarRcv(req, res) {
    try {
        const empresa = parseEmpresa(req.body.empresa);
        const tipoRcv = parseTipo(req.body.tipoRcv);
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
            formaPago: req.body.formaPago ?? null,
            observacion: req.body.observacion ?? null,
            responsable: getResponsable(req),
        });
        res.json({
            ok: true,
            data: resultado,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({
            ok: false,
            error: message,
        });
    }
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
        res.status(500).json({
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
        res.status(500).json({
            ok: false,
            error: message,
        });
    }
}
//# sourceMappingURL=baseapi-rcv-conciliacion.controller.js.map