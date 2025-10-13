// apps/backend/scripts/seedTicketOrgs.ts
import { prisma } from "../lib/prisma.js";

// Lista base de "organizaciones de tickets" (NO toca tu tabla Empresa).
const ORGS = [
  "ALIANZ",
  "ASUR",
  "BDK",
  "BODEGAL",
  "CLINICA NACE",
  "GRUPO COLCHAGUA",
  "FIJACIONES PROCET",    // (corrección del nombre que tenías raro)
  "INFINITYCONNECT",      // (corrección de INIFINITYCONNECT)
  "INFINET",
  "JPL",
  "RWAY",
  "T-SALES",
  "VPRIME",
  "PINI",
  "RIDS",
];

async function main() {
  let count = 0;
  for (const name of ORGS) {
    await prisma.ticketOrg.upsert({
      where: { name },
      update: {},
      create: { name },
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
