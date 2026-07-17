// src/controllers/baseapi/rcv-vencimientos.store.ts
import { prisma } from "../../lib/prisma.js";

function makeKey(empresaKey: string, tipoDoc: string, folio: string) {
  return {
    empresaKey: String(empresaKey || "").toLowerCase(),
    tipoDoc: String(tipoDoc || ""),
    folio: String(folio || ""),
  };
}

export async function getOverride(
  empresaKey: string,
  tipoDoc: string,
  folio: string
): Promise<string | null> {
  try {
    const record = await prisma.rcvVencimiento.findUnique({
      where: { empresaKey_tipoDoc_folio: makeKey(empresaKey, tipoDoc, folio) },
    });
    return record ? record.fechaVencimiento.toISOString().slice(0, 10) : null;
  } catch (e) {
    console.error("getOverride error:", e);
    return null;
  }
}

export async function setOverride(
  empresaKey: string,
  tipoDoc: string,
  folio: string,
  fechaIso: string | null
) {
  const key = makeKey(empresaKey, tipoDoc, folio);
  try {
    if (fechaIso === null || fechaIso === "") {
      await prisma.rcvVencimiento.deleteMany({ where: key });
    } else {
      await prisma.rcvVencimiento.upsert({
        where: { empresaKey_tipoDoc_folio: key },
        create: { ...key, fechaVencimiento: new Date(fechaIso) },
        update: { fechaVencimiento: new Date(fechaIso) },
      });
    }
  } catch (e) {
    console.error("setOverride error:", e);
    throw e;
  }
}

export async function listOverrides(): Promise<Record<string, string>> {
  try {
    const rows = await prisma.rcvVencimiento.findMany();
    const result: Record<string, string> = {};
    for (const r of rows) {
      const k = `${r.empresaKey}|${r.tipoDoc}|${r.folio}`;
      result[k] = r.fechaVencimiento.toISOString().slice(0, 10);
    }
    return result;
  } catch (e) {
    console.error("listOverrides error:", e);
    return {};
  }
}

export default { getOverride, setOverride, listOverrides };
