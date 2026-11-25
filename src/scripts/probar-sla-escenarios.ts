// src/scripts/probar-sla-escenarios.ts
//
// Prueba buildTicketSla con casos armados a mano. NO usa la base de datos.
//
//   npx tsx src/scripts/probar-sla-escenarios.ts
//
// Reglas que se verifican:
// - el SLA parte al asignar (o al reabrir por correo, o al asignar tras reabrir sin técnico);
// - cerrar sin responder cuenta como primera respuesta;
// - PENDING pausa el SLA: corre el vencimiento y NO se cuenta en los minutos (tiempo neto);
// - las pausas de un ciclo anterior no afectan al ciclo actual.
//
// Las metas se fijan aquí (no se leen de SlaConfig) para que el resultado no dependa de la BD.

import { buildTicketSla } from "../controllers/tickets-rids/tickets-sla/ticketera-sla.controller.js";

const SLA = {
    LOW: { firstResponseMinutes: 60, resolutionMinutes: 240 },
    NORMAL: { firstResponseMinutes: 60, resolutionMinutes: 90 },
    HIGH: { firstResponseMinutes: 30, resolutionMinutes: 60 },
    URGENT: { firstResponseMinutes: 30, resolutionMinutes: 45 },
};

/** Fecha fija de prueba: 2026-01-15 a la hora indicada (hora local). */
const h = (hhmm: string) => new Date(`2026-01-15T${hhmm}:00`);

type Ev = { type: string; oldValue: string | null; newValue: string | null; createdAt: Date };

const asignado = (hhmm: string, tecnicoId: string | null): Ev => ({
    type: "ASSIGNED",
    oldValue: null,
    newValue: tecnicoId,
    createdAt: h(hhmm),
});

const estado = (hhmm: string, de: string, a: string): Ev => ({
    type: "STATUS_CHANGED",
    oldValue: de,
    newValue: a,
    createdAt: h(hhmm),
});

type Esperado = {
    startsAt?: string | null;
    waitingAssignment?: boolean;
    frStatus?: "OK" | "BREACHED" | "PENDING";
    frMin?: number | null;
    rsStatus?: "OK" | "BREACHED" | "PENDING";
    rsMin?: number | null;
};

type Caso = {
    nombre: string;
    ticket: Parameters<typeof buildTicketSla>[0];
    esperado: Esperado;
};

const base = {
    createdAt: h("09:55"),
    assigneeId: 5,
    priority: "NORMAL",
    status: "CLOSED",
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    lastReopenedAt: null,
};

