import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("123456", 10);

  const admin = await prisma.usuario.upsert({
    where: { email: "admin@cmr.test" },
    update: {},
    create: {
      nombre: "Administrador",
      email: "admin@cmr.test",
      password,
      rol: "ADMIN",
    },
    select: { id: true, email: true, rol: true }
  });

  console.log("Usuario admin listo:", admin);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
