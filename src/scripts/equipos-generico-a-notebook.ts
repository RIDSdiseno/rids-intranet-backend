// src/scripts/equipos-generico-a-notebook.ts
//
// Corrige el tipo de los equipos creados por el agente como GENERICO que en
// realidad son notebooks: tienen bateria interna detectada por el agente
// (DetalleEquipo.bateriaPresente = true). Se excluyen las baterias que parecen
// una UPS conectada por USB (APC, CyberPower, Eaton...).
//
// Solo cambia GENERICO -> NOTEBOOK. No toca tipos elegidos a mano.
// Usa el cliente con auditoria: cada cambio queda en el historial del equipo.
//
//   npx tsx src/scripts/equipos-generico-a-notebook.ts            -> SIMULACIÓN (solo muestra)
//   npx tsx src/scripts/equipos-generico-a-notebook.ts --detalle  -> además lista cada equipo
//   npx tsx src/scripts/equipos-generico-a-notebook.ts --real     -> aplica los cambios

import "dotenv/config";

import { prisma } from "../lib/prisma.js";
import { esBateriaDeUps } from "../controllers/controllers-agente-inventario/equipo-agent.controller.js";

const args = process.argv.slice(2);
const real = args.includes("--real");
const detalle = args.includes("--detalle");

async function main() {
    console.log(real ? "🔴 MODO REAL: se actualizarán los equipos\n" : "🟡 SIMULACIÓN: no se modifica nada\n");

    const candidatos = await prisma.equipo.findMany({
        where: {
            tipo: "GENERICO",
            deletedAt: null,
            detalle: { is: { bateriaPresente: true } },
        },
        select: {
            id_equipo: true,
            hostname: true,
            marca: true,
            modelo: true,
            empresa: { select: { nombre: true } },
            detalle: { select: { bateriaNombre: true, bateriaFabricante: true } },
        },
        orderBy: { id_equipo: "asc" },
    });

    const notebooks = candidatos.filter(
        (e) => !esBateriaDeUps(e.detalle?.bateriaNombre, e.detalle?.bateriaFabricante)
    );

    const ups = candidatos.filter(
        (e) => esBateriaDeUps(e.detalle?.bateriaNombre, e.detalle?.bateriaFabricante)
    );

    console.log(`GENERICO con batería: ${candidatos.length}`);
    console.log(`  -> pasan a NOTEBOOK: ${notebooks.length}`);
    console.log(`  -> se omiten (batería de UPS): ${ups.length}\n`);

    if (detalle || ups.length > 0) {
        for (const e of detalle ? candidatos : ups) {
            const esUps = ups.includes(e);
            console.log(
                `${esUps ? "OMITIDO (UPS)" : "NOTEBOOK     "} #${e.id_equipo} | ${e.empresa?.nombre ?? "sin empresa"} | ` +
                `${e.hostname ?? "-"} | ${e.marca ?? ""} ${e.modelo ?? ""} | ` +
                `batería: ${e.detalle?.bateriaNombre ?? "-"} / ${e.detalle?.bateriaFabricante ?? "-"}`
            );
        }
        console.log("");
    }

    if (!real) {
        console.log("Simulación terminada. Ejecuta con --real para aplicar.");
        return;
    }

    let actualizados = 0;

    for (const e of notebooks) {
        await prisma.equipo.update({
            where: { id_equipo: e.id_equipo },
            data: { tipo: "NOTEBOOK" },
        });
        actualizados++;
    }

    console.log(`✅ ${actualizados} equipos actualizados a NOTEBOOK`);
}

main()
    .catch((e) => {
        console.error("❌ Error:", e);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });