import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const rows = await prisma.$queryRawUnsafe(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN
  ('OportunidadVenta','HistorialEtapaOportunidadVenta','SeguimientoOportunidadVenta')
`);
console.log("Tablas encontradas:", rows);

const col = await prisma.$queryRawUnsafe(`
  SELECT column_name, is_nullable, data_type FROM information_schema.columns
  WHERE table_name = 'CotizacionGestioo' AND column_name = 'oportunidadVentaId'
`);
console.log("Columna CotizacionGestioo.oportunidadVentaId:", col);

const countCot = await prisma.cotizacionGestioo.count();
console.log("Total CotizacionGestioo (debe seguir en 288):", countCot);

await prisma.$disconnect();
