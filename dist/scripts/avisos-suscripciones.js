// src/scripts/avisos-suscripciones.ts
//
// Prueba manual de los avisos de vencimiento.
//
//   Simular (no reserva ni envía):
//     npx tsx --env-file=.env src/scripts/avisos-suscripciones.ts --simular
//
//   Simular otro día:
//     npx tsx --env-file=.env src/scripts/avisos-suscripciones.ts --simular --hoy=2026-12-01
//
//   Enviar de verdad (lo mismo que hace el cron):
//     npx tsx --env-file=.env src/scripts/avisos-suscripciones.ts
import { prisma, } from "../lib/prisma.js";
import { procesarAvisosSuscripciones, } from "../service/suscripciones-contratos/suscripciones-avisos.service.js";
const simular = process.argv.includes("--simular");
const hoy = process.argv
    .find((arg) => arg.startsWith("--hoy="))
    ?.slice(6);
try {
    const resultado = await procesarAvisosSuscripciones({
        simular,
        ...(hoy
            ? {
                hoy,
            }
            : {}),
    });
    console.log(JSON.stringify({
        ...resultado,
        planificados: resultado.planificados.map((a) => ({
            empresa: a.empresa,
            producto: a.productoPlan,
            tipo: a.tipoFecha,
            fecha: a.fecha,
            dias: a.dias,
            umbral: a.umbral,
            destinatarios: a.destinatarios,
        })),
        acompanantes: resultado.acompanantes.map((a) => ({
            empresa: a.empresa,
            producto: a.productoPlan,
            tipo: a.tipoFecha,
            fecha: a.fecha,
            dias: a.dias,
        })),
    }, null, 2));
}
finally {
    await prisma.$disconnect();
}
//# sourceMappingURL=avisos-suscripciones.js.map