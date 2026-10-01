const MS_POR_DIA =
    24 * 60 * 60 * 1000;

export const MINIMO_DOCUMENTOS_SCORE =
    5;

export type EstadoPuntualidadCliente =
    | "SIN_HISTORIAL"
    | "EXCELENTE"
    | "BUEN_PAGADOR"
    | "IRREGULAR"
    | "RIESGO_MORA";

export type EvaluacionDocumentoPuntualidad = {
    valido:
    boolean;

    diasAtraso:
    number;

    puntaje:
    number;
};

export type ResumenPuntualidad = {
    estado:
    EstadoPuntualidadCliente;

    score:
    number | null;

    totalEvaluados:
    number;

    aTiempo:
    number;

    atrasadas:
    number;

    porcentajeATiempo:
    number;

    promedioDiasAtraso:
    number;

    documentosInvalidos:
    number;
};

/* =========================================================
   FECHAS
========================================================= */

/*
 * Compara días calendario.
 *
 * Esto evita que cambios de horario de verano
 * generen diferencias por horas.
 */
function fechaUtcDia(
    value:
        Date
): number {
    return Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate()
    );
}

export function diferenciaDiasCalendario(
    desde:
        Date,

    hasta:
        Date
): number {
    return Math.round(
        (
            fechaUtcDia(
                hasta
            ) -
            fechaUtcDia(
                desde
            )
        ) /
        MS_POR_DIA
    );
}

/* =========================================================
   PUNTAJE POR DOCUMENTO
========================================================= */

export function puntajePorDiasAtraso(
    diasAtraso:
        number
): number {
    if (
        diasAtraso <=
        0
    ) {
        return 100;
    }

    if (
        diasAtraso <=
        7
    ) {
        return 90;
    }

    if (
        diasAtraso <=
        14
    ) {
        return 80;
    }

    if (
        diasAtraso <=
        30
    ) {
        return 65;
    }

    if (
        diasAtraso <=
        60
    ) {
        return 45;
    }

    if (
        diasAtraso <=
        90
    ) {
        return 25;
    }

    return 0;
}

/* =========================================================
   EVALUAR DOCUMENTO
========================================================= */

export function evaluarDocumentoPuntualidad(
    params: {
        fechaDocto:
        Date | null;

        fechaVencimiento:
        Date;

        fechaPago:
        Date;
    }
): EvaluacionDocumentoPuntualidad {
    const {
        fechaDocto,
        fechaVencimiento,
        fechaPago,
    } = params;

    /*
     * Si el vencimiento ocurre antes de la emisión,
     * consideramos el registro inconsistente.
     *
     * No debe afectar el score.
     */
    if (
        fechaDocto
    ) {
        const diasEmisionAVencimiento =
            diferenciaDiasCalendario(
                fechaDocto,
                fechaVencimiento
            );

        if (
            diasEmisionAVencimiento <
            0
        ) {
            return {
                valido:
                    false,

                diasAtraso:
                    0,

                puntaje:
                    0,
            };
        }
    }

    const diasAtraso =
        diferenciaDiasCalendario(
            fechaVencimiento,
            fechaPago
        );

    return {
        valido:
            true,

        diasAtraso,

        puntaje:
            puntajePorDiasAtraso(
                diasAtraso
            ),
    };
}

/* =========================================================
   RESULTADO FINAL CLIENTE
========================================================= */

export function calcularResumenPuntualidad(
    params: {
        totalEvaluados:
        number;

        aTiempo:
        number;

        atrasadas:
        number;

        sumaDiasAtraso:
        number;

        sumaPuntajes:
        number;

        documentosInvalidos?:
        number;
    }
): ResumenPuntualidad {
    const {
        totalEvaluados,
        aTiempo,
        atrasadas,
        sumaDiasAtraso,
        sumaPuntajes,
        documentosInvalidos = 0,
    } = params;

    const porcentajeATiempo =
        totalEvaluados >
            0
            ? Math.round(
                (
                    aTiempo /
                    totalEvaluados
                ) *
                100
            )
            : 0;

    const promedioDiasAtraso =
        atrasadas >
            0
            ? Math.round(
                sumaDiasAtraso /
                atrasadas
            )
            : 0;

    /*
     * Una muestra inferior a 5 documentos
     * no es suficiente para clasificar.
     */
    if (
        totalEvaluados <
        MINIMO_DOCUMENTOS_SCORE
    ) {
        return {
            estado:
                "SIN_HISTORIAL",

            score:
                null,

            totalEvaluados,

            aTiempo,

            atrasadas,

            porcentajeATiempo,

            promedioDiasAtraso,

            documentosInvalidos,
        };
    }

    /*
     * Cada documento aporta entre 0 y 100.
     * El score final es el promedio.
     */
    const score =
        Math.max(
            0,
            Math.min(
                100,
                Math.round(
                    sumaPuntajes /
                    totalEvaluados
                )
            )
        );

    let estado:
        EstadoPuntualidadCliente;

    if (
        score >=
        90
    ) {
        estado =
            "EXCELENTE";
    } else if (
        score >=
        75
    ) {
        estado =
            "BUEN_PAGADOR";
    } else if (
        score >=
        50
    ) {
        estado =
            "IRREGULAR";
    } else {
        estado =
            "RIESGO_MORA";
    }

    return {
        estado,

        score,

        totalEvaluados,

        aTiempo,

        atrasadas,

        porcentajeATiempo,

        promedioDiasAtraso,

        documentosInvalidos,
    };
}