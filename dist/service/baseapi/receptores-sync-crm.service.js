// src/service/baseapi/receptores-sync-crm.service.ts
//
// «Sincronizar desde el CRM» en Receptores de Facturación y de Cobranza.
//
// Reglas (acordadas 17-11-2026):
//   - Empresas ACTIVAS del CRM con RUT en detalle_empresas. El RUT se compara normalizado (760159867).
//   - Receptor que no existe → se crea APAGADO (recibeFacturas / recibeCobranza = false), activo, origen CRM.
//     En cobranza copia los días de crédito de la empresa.
//   - Receptor que existe → no se cambia su configuración; solo se completa empresaId si estaba vacío.
//   - Contactos: solo los ContactoEmpresa marcados «Recibe facturas» (facturación) o «Recibe cobranza»
//     (cobranza) con email válido. Se agregan los que faltan (email sin distinguir mayúsculas);
//     los existentes no se tocan.
//   - Dos empresas con el mismo RUT: se sincroniza la primera y se informa el conflicto.
//   - aplicar = false → simulación: no escribe nada y devuelve lo que haría.
// Se usa el cliente auditado (`prisma`): cada alta queda en AuditLog.
import { prisma } from "../../lib/prisma.js";
/* =========================================================
   HELPERS
========================================================= */
const normalizarRut = (v) => String(v ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
const normalizarEmail = (v) => String(v ?? "").trim().toLowerCase();
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* =========================================================
   CARGA
========================================================= */
function cargarEmpresas() {
    return prisma.empresa.findMany({
        where: { isActive: true },
        orderBy: { id_empresa: "asc" },
        select: {
            id_empresa: true,
            nombre: true,
            razonSocial: true,
            detalleEmpresa: { select: { rut: true, diasCredito: true } },
            contactoEmpresas: {
                orderBy: [{ principal: "desc" }, { id: "asc" }],
                select: {
                    nombre: true,
                    email: true,
                    principal: true,
                    recibeFacturas: true,
                    recibeCobranza: true,
                },
            },
        },
    });
}
/** Receptores existentes por RUT normalizado (aunque en la base esté guardado con otro formato). */
async function cargarReceptores(modulo) {
    const select = {
        id: true,
        rut: true,
        empresaId: true,
        contactos: { select: { email: true, principal: true } },
    };
    const filas = modulo === "FACTURACION"
        ? await prisma.receptorFacturacion.findMany({ select })
        : await prisma.receptorCobranza.findMany({ select });
    const mapa = new Map();
    for (const r of filas) {
        mapa.set(normalizarRut(r.rut), {
            id: r.id,
            empresaId: r.empresaId,
            emails: new Set(r.contactos.map((c) => normalizarEmail(c.email))),
            tienePrincipal: r.contactos.some((c) => c.principal),
        });
    }
    return mapa;
}
/* =========================================================
   APLICAR (una empresa)
========================================================= */
async function aplicarEmpresa(modulo, datos, existente, contactos) {
    /* Principal solo si el receptor aún no tiene uno, y solo el primero marcado */
    let principalDisponible = !existente?.tienePrincipal;
    const conPrincipal = contactos.map((c) => {
        const principal = principalDisponible && c.principal;
        if (principal)
            principalDisponible = false;
        return { ...c, principal };
    });
    await prisma.$transaction(async (tx) => {
        if (modulo === "FACTURACION") {
            const receptorId = existente
                ? existente.id
                : (await tx.receptorFacturacion.create({
                    data: {
                        rut: datos.rut,
                        razonSocial: datos.razonSocial,
                        activo: true,
                        recibeFacturas: false,
                        empresaId: datos.empresaId,
                        origen: "CRM",
                    },
                    select: { id: true },
                })).id;
            if (existente && existente.empresaId === null) {
                await tx.receptorFacturacion.update({
                    where: { id: existente.id },
                    data: { empresaId: datos.empresaId },
                });
            }
            for (const c of conPrincipal) {
                await tx.receptorFacturacionContacto.create({
                    data: {
                        receptorId,
                        nombre: c.nombre,
                        email: c.email,
                        activo: true,
                        recibeFacturas: true,
                        principal: c.principal,
                        origen: "CRM",
                    },
                });
            }
            return;
        }
        const receptorId = existente
            ? existente.id
            : (await tx.receptorCobranza.create({
                data: {
                    rut: datos.rut,
                    razonSocial: datos.razonSocial,
                    activo: true,
                    recibeCobranza: false,
                    diasCredito: datos.diasCredito,
                    empresaId: datos.empresaId,
                    origen: "CRM",
                },
                select: { id: true },
            })).id;
        if (existente && existente.empresaId === null) {
            await tx.receptorCobranza.update({
                where: { id: existente.id },
                data: { empresaId: datos.empresaId },
            });
        }
        for (const c of conPrincipal) {
            await tx.receptorCobranzaContacto.create({
                data: {
                    receptorId,
                    nombre: c.nombre,
                    email: c.email,
                    activo: true,
                    recibeCobranza: true,
                    principal: c.principal,
                    origen: "CRM",
                },
            });
        }
    });
}
/* =========================================================
   SINCRONIZAR
========================================================= */
let enCurso = false;
export async function sincronizarReceptoresDesdeCrm(modulo, aplicar) {
    if (aplicar && enCurso) {
        throw new Error("Ya hay una sincronización en curso. Espera a que termine.");
    }
    if (aplicar)
        enCurso = true;
    try {
        const [empresas, receptores] = await Promise.all([cargarEmpresas(), cargarReceptores(modulo)]);
        const resultado = {
            modulo,
            aplicado: aplicar,
            empresasEvaluadas: empresas.length,
            empresasSinRut: 0,
            empresasSinRutDetalle: [],
            sinCambios: 0,
            receptoresCreados: 0,
            receptoresVinculados: 0,
            contactosCreados: 0,
            contactosSinEmailValido: 0,
            rutDuplicados: [],
            errores: [],
            detalle: [],
        };
        const empresaPorRut = new Map();
        for (const empresa of empresas) {
            const rut = normalizarRut(empresa.detalleEmpresa?.rut);
            if (rut.length < 2) {
                resultado.empresasSinRut++;
                resultado.empresasSinRutDetalle.push({ empresaId: empresa.id_empresa, empresa: empresa.nombre });
                continue;
            }
            const previa = empresaPorRut.get(rut);
            if (previa) {
                const conflicto = resultado.rutDuplicados.find((d) => d.rut === rut);
                if (conflicto)
                    conflicto.empresas.push(empresa.nombre);
                else
                    resultado.rutDuplicados.push({ rut, empresas: [previa, empresa.nombre] });
                continue;
            }
            empresaPorRut.set(rut, empresa.nombre);
            /* Contactos marcados para este módulo, con email válido y sin repetir */
            const existente = receptores.get(rut);
            const yaEstan = new Set(existente?.emails ?? []);
            const nuevos = [];
            for (const c of empresa.contactoEmpresas) {
                const marcado = modulo === "FACTURACION" ? c.recibeFacturas : c.recibeCobranza;
                if (!marcado)
                    continue;
                const email = normalizarEmail(c.email);
                if (!EMAIL_VALIDO.test(email)) {
                    resultado.contactosSinEmailValido++;
                    continue;
                }
                if (yaEstan.has(email))
                    continue;
                yaEstan.add(email);
                nuevos.push({ nombre: c.nombre?.trim() || null, email, principal: c.principal });
            }
            const accion = !existente
                ? "CREAR"
                : existente.empresaId === null
                    ? "VINCULAR"
                    : nuevos.length > 0
                        ? "SOLO_CONTACTOS"
                        : null;
            if (!accion) {
                resultado.sinCambios++;
                continue;
            }
            const detalle = {
                empresaId: empresa.id_empresa,
                empresa: empresa.nombre,
                rut,
                accion,
                contactosNuevos: nuevos.map((c) => c.email),
            };
            if (aplicar) {
                try {
                    await aplicarEmpresa(modulo, {
                        empresaId: empresa.id_empresa,
                        razonSocial: empresa.razonSocial?.trim() || empresa.nombre,
                        rut,
                        diasCredito: empresa.detalleEmpresa?.diasCredito ?? null,
                    }, existente, nuevos);
                }
                catch (error) {
                    console.error(`[RECEPTORES ${modulo}] Error sincronizando ${empresa.nombre}`, error);
                    resultado.errores.push({
                        empresa: empresa.nombre,
                        rut,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    continue;
                }
            }
            if (accion === "CREAR")
                resultado.receptoresCreados++;
            if (accion === "VINCULAR")
                resultado.receptoresVinculados++;
            resultado.contactosCreados += nuevos.length;
            resultado.detalle.push(detalle);
        }
        return resultado;
    }
    finally {
        if (aplicar)
            enCurso = false;
    }
}
//# sourceMappingURL=receptores-sync-crm.service.js.map