// apps/backend/scripts/seedTicketOrgs.ts
import { prisma } from "../lib/prisma.js";
const ORGS = [
    "ALIANZ", "ASUR", "BDK", "BODEGAL", "CLINICA NACE", "GRUPO COLCHAGUA",
    "FIJACIONES PROCET", "INFINITYCONNECT", "INFINET", "JPL", "RWAY",
    "T-SALES", "VPRIME", "PINI", "RIDS", "BDK-SPA", "BERCIA", "SOFTLAND", "INTCOMEX",
    "CINTAX", "COVASACHILE", "SOS GROUP", // 👈
];
// Script para sembrar las organizaciones de tickets (ticketOrg) a partir de un listado predefinido
async function main() {
    let count = 0;
    for (const name of ORGS) {
        await prisma.ticketOrg.upsert({
            where: { name },
            update: { updatedAt: new Date() }, // <— importante
            create: { name, updatedAt: new Date() }, // <— important
        });
        count++;
    }
    console.log(`✅ TicketOrg sembradas/actualizadas: ${count}`);
}
// Ejecutar el script, con manejo básico de errores y desconexión de Prisma al final
main()
    .catch((e) => {
    console.error("Seed TicketOrg error:", e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seedTicketOrgs.js.map