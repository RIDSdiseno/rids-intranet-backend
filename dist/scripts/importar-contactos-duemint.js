// src/scripts/importar-contactos-duemint.ts
//
// Importa los contactos de Duemint (export «Clientes - Contactos») a los clientes del CRM.
//
//   npx tsx src/scripts/importar-contactos-duemint.ts <archivo.xlsx> [--real] [--detalle]
//
//   sin --real  SIMULACIÓN: muestra qué haría, no escribe nada
//   --real      crea los contactos
//   --detalle   lista cada contacto nuevo y cada nombre completado
//
// Reglas:
// - Se relaciona por RUT del cliente (columna «Rut», normalizado sin puntos ni guion).
// - Solo nombre y correo. Teléfono, tipo de contacto y división no se importan.
// - NO activa ningún envío: el contacto queda con «Facturas» y «Cobranza» desmarcados
//   (ReceptorFacturacionContacto con recibeFacturas = false, origen DUEMINT).
//   Para que reciba correos, se marca después en Clientes → ficha → Contactos.
// - Se guarda en Facturación porque ese receptor no cambia ningún envío:
//   crear un receptor de Cobranza apagado cortaría la cobranza que hoy sale
//   por los contactos de la Empresa del CRM (respaldo cuando no hay receptor).
// - Si el cliente no tiene receptor de facturación, se crea apagado (recibeFacturas = false).
// - Si el correo ya existe para ese RUT (facturación o cobranza), no se toca;
//   solo se completa el nombre si en el CRM está vacío.
import "dotenv/config";
import { createRequire } from "node:module";
import { prisma } from "../lib/prisma.js";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith("--"));
const REAL = args.includes("--real");
const DETALLE = args.includes("--detalle");
if (!archivo) {
    console.error("Uso: npx tsx src/scripts/importar-contactos-duemint.ts <archivo.xlsx> [--real] [--detalle]");
    process.exit(1);
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normalizarRut = (v) => String(v ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
const normalizarEmail = (v) => String(v ?? "").trim().toLowerCase();
const limpiarTexto = (v) => String(v ?? "").replace(/\s+/g, " ").trim() || null;
function leerArchivo(ruta) {
    const libro = XLSX.readFile(ruta);
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { defval: null });
    const columnas = Object.keys(filas[0] ?? {});
    for (const requerida of ["Rut", "Email Contacto"]) {
        if (!columnas.includes(requerida))
            throw new Error(`El archivo no tiene la columna «${requerida}». Columnas: ${columnas.join(", ")}`);
    }
    const validas = [];
    const invalidas = [];
    const vistos = new Set();
    filas.forEach((f, i) => {
        const rut = normalizarRut(f["Rut"]);
        const email = normalizarEmail(f["Email Contacto"]);
        if (rut.length < 2)
            return invalidas.push({ fila: i + 2, motivo: "RUT vacío o inválido", valor: String(f["Rut"] ?? "") });
        if (!EMAIL_RE.test(email))
            return invalidas.push({ fila: i + 2, motivo: "Correo inválido", valor: String(f["Email Contacto"] ?? "") });
        const clave = `${rut}|${email}`;
        if (vistos.has(clave))
            return invalidas.push({ fila: i + 2, motivo: "Duplicado en el archivo", valor: email });
        vistos.add(clave);
        validas.push({ rut, cliente: limpiarTexto(f["Cliente"]), nombre: limpiarTexto(f["Nombre Contacto"]), email });
        return undefined;
    });
    return { total: filas.length, validas, invalidas };
}
async function main() {
    const { total, validas, invalidas } = leerArchivo(archivo);
    const ruts = [...new Set(validas.map((f) => f.rut))];
    const [facturacion, cobranza] = await Promise.all([
        prisma.receptorFacturacion.findMany({ where: { rut: { in: ruts } }, include: { contactos: true } }),
        prisma.receptorCobranza.findMany({ where: { rut: { in: ruts } }, include: { contactos: true } }),
    ]);
    const rf = new Map(facturacion.map((r) => [normalizarRut(r.rut), r]));
    const rc = new Map(cobranza.map((r) => [normalizarRut(r.rut), r]));
    const receptoresNuevos = [];
    const contactosNuevos = [];
    const nombresCompletar = [];
    let yaExistentes = 0;
    for (const rut of ruts) {
        const delRut = validas.filter((f) => f.rut === rut);
        const recF = rf.get(rut);
        const recC = rc.get(rut);
        if (!recF)
            receptoresNuevos.push({ rut, razonSocial: delRut[0]?.cliente ?? null });
        for (const fila of delRut) {
            const enF = recF?.contactos.find((c) => normalizarEmail(c.email) === fila.email);
            const enC = recC?.contactos.find((c) => normalizarEmail(c.email) === fila.email);
            if (enF || enC) {
                yaExistentes++;
                if (fila.nombre) {
                    if (enF && !enF.nombre?.trim())
                        nombresCompletar.push({ tabla: "facturacion", id: enF.id, email: fila.email, nombre: fila.nombre, rut });
                    if (enC && !enC.nombre?.trim())
                        nombresCompletar.push({ tabla: "cobranza", id: enC.id, email: fila.email, nombre: fila.nombre, rut });
                }
                continue;
            }
            contactosNuevos.push(fila);
        }
    }
    console.log(`\n=== Importar contactos de Duemint ${REAL ? "(REAL)" : "(SIMULACIÓN: no escribe nada)"} ===`);
    console.log(`Filas en el archivo: ${total} · válidas: ${validas.length} · descartadas: ${invalidas.length}`);
    console.log(`Clientes (RUT): ${ruts.length} · con receptor de facturación: ${ruts.length - receptoresNuevos.length} · receptores a crear (apagados): ${receptoresNuevos.length}`);
    console.log(`Contactos nuevos: ${contactosNuevos.length} · ya existían en el CRM: ${yaExistentes} · nombres a completar: ${nombresCompletar.length}`);
    console.log("Todos quedan con «Facturas» y «Cobranza» desmarcados (no reciben correos automáticos).");
    if (invalidas.length > 0) {
        console.log("\nDescartadas:");
        console.table(invalidas);
    }
    if (receptoresNuevos.length > 0) {
        console.log("\nClientes sin receptor de facturación (se crean apagados):");
        console.table(receptoresNuevos);
    }
    if (DETALLE) {
        console.log("\nContactos nuevos:");
        console.table(contactosNuevos.map((c) => ({ rut: c.rut, cliente: (c.cliente ?? "").slice(0, 34), nombre: c.nombre ?? "—", email: c.email })));
        if (nombresCompletar.length > 0) {
            console.log("\nNombres a completar:");
            console.table(nombresCompletar.map(({ tabla, rut, email, nombre }) => ({ tabla, rut, email, nombre })));
        }
    }
    if (!REAL) {
        console.log("\nSimulación terminada. Para aplicar: agrega --real");
        return;
    }
    let creadosReceptores = 0;
    let creadosContactos = 0;
    let nombres = 0;
    for (const rut of ruts) {
        const nuevosDelRut = contactosNuevos.filter((c) => c.rut === rut);
        const nombresDelRut = nombresCompletar.filter((n) => n.rut === rut);
        if (nuevosDelRut.length === 0 && nombresDelRut.length === 0)
            continue;
        await prisma.$transaction(async (tx) => {
            let receptorId = rf.get(rut)?.id;
            if (!receptorId && nuevosDelRut.length > 0) {
                const creado = await tx.receptorFacturacion.create({
                    data: {
                        rut,
                        razonSocial: nuevosDelRut[0]?.cliente ?? null,
                        activo: true,
                        recibeFacturas: false,
                        origen: "DUEMINT",
                    },
                    select: { id: true },
                });
                receptorId = creado.id;
                creadosReceptores++;
            }
            for (const c of nuevosDelRut) {
                await tx.receptorFacturacionContacto.create({
                    data: {
                        receptorId: receptorId,
                        nombre: c.nombre,
                        email: c.email,
                        activo: true,
                        recibeFacturas: false,
                        principal: false,
                        origen: "DUEMINT",
                    },
                });
                creadosContactos++;
            }
            for (const n of nombresDelRut) {
                if (n.tabla === "facturacion") {
                    await tx.receptorFacturacionContacto.update({ where: { id: n.id }, data: { nombre: n.nombre } });
                }
                else {
                    await tx.receptorCobranzaContacto.update({ where: { id: n.id }, data: { nombre: n.nombre } });
                }
                nombres++;
            }
        });
    }
    console.log(`\nListo: ${creadosReceptores} receptor(es) creados, ${creadosContactos} contacto(s) creados, ${nombres} nombre(s) completados.`);
}
main()
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma.$disconnect();
    process.exit();
});
//# sourceMappingURL=importar-contactos-duemint.js.map