const casos: Caso[] = [
    {
        nombre: "1. Respuesta y cierre a tiempo",
        ticket: {
            ...base,
            firstResponseAt: h("10:20"),
            closedAt: h("11:00"),
            events: [asignado("10:00", "5")],
        },
        esperado: { startsAt: "10:00", frStatus: "OK", frMin: 20, rsStatus: "OK", rsMin: 60 },
    },
    {
        nombre: "2. Respuesta tardía y cierre tardío",
        ticket: {
            ...base,
            firstResponseAt: h("11:30"),
            closedAt: h("12:00"),
            events: [asignado("10:00", "5")],
        },
        esperado: { frStatus: "BREACHED", frMin: 90, rsStatus: "BREACHED", rsMin: 120 },
    },
    {
        nombre: "3. Pausa en PENDING (50 min netos, 170 brutos)",
        ticket: {
            ...base,
            firstResponseAt: h("10:10"),
            closedAt: h("12:50"),
            events: [
                asignado("10:00", "5"),
                estado("10:30", "OPEN", "PENDING"),
                estado("12:30", "PENDING", "OPEN"),
                estado("12:50", "OPEN", "CLOSED"),
            ],
        },
        esperado: { frStatus: "OK", frMin: 10, rsStatus: "OK", rsMin: 50 },
    },
    {
        nombre: "4. Pausa que no alcanza a salvar el SLA",
        ticket: {
            ...base,
            firstResponseAt: h("10:10"),
            closedAt: h("13:00"),
            events: [
                asignado("10:00", "5"),
                estado("10:30", "OPEN", "PENDING"),
                estado("11:00", "PENDING", "OPEN"),
                estado("13:00", "OPEN", "CLOSED"),
            ],
        },
        esperado: { rsStatus: "BREACHED", rsMin: 150 },
    },
    {
        nombre: "5. Cerrado estando en PENDING (la pausa llega hasta el cierre)",
        ticket: {
            ...base,
            firstResponseAt: h("10:05"),
            closedAt: h("11:00"),
            events: [
                asignado("10:00", "5"),
                estado("10:30", "OPEN", "PENDING"),
                estado("11:00", "PENDING", "CLOSED"),
            ],
        },
        esperado: { rsStatus: "OK", rsMin: 30 },
    },
    {
        nombre: "6. Cerrado sin responder: el cierre cuenta como primera respuesta",
        ticket: {
            ...base,
            priority: "HIGH",
            closedAt: h("10:40"),
            events: [asignado("10:00", "5")],
        },
        esperado: { frStatus: "BREACHED", frMin: 40, rsStatus: "OK", rsMin: 40 },
    },
    {
        nombre: "7. Sin evento de asignación: queda esperando asignación",
        ticket: { ...base, closedAt: h("11:00"), events: [] },
        esperado: { waitingAssignment: true, startsAt: null },
    },
    {
        nombre: "8. Reasignación: el SLA parte en la PRIMERA asignación",
        ticket: {
            ...base,
            assigneeId: 7,
            firstResponseAt: h("10:50"),
            closedAt: h("11:20"),
            events: [asignado("10:00", "5"), asignado("10:30", "7")],
        },
        esperado: { startsAt: "10:00", frMin: 50, rsMin: 80 },
    },
    {
        nombre: "9. Reabierto por correo con técnico: el SLA parte en la reapertura",
        ticket: {
            ...base,
            lastReopenedAt: h("14:00"),
            firstResponseAt: h("14:15"),
            closedAt: h("15:00"),
            events: [asignado("09:00", "5")],
        },
        esperado: { startsAt: "14:00", frStatus: "OK", frMin: 15, rsStatus: "OK", rsMin: 60 },
    },
    {
        nombre: "10. Reabierto sin técnico: el SLA parte en la asignación posterior",
        ticket: {
            ...base,
            assigneeId: 7,
            lastReopenedAt: h("14:00"),
            firstResponseAt: h("14:40"),
            closedAt: h("15:00"),
            events: [
                asignado("09:00", "5"),
                asignado("13:00", null),
                asignado("14:30", "7"),
            ],
        },
        esperado: { startsAt: "14:30", frMin: 10, rsMin: 30 },
    },
    {
        nombre: "11. Una pausa del ciclo anterior no afecta al ciclo reabierto",
        ticket: {
            ...base,
            lastReopenedAt: h("14:00"),
            firstResponseAt: h("14:10"),
            closedAt: h("14:50"),
            events: [
                asignado("09:00", "5"),
                estado("10:00", "OPEN", "PENDING"),
                estado("12:00", "PENDING", "CLOSED"),
                estado("14:00", "CLOSED", "OPEN"),
                estado("14:50", "OPEN", "CLOSED"),
            ],
        },
        esperado: { startsAt: "14:00", frMin: 10, rsMin: 50 },
    },
    {
        nombre: "12. Respuesta antes de la reapertura no cuenta para el ciclo nuevo",
        ticket: {
            ...base,
            lastReopenedAt: h("14:00"),
            firstResponseAt: h("10:00"),
            closedAt: h("14:30"),
            events: [asignado("09:00", "5")],
        },
        // Sin respuesta en el ciclo: el cierre (14:30) cuenta como primera respuesta.
        esperado: { startsAt: "14:00", frMin: 30, rsMin: 30 },
    },
];

/* ========================================================= */

const hhmm = (d: Date | null | undefined) =>
    d ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : null;

let fallos = 0;

for (const caso of casos) {
    const sla = buildTicketSla(caso.ticket, SLA);

    const obtenido: Esperado = {
        startsAt: hhmm(sla.startsAt),
        waitingAssignment: sla.waitingAssignment,
        frStatus: sla.firstResponse.status,
        frMin: sla.firstResponse.elapsedMinutes,
        rsStatus: sla.resolution.status,
        rsMin: sla.resolution.elapsedMinutes,
    };

    const errores = (Object.keys(caso.esperado) as Array<keyof Esperado>)
        .filter((k) => caso.esperado[k] !== obtenido[k])
        .map((k) => `${k}: esperado ${caso.esperado[k]} · obtenido ${obtenido[k]}`);

    if (errores.length === 0) {
        console.log(`✅ ${caso.nombre}`);
    } else {
        fallos++;
        console.log(`❌ ${caso.nombre}`);
        for (const e of errores) console.log(`     ${e}`);
    }
}

console.log(`\n${casos.length - fallos}/${casos.length} casos correctos`);
process.exit(fallos > 0 ? 1 : 0);