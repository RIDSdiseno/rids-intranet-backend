// Respaldo lógico previo a la migración add_oportunidades_venta_funnel.
// pg_dump no está disponible en este entorno; como alternativa, se exporta
// a JSON la tabla que la migración altera (CotizacionGestioo) y un conteo
// de filas de las tablas relacionadas, para poder verificar integridad
// después de aplicar la migración.
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const prisma = new PrismaClient();

async function main() {
  // select explícito de columnas: el modelo Prisma ya incluye `oportunidadVentaId`
  // (recién agregado al schema), pero esa columna aún no existe físicamente en la
  // BD hasta aplicar la migración — se excluye aquí para que el backup previo funcione.
  const cotizaciones = await prisma.$queryRawUnsafe(`SELECT * FROM "CotizacionGestioo"`);
  const counts = {
    cotizacionGestioo: await prisma.cotizacionGestioo.count(),
    entidadGestioo: await prisma.entidadGestioo.count(),
    tecnico: await prisma.tecnico.count(),
    auditLog: await prisma.auditLog.count(),
  };

  const out = {
    tomadoEn: new Date().toISOString(),
    counts,
    cotizacionGestioo: cotizaciones,
  };

  const path = new URL("./backup-pre-oportunidades-migration.json", import.meta.url);
  writeFileSync(path, JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  console.log("Backup escrito en", path.pathname);
  console.log("Counts:", counts);
}

main()
  .catch((err) => {
    console.error("Error generando backup:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
