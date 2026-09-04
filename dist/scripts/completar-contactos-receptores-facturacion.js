import { prisma, } from "../lib/prisma.js";
/* =========================================================
   NORMALIZACIÓN
========================================================= */
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
/* =========================================================
   MAIN
========================================================= */
async function main() {
    console.log("========================================");
    console.log("[MIGRACIÓN FACTURACIÓN] COMPLETANDO CONTACTOS CRM");
    console.log("========================================");
    /*
     * IMPORTANTE:
     *
     * Ya NO filtramos por recibeFacturas=true.
     *
     * Queremos traer todos los contactos CRM para que
     * puedan administrarse posteriormente desde el
     * nuevo módulo de receptores.
     */
    const empresas = await prisma
        .empresa
        .findMany({
        where: {
            detalleEmpresa: {
                isNot: null,
            },
        },
        select: {
            id_empresa: true,
            nombre: true,
            razonSocial: true,
            detalleEmpresa: {
                select: {
                    rut: true,
                },
            },
            contactoEmpresas: {
                select: {
                    id: true,
                    nombre: true,
                    email: true,
                    recibeFacturas: true,
                    principal: true,
                },
            },
        },
    });
    let empresasProcesadas = 0;
    let empresasSinRut = 0;
    let receptoresEncontrados = 0;
    let receptoresCreados = 0;
    let contactosEvaluados = 0;
    let contactosCreados = 0;
    let contactosExistentes = 0;
    let contactosSinEmail = 0;
    for (const empresa of empresas) {
        const rut = normalizeRut(empresa
            .detalleEmpresa
            ?.rut);
        if (!rut) {
            empresasSinRut++;
            console.log("[MIGRACIÓN FACTURACIÓN] ⏭ Empresa sin RUT", {
                empresaId: empresa.id_empresa,
                empresa: empresa.nombre,
            });
            continue;
        }
        empresasProcesadas++;
        /*
         * =====================================================
         * RECEPTOR
         * =====================================================
         *
         * Como la migración inicial ya fue ejecutada,
         * normalmente este receptor existirá.
         *
         * Si no existe por algún motivo, lo creamos pero
         * DESHABILITADO para recepción de facturas.
         *
         * No copiamos empresa.recibeFacturas aquí porque
         * queremos preservar la configuración del sistema
         * nuevo y evitar habilitaciones accidentales.
         */
        let receptor = await prisma
            .receptorFacturacion
            .findUnique({
            where: {
                rut,
            },
        });
        if (!receptor) {
            receptor =
                await prisma
                    .receptorFacturacion
                    .create({
                    data: {
                        rut,
                        razonSocial: empresa.razonSocial ??
                            empresa.nombre,
                        activo: true,
                        recibeFacturas: false,
                        empresaId: empresa.id_empresa,
                        origen: "CRM",
                    },
                });
            receptoresCreados++;
            console.log("[MIGRACIÓN FACTURACIÓN] ➕ Receptor faltante creado", {
                receptorId: receptor.id,
                empresaId: empresa.id_empresa,
                rut,
                razonSocial: receptor.razonSocial,
            });
        }
        else {
            receptoresEncontrados++;
            /*
             * Podemos completar el vínculo CRM si por alguna razón
             * estaba vacío, pero no modificamos la configuración
             * de facturación existente.
             */
            if (receptor.empresaId ===
                null &&
                receptor.origen ===
                    "CRM") {
                receptor =
                    await prisma
                        .receptorFacturacion
                        .update({
                        where: {
                            id: receptor.id,
                        },
                        data: {
                            empresaId: empresa.id_empresa,
                        },
                    });
            }
        }
        /*
         * =====================================================
         * CONTACTOS
         * =====================================================
         */
        for (const contacto of empresa
            .contactoEmpresas) {
            contactosEvaluados++;
            const email = normalizeEmail(contacto.email);
            if (!email) {
                contactosSinEmail++;
                console.log("[MIGRACIÓN FACTURACIÓN] ⏭ Contacto sin email", {
                    empresaId: empresa.id_empresa,
                    contactoId: contacto.id,
                    nombre: contacto.nombre,
                });
                continue;
            }
            /*
             * La combinación receptorId + email ya es UNIQUE.
             *
             * Primero comprobamos existencia para NO pisar una
             * configuración que pueda haber sido modificada
             * desde el nuevo módulo.
             */
            const existente = await prisma
                .receptorFacturacionContacto
                .findUnique({
                where: {
                    receptorId_email: {
                        receptorId: receptor.id,
                        email,
                    },
                },
            });
            if (existente) {
                contactosExistentes++;
                console.log("[MIGRACIÓN FACTURACIÓN] ↔ Contacto ya existente", {
                    receptorId: receptor.id,
                    contactoId: existente.id,
                    email,
                    origen: existente.origen,
                    activo: existente.activo,
                    recibeFacturas: existente.recibeFacturas,
                });
                /*
                 * MUY IMPORTANTE:
                 *
                 * No hacemos update.
                 *
                 * Así preservamos cualquier modificación hecha
                 * posteriormente desde Receptores de Facturación.
                 */
                continue;
            }
            /*
             * Si no existe, entonces sí importamos exactamente
             * la configuración que tiene ContactoEmpresa.
             */
            await prisma
                .receptorFacturacionContacto
                .create({
                data: {
                    receptorId: receptor.id,
                    nombre: contacto.nombre ??
                        null,
                    email,
                    activo: true,
                    recibeFacturas: contacto.recibeFacturas,
                    /*
                     * Principal se copia solamente para
                     * contactos nuevos.
                     */
                    principal: contacto.principal,
                    origen: "CRM",
                },
            });
            contactosCreados++;
            console.log("[MIGRACIÓN FACTURACIÓN] ✅ Contacto agregado", {
                receptorId: receptor.id,
                empresaId: empresa.id_empresa,
                contactoEmpresaId: contacto.id,
                email,
                activo: true,
                recibeFacturas: contacto.recibeFacturas,
                principal: contacto.principal,
            });
        }
    }
    /* =========================================================
       RESUMEN
    ========================================================= */
    console.log("========================================");
    console.log("[MIGRACIÓN FACTURACIÓN] RESUMEN");
    console.log({
        empresasProcesadas,
        empresasSinRut,
        receptoresEncontrados,
        receptoresCreados,
        contactosEvaluados,
        contactosCreados,
        contactosExistentes,
        contactosSinEmail,
    });
    console.log("========================================");
}
/* =========================================================
   EJECUTAR
========================================================= */
main()
    .then(async () => {
    await prisma
        .$disconnect();
    console.log("✅ Migración complementaria terminada");
})
    .catch(async (error) => {
    console.error("❌ Error en migración complementaria", error);
    await prisma
        .$disconnect();
    process.exit(1);
});
//# sourceMappingURL=completar-contactos-receptores-facturacion.js.map