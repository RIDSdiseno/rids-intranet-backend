// src/scripts/recalcular-sla-ciclos-netos.ts
//
// Recalcula los minutos de los ciclos SLA ya archivados (TicketSlaCycle)
// en tiempo NETO, descontando el tiempo en PENDING, igual que buildTicketSla.
//
// Solo se tocan firstResponseElapsedMinutes y resolutionElapsedMinutes.
// Los estados OK/BREACHED no cambian, porque ya descontaban las pausas.
//
//   npx tsx src/scripts/recalcular-sla-ciclos-netos.ts            -> SIMULACIÓN (solo muestra)
//   npx tsx src/scripts/recalcular-sla-ciclos-netos.ts --detalle  -> además lista cada ciclo que cambia
//   npx tsx src/scripts/recalcular-sla-ciclos-netos.ts --real     -> aplica los cambios
import "dotenv/config";
import { TicketEventType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { getPendingPauseMs } from "../controllers/tickets-rids/tickets-sla/ticketera-sla.controller.js";
const args = process.argv.slice(2);
const real = args.includes("--real");
const detalle = args.includes("--detalle");
function minutosNetos(desde, hasta, pauseMs) {
    if (!hasta)
        return null;
    return Math.max(0, Math.round((hasta.getTime() - desde.getTime() - pauseMs) / 60000));
}
async function main() {
    console.log(real ? "🔴 MODO REAL: se actualizarán los ciclos\n" : "🟡 SIMULACIÓN: no se modifica nada\n");
    const ciclos = await prisma.ticketSlaCycle.findMany({
        orderBy: [{ ticketId: "asc" }, { cycleNumber: "asc" }],
        include: {
            ticket: {
                select: {
                    events: {
                        where: { type: TicketEventType.STATUS_CHANGED },
                        select: { type: true, oldValue: true, newValue: true, createdAt: true },
                        orderBy: { createdAt: "asc" },
                    },
                },
            },
        },
    });
    let cambian = 0;
    let minutosAntesFr = 0;
    let minutosDespuesFr = 0;
    let minutosAntesRs = 0;
    let minutosDespuesRs = 0;
    const cambios = [];
    for (const c of ciclos) {
        const events = c.ticket.events;
        const frPause = c.firstResponseAt
            ? getPendingPauseMs({ events }, c.startedAt, c.firstResponseAt)
            : 0;
        const rsPause = c.resolutionAt
            ? getPendingPauseMs({ events }, c.startedAt, c.resolutionAt)
            : 0;
        const frNeto = minutosNetos(c.startedAt, c.firstResponseAt, frPause);
        const rsNeto = minutosNetos(c.startedAt, c.resolutionAt, rsPause);
        if (c.firstResponseElapsedMinutes !== null && frNeto !== null) {
            minutosAntesFr += c.firstResponseElapsedMinutes;
            minutosDespuesFr += frNeto;
        }
        if (c.resolutionElapsedMinutes !== null && rsNeto !== null) {
            minutosAntesRs += c.resolutionElapsedMinutes;
            minutosDespuesRs += rsNeto;
        }
        if (frNeto === c.firstResponseElapsedMinutes && rsNeto === c.resolutionElapsedMinutes) {
            continue;
        }
        cambian++;
        cambios.push({ id: c.id, fr: frNeto, rs: rsNeto });
        if (detalle) {
            console.log(`Ticket #${c.ticketId} ciclo ${c.cycleNumber}: ` +
                `1ª resp ${c.firstResponseElapsedMinutes} → ${frNeto} min · ` +
                `resolución ${c.resolutionElapsedMinutes} → ${rsNeto} min`);
        }
    }
    console.log(`\nCiclos archivados: ${ciclos.length}`);
    console.log(`Ciclos con minutos distintos: ${cambian}`);
    console.log(`Suma 1ª respuesta:  ${minutosAntesFr} → ${minutosDespuesFr} min`);
    console.log(`Suma resolución:    ${minutosAntesRs} → ${minutosDespuesRs} min`);
    if (!real) {
        console.log("\nSimulación terminada. Para aplicar: agrega --real");
        return;
    }
    for (const c of cambios) {
        await prisma.ticketSlaCycle.update({
            where: { id: c.id },
            data: {
                firstResponseElapsedMinutes: c.fr,
                resolutionElapsedMinutes: c.rs,
            },
        });
    }
    console.log(`\n✅ ${cambios.length} ciclos actualizados`);
}
main()
    .catch((e) => {
    console.error("❌ Error:", e);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=recalcular-sla-ciclos-netos.js.map