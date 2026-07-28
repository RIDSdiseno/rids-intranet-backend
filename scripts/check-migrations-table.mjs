import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const rows = await prisma.$queryRawUnsafe(
  `SELECT id, checksum, migration_name, logs, rolled_back_at, started_at, applied_steps_count, finished_at FROM "_prisma_migrations" ORDER BY started_at ASC`
);
console.log(JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
await prisma.$disconnect();
