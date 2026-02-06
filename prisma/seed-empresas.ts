// prisma/seed-empresas.ts
import { prisma } from "../src/lib/prisma.js";

async function main() {
    const empresas = [
        // Fallback obligatorio
        { nombre: "SIN CLASIFICAR", dominios: [] },

        // 🔹 Dominios confiables externos
        { nombre: "EXTERNOS / PARTNERS", dominios: ["escs.cl"] },

        // ✅ Empresas con emails conocidos
        { nombre: "ALIANZ", dominios: ["alianz.cl"] },
        { nombre: "ASUR", dominios: ["asursa.com"] }, // ✅ Corregido
        { nombre: "BERCIA", dominios: ["bercia.cl"] },
        { nombre: "BDK", dominios: ["bdk.cl", "bdk-spa.cl"] }, // ⚠️ Sin confirmar
        { nombre: "RWAY", dominios: ["rway.cl"] }, // ⚠️ Sin confirmar
        { nombre: "CINTAX", dominios: ["cintax.cl"] },

        { nombre: "GRUPO COLCHAGUA", dominios: ["grupocolchagua.cl"] },
        { nombre: "FIJACIONES PROCRET", dominios: ["fijacionesprocret.cl"] }, // ✅ Corregido

        // Grupo T-Sales
        { nombre: "T-SALES", dominios: ["t-sales.cl"] },
        { nombre: "INFINET", dominios: ["infinet.cl"] },
        { nombre: "VPRIME", dominios: ["vprime.cl"] },

        // Grupo JPL
        { nombre: "JPL", dominios: ["jpl.cl"] },

        // Grupo PINI - ⚠️ Sin email conocido
        { nombre: "PINI", dominios: ["pini.cl"] },

        // Clínica Nace - ⚠️ Sin emails conocidos
        { nombre: "CLÍNICA NACE", dominios: ["clinicanace.cl", "nace.cl"] },
    ];

    console.log("🔄 Actualizando empresas con dominios corregidos...\n");

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

        const dominiosStr = empresa.dominios.length > 0
            ? `📧 ${empresa.dominios.join(', ')}`
            : '⚠️  Sin dominios configurados';
        console.log(`✅ ${empresa.nombre.padEnd(25)} ${dominiosStr}`);
    }

    console.log("\n📊 Resumen:");
    const total = empresas.length;
    const conDominios = empresas.filter(e => e.dominios.length > 0).length - 1; // -1 para no contar SIN CLASIFICAR
    console.log(`   • Total empresas: ${total}`);
    console.log(`   • Con clasificación automática: ${conDominios}`);
    console.log(`   • Sin dominios: ${total - conDominios - 1}`);

    console.log("\n⚠️  Empresas sin emails confirmados:");
    console.log("   • BDK (dominio asumido: bdk.cl)");
    console.log("   • RWAY (dominio asumido: rway.cl)");
    console.log("   • PINI (dominio asumido: pini.cl)");
    console.log("   • CLÍNICA NACE (dominios asumidos: clinicalnace.cl, nace.cl)");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });