// src/scripts/resumen-pendientes.ts
//
// Prueba manual del resumen de pendientes.
//
//   Simular (no envía; guarda el HTML para abrirlo en el navegador):
//     npx tsx --env-file=.env src/scripts/resumen-pendientes.ts
//
//   Enviar de verdad a PENDIENTES_RESUMEN_CORREOS (lo mismo que hace el cron):
//     npx tsx --env-file=.env src/scripts/resumen-pendientes.ts --enviar

import {
    writeFileSync,
} from "node:fs";

import {
    prisma,
} from "../lib/prisma.js";

import {
    procesarResumenPendientes,
} from "../service/pendientes/pendientes-resumen.service.js";

const enviar =
    process.argv.includes(
        "--enviar",
    );

try {
    const r =
        await procesarResumenPendientes({
            simular:
                !enviar,
        });

    if (
        r.html
    ) {
        writeFileSync(
            "resumen-pendientes.html",
            r.html,
            "utf8",
        );

        console.log(
            "HTML guardado en resumen-pendientes.html (ábrelo en el navegador).",
        );
    }

    console.log({
        hoy: r.hoy,
        enviado: r.enviado,
        motivo: r.motivo,
        destinatarios: r.destinatarios,
        conteos: r.conteos,
    });
} finally {
    await prisma.$disconnect();
}