// src/modules/sii-api/services/sii-normalizer.service.ts
function toNumber(value) {
    if (value === null || value === undefined || value === "")
        return null;
    const cleaned = String(value)
        .replace(/\./g, "")
        .replace(",", ".")
        .trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}
export function normalizeRcvResponse(raw) {
    if (!raw)
        return [];
    const data = raw;
    const documentos = data.detalle ??
        data.data ??
        data.documentos ??
        data.rcv ??
        data.result ??
        data;
    if (!Array.isArray(documentos)) {
        return [];
    }
    return documentos.map((doc) => ({
        tipoDte: doc.tipoDte ??
            doc.tipo_dte ??
            doc.tipoDocumento ??
            doc.tipo_doc ??
            doc.TipoDTE ??
            null,
        folio: doc.folio ??
            doc.Folio ??
            doc.numeroDocumento ??
            doc.numero_documento ??
            null,
        rutEmisor: doc.rutEmisor ??
            doc.rut_emisor ??
            doc.RutEmisor ??
            doc.rutProveedor ??
            null,
        razonSocialEmisor: doc.razonSocialEmisor ??
            doc.razon_social_emisor ??
            doc.RznSoc ??
            doc.proveedor ??
            null,
        rutReceptor: doc.rutReceptor ??
            doc.rut_receptor ??
            doc.RutReceptor ??
            null,
        razonSocialReceptor: doc.razonSocialReceptor ??
            doc.razon_social_receptor ??
            null,
        fechaEmision: doc.fechaEmision ??
            doc.fecha_emision ??
            doc.FchEmis ??
            doc.fecha ??
            null,
        fechaRecepcion: doc.fechaRecepcion ??
            doc.fecha_recepcion ??
            null,
        montoNeto: toNumber(doc.montoNeto ?? doc.monto_neto ?? doc.MntNeto ?? doc.neto),
        montoIva: toNumber(doc.montoIva ?? doc.monto_iva ?? doc.IVA ?? doc.iva),
        montoTotal: toNumber(doc.montoTotal ?? doc.monto_total ?? doc.MntTotal ?? doc.total),
        estado: doc.estado ??
            doc.estadoDocumento ??
            doc.estado_documento ??
            null,
        raw: doc,
    }));
}
//# sourceMappingURL=sii-normalizer.service.js.map