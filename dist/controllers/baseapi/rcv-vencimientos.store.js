// src/controllers/baseapi/rcv-vencimientos.store.ts
import { prisma } from "../../lib/prisma.js";
function makeKey(empresaKey, tipoDoc, folio) {
    return {
        empresaKey: String(empresaKey || "").toLowerCase(),
        tipoDoc: String(tipoDoc || ""),
        folio: String(folio || ""),
    };
}
export async function getOverride(empresaKey, tipoDoc, folio) {
    try {
        const record = await prisma.rcvVencimiento.findUnique({
            where: { empresaKey_tipoDoc_folio: makeKey(empresaKey, tipoDoc, folio) },
        });
        return record ? record.fechaVencimiento.toISOString().slice(0, 10) : null;
    }
    catch (e) {
        console.error("getOverride error:", e);
        return null;
    }
}
export async function setOverride(empresaKey, tipoDoc, folio, fechaIso) {
    const key = makeKey(empresaKey, tipoDoc, folio);
    try {
        if (fechaIso === null || fechaIso === "") {
            await prisma.rcvVencimiento.deleteMany({ where: key });
        }
        else {
            await prisma.rcvVencimiento.upsert({
                where: { empresaKey_tipoDoc_folio: key },
                create: { ...key, fechaVencimiento: new Date(fechaIso) },
                update: { fechaVencimiento: new Date(fechaIso) },
            });
        }
    }
    catch (e) {
        console.error("setOverride error:", e);
        throw e;
    }
}
export async function listOverrides() {
    try {
        const rows = await prisma.rcvVencimiento.findMany();
        const result = {};
        for (const r of rows) {
            const k = `${r.empresaKey}|${r.tipoDoc}|${r.folio}`;
            result[k] = r.fechaVencimiento.toISOString().slice(0, 10);
        }
        return result;
    }
    catch (e) {
        console.error("listOverrides error:", e);
        return {};
    }
}
export default { getOverride, setOverride, listOverrides };
//# sourceMappingURL=rcv-vencimientos.store.js.map