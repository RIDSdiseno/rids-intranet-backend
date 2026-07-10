/**
 * Script de migración: importa los datos de los JSON locales a la DB.
 * Ejecutar UNA sola vez después de correr la migración de Prisma.
 *
 * Uso:
 *   npx tsx scripts/migrate-json-to-db.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');

async function migrateCotizacionesEnviadas() {
  const file = path.join(DATA_DIR, 'cotizaciones-enviadas.json');
  if (!fs.existsSync(file)) { console.log('cotizaciones-enviadas.json no existe, omitiendo.'); return; }

  const rows: any[] = JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
  console.log(`Migrando ${rows.length} registros de cotizaciones-enviadas...`);
  let ok = 0, skip = 0;

  for (const r of rows) {
    try {
      await prisma.cotizacionEnviada.upsert({
        where: { id: Number(r.id) },
        create: {
          id:            Number(r.id),
          cotizacionId:  r.cotizacionId ? Number(r.cotizacionId) : null,
          to:            r.to ?? null,
          subject:       r.subject ?? null,
          sentBy:        r.sentBy ?? null,
          jobId:         r.jobId ?? null,
          meta:          r.meta ?? undefined,
          clienteNombre: r.clienteNombre ?? null,
          creadoPor:     r.creadoPor ?? null,
          fechaCreacion: r.fechaCreacion ? new Date(r.fechaCreacion) : null,
          sentAt:        r.sentAt ? new Date(r.sentAt) : new Date(),
        },
        update: {},
      });
      ok++;
    } catch (e) {
      console.warn(`  Skipping id=${r.id}:`, e);
      skip++;
    }
  }
  console.log(`  cotizaciones-enviadas: ${ok} insertados, ${skip} omitidos.`);
}

async function migrateRcvVencimientos() {
  const file = path.join(DATA_DIR, 'rcv-vencimientos.json');
  if (!fs.existsSync(file)) { console.log('rcv-vencimientos.json no existe, omitiendo.'); return; }

  const data: Record<string, string> = JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
  const entries = Object.entries(data);
  console.log(`Migrando ${entries.length} registros de rcv-vencimientos...`);
  let ok = 0, skip = 0;

  for (const [key, fechaIso] of entries) {
    const parts = key.split('|');
    if (parts.length < 3) { skip++; continue; }
    const [empresaKey, tipoDoc, folio] = parts;
    try {
      await prisma.rcvVencimiento.upsert({
        where: { empresaKey_tipoDoc_folio: { empresaKey, tipoDoc, folio } },
        create: { empresaKey, tipoDoc, folio, fechaVencimiento: new Date(fechaIso) },
        update: { fechaVencimiento: new Date(fechaIso) },
      });
      ok++;
    } catch (e) {
      console.warn(`  Skipping key=${key}:`, e);
      skip++;
    }
  }
  console.log(`  rcv-vencimientos: ${ok} insertados, ${skip} omitidos.`);
}

async function main() {
  try {
    await migrateCotizacionesEnviadas();
    await migrateRcvVencimientos();
    console.log('\nMigración completada.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
