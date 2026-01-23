import { prisma } from "../src/lib/prisma.js";

async function main() {
    const empresas = [
        { nombre: "SIN CLASIFICAR", dominios: [] },

        { nombre: "ALIANZ", dominios: ["alianz.cl"] },
        { nombre: "ASUR", dominios: ["asur.cl"] },
        { nombre: "BERCIA", dominios: ["bercia.cl"] },
        { nombre: "BDK", dominios: ["bdk.cl"] },
        { nombre: "RWAY", dominios: ["rway.cl"] },
        { nombre: "CINTAX", dominios: ["cintax.cl"] },

        { nombre: "GRUPO COLCHAGUA", dominios: ["grupocolchagua.cl", "colchagua.cl"] },
        { nombre: "FIJACIONES PROCRET", dominios: ["procret.cl"] },

        // GRUPO T-SALES
        { nombre: "T-SALES", dominios: ["t-sales.cl", "tsales.cl"] },
        { nombre: "INFINET", dominios: ["infinet.cl", "infinet.com"] },
        { nombre: "VPRIME", dominios: ["vprime.cl"] },

        // GRUPO JPL
        { nombre: "JPL", dominios: ["jpl.cl"] },

        // GRUPO PINI
        { nombre: "PINI", dominios: ["pini.cl"] },

        // CLÍNICA NACE
        { nombre: "CLN ALAMEDA", dominios: ["clinicalnace.cl", "nace.cl"] },
        { nombre: "CLN PROVIDENCIA", dominios: ["clinicalnace.cl", "nace.cl"] },
    ];

    for (const empresa of empresas) {
        await prisma.empresa.upsert({
            where: { nombre: empresa.nombre },
            update: {
                dominios: empresa.dominios,
            },
            create: {
                nombre: empresa.nombre,
                dominios: empresa.dominios,
            },
        });
    }

    console.log("✅ Empresas y dominios creados / actualizados");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
