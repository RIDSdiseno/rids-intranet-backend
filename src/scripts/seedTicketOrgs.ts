// apps/backend/scripts/seedTicketOrgs.ts
import { prisma } from "../lib/prisma.js";

const ORGS = [
  "ALIANZ","ASUR","BDK","BODEGAL","CLINICA NACE","GRUPO COLCHAGUA",
  "FIJACIONES PROCET","INFINITYCONNECT","INFINET","JPL","RWAY",
  "T-SALES","VPRIME","PINI","RIDS","BDK-SPA","BERCIA","SOFTLAND","INTCOMEX",
  "CINTAX",
];

async function main() {
  let count = 0;
  for (const name of ORGS) {
    await prisma.ticketOrg.upsert({
      where: { name },
      update: { updatedAt: new Date() },            // <— importante
      create: { name, updatedAt: new Date() },      // <— important
    });
    count++;
  }
  console.log(`✅ TicketOrg sembradas/actualizadas: ${count}`);
}

main()
  .catch((e) => {
    console.error("Seed TicketOrg error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
