import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const tecnicos = await prisma.tecnico.findMany({
  where: { rol: { in: ["ADMIN", "ADMINISTRACION", "VENTAS"] }, status: true },
  select: { id_tecnico: true, nombre: true, email: true, rol: true },
  take: 10,
});
console.log(JSON.stringify(tecnicos, null, 2));
await prisma.$disconnect();
