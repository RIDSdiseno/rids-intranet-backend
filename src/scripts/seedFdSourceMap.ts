// apps/backend/scripts/seedFdSourceMap.ts
import { prisma } from "../lib/prisma.js";

/** Convierte companyId a bigint de forma segura */
const toBigInt = (v: unknown): bigint | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  const s = String(v).trim();
  return s ? BigInt(s) : null;
};

/**
 * Define los mapeos de dominio y/o companyId de Freshdesk
 * hacia cada TicketOrg. Puedes ajustar los dominios reales.
 */
const MAPPINGS: Array<{
  org: string;
  domains?: string[];
  companyIds?: Array<string | number | bigint>;
}> = [
  { org: "ALIANZ", domains: ["alianz.cl"] },
  { org: "ASUR", domains: ["asursa.com"] },
  { org: "BDK", domains: ["bdk.cl"] },
  { org: "BODEGAL", domains: ["bodegal.cl"] },
  { org: "CLINICA NACE", domains: ["clinicanace.cl", "nace.cl"] },
  { org: "GRUPO COLCHAGUA", domains: ["grupocolchagua.cl"] },
  { org: "FIJACIONES PROCET", domains: ["procet.cl"] },
  { org: "INFINITYCONNECT", domains: ["infinityconnect.cl"] },
  { org: "INFINET", domains: ["infinet.cl"] },
  { org: "JPL", domains: ["jpl.cl"] },
  { org: "RWAY", domains: ["rway.cl"] },
  { org: "T-SALES", domains: ["t-sales.cl", "tsales.cl"] },
  { org: "VPRIME", domains: ["vprime.cl"] },
  { org: "PINI", domains: ["pini.cl"]},
  { org: "RIDS", domains: ["rids.cl"]},
  { org: "BDK-SPA", domains: ["bdk-spa.cl"]},
  { org: "BERCIA", domains: ["bercia.cl"]},


  // Si algún cliente usa Freshdesk Company IDs conocidos, agrega aquí:
  // { org: "BODEGAL", companyIds: [73000589521] }, // ejemplo
];

async function main() {
  let domCount = 0;
  let cidCount = 0;

  for (const m of MAPPINGS) {
    // Asegura que la org exista
    const org = await prisma.ticketOrg.upsert({
      where: { name: m.org },
      update: {},
      create: { name: m.org },
      select: { id: true, name: true },
    });

    // Mapear dominios
    if (m.domains?.length) {
      for (const domRaw of m.domains) {
        const dom = domRaw.toLowerCase();
        await prisma.fdSourceMap.upsert({
          where: { domain: dom },
          update: { ticketOrgId: org.id },
          create: { domain: dom, ticketOrgId: org.id },
        });
        domCount++;
      }
    }

    // Mapear companyIds de Freshdesk
    if (m.companyIds?.length) {
      for (const raw of m.companyIds) {
        const cid = toBigInt(raw);
        if (!cid) continue;
        await prisma.fdSourceMap.upsert({
          where: { companyId: cid },
          update: { ticketOrgId: org.id },
          create: { companyId: cid, ticketOrgId: org.id },
        });
        cidCount++;
      }
    }
  }

  console.log(`✅ FdSourceMap listo. Dominios: ${domCount}, companyIds: ${cidCount}`);
}

main()
  .catch((e) => {
    console.error("Seed FdSourceMap error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
