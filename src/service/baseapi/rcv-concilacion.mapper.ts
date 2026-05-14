export function toNumberRcv(value: any): number {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return value;

    const clean = String(value)
        .replace(/\$/g, "")
        .replace(/\./g, "")
        .replace(",", ".")
        .trim();

    const number = Number(clean);
    return Number.isFinite(number) ? number : 0;
}

export function normalizarFechaRcv(value: any): Date | null {
    if (!value) return null;

    const raw = String(value).trim();

    if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
        const [day, month, year] = raw.slice(0, 10).split("/");
        return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    }

    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function getRutContraparteRcv(doc: any, tipoRcv: "ventas" | "compras") {
    if (tipoRcv === "ventas") {
        return (
            doc["Rut cliente"] ??
            doc["RUT Cliente"] ??
            doc.rutCliente ??
            doc.rutReceptor ??
            ""
        );
    }

    return (
        doc["RUT Proveedor"] ??
        doc["Rut Proveedor"] ??
        doc.rutProveedor ??
        ""
    );
}

export function getMontoIvaRcv(doc: any) {
    return toNumberRcv(
        doc["Monto IVA"] ??
        doc["Monto Iva"] ??
        doc["Monto IVA Recuperable"] ??
        doc.montoIva ??
        doc.montoIVA ??
        0
    );
}

export function mapRcvToConciliacionInput(params: {
    doc: any;
    empresaKey: string;
    tipoRcv: "ventas" | "compras";
}) {
    const { doc, empresaKey, tipoRcv } = params;

    const tipoDoc = String(doc["Tipo Doc"] ?? doc.tipoDoc ?? doc.tipoDTE ?? "");
    const folio = String(doc["Folio"] ?? doc.folio ?? "");
    const rutContraparte = String(getRutContraparteRcv(doc, tipoRcv));
    const razonSocial = String(
        doc["Razon Social"] ??
        doc["Razón Social"] ??
        doc.razonSocial ??
        ""
    );

    return {
        empresaKey,
        tipoRcv,
        tipoDoc,
        folio,
        rutContraparte,
        razonSocial,
        fechaDocto: normalizarFechaRcv(
            doc["Fecha Docto"] ?? doc.fechaDocto ?? doc.fechaEmision
        ),
        montoNeto: toNumberRcv(doc["Monto Neto"] ?? doc.montoNeto ?? 0),
        montoIva: getMontoIvaRcv(doc),
        montoTotal: toNumberRcv(
            doc["Monto total"] ??
            doc["Monto Total"] ??
            doc.montoTotal ??
            0
        ),
        estadoRcv: doc.Estado ?? doc.estado ?? null,
        origenRcv: doc.origenRcv ?? null,
    };
}