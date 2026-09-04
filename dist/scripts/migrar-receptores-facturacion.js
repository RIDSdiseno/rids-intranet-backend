import { prisma, } from "../lib/prisma.js";
function normalizeRut(value) {
    return String(value ?? "")
        .replace(/[^0-9kK]/g, "")
        .toUpperCase()
        .trim();
}
function normalizeEmail(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase();
}
async function main() {
    const empresas = await prisma.empresa.findMany({
        where: {
            detalleEmpresa: {
                isNot: null,
            },
        },
        select: {
            id_empresa: true,
            nombre: true,
            razonSocial: true,
            recibeFacturas: true,
            detalleEmpresa: {
                select: {
                    rut: true,
                },
            },
            contactoEmpresas: {
                where: {
                    recibeFacturas: true,
                },
                select: {
                    nombre: true,
                    email: true,
                    principal: true,
                },
            },
        },
    });
    for (const empresa of empresas) {
        const rut = normalizeRut(empresa
            .detalleEmpresa
            ?.rut);
        if (!rut) {
            continue;
        }
        const receptor = await prisma
            .receptorFacturacion
            .upsert({
            where: {
                rut,
            },
            create: {
                rut,
                razonSocial: empresa.razonSocial ??
                    empresa.nombre,
                activo: true,
                recibeFacturas: empresa.recibeFacturas,
                empresaId: empresa.id_empresa,
                origen: "CRM",
            },
            update: {
                razonSocial: empresa.razonSocial ??
                    empresa.nombre,
                empresaId: empresa.id_empresa,
                /*
                 * Durante esta migración inicial
                 * sincronizamos el valor actual.
                 */
                recibeFacturas: empresa.recibeFacturas,
            },
        });
        for (const contacto of empresa
            .contactoEmpresas) {
            const email = normalizeEmail(contacto.email);
            if (!email) {
                continue;
            }
            await prisma
                .receptorFacturacionContacto
                .upsert({
                where: {
                    receptorId_email: {
                        receptorId: receptor.id,
                        email,
                    },
                },
                create: {
                    receptorId: receptor.id,
                    nombre: contacto.nombre,
                    email,
                    principal: contacto.principal,
                    activo: true,
                    recibeFacturas: true,
                    origen: "CRM",
                },
                update: {
                    nombre: contacto.nombre,
                    principal: contacto.principal,
                    activo: true,
                    recibeFacturas: true,
                },
            });
        }
        console.log("[MIGRACIÓN FACTURACIÓN] ✅", {
            empresaId: empresa.id_empresa,
            rut,
            receptorId: receptor.id,
            habilitado: receptor.recibeFacturas,
            contactos: empresa
                .contactoEmpresas
                .length,
        });
    }
}
main()
    .then(async () => {
    await prisma.$disconnect();
    console.log("✅ Migración terminada");
})
    .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
});
//# sourceMappingURL=migrar-receptores-facturacion.js.map