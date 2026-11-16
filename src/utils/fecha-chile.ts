// src/utils/fecha-chile.ts
/* =========================================================
   Fechas "locales de Chile" sin zona horaria.

   Mercado Público entrega fechas como "2026-10-27T15:00:00"
   (hora de Chile, sin offset). new Date() las interpreta en la
   zona del proceso: en Railway (UTC) quedan 3-4 h corridas.
   fechaChile() las interpreta siempre como America/Santiago,
   respetando el horario de verano, sin depender de TZ.
   ========================================================= */

const ZONA_CHILE =
    "America/Santiago";

const formateadorChile =
    new Intl.DateTimeFormat(
        "en-US",
        {
            timeZone:
                ZONA_CHILE,

            hourCycle:
                "h23",

            year:
                "numeric",

            month:
                "2-digit",

            day:
                "2-digit",

            hour:
                "2-digit",

            minute:
                "2-digit",

            second:
                "2-digit",
        }
    );

/** Offset de Chile (en minutos, ej. -180) para un instante UTC. */
function offsetChileMinutos(
    utcMs: number
): number {

    const partes =
        new Map(
            formateadorChile
                .formatToParts(
                    new Date(
                        utcMs
                    )
                )
                .map(
                    (p) =>
                        [
                            p.type,
                            p.value,
                        ] as const
                )
        );

    const comoUtc =
        Date.UTC(
            Number(partes.get("year")),
            Number(partes.get("month")) - 1,
            Number(partes.get("day")),
            Number(partes.get("hour")),
            Number(partes.get("minute")),
            Number(partes.get("second"))
        );

    const segundos =
        Math.floor(
            utcMs /
            1000
        ) *
        1000;

    return Math.round(
        (
            comoUtc -
            segundos
        ) /
        60_000
    );
}

const FORMATO_LOCAL =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$/;

const CON_ZONA =
    /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Convierte una fecha de Mercado Público (hora de Chile sin zona)
 * al instante UTC correcto. Si el texto ya trae zona (Z o ±hh:mm),
 * se respeta. Devuelve null si el valor está vacío o no es válido.
 */
export function fechaChile(
    valor: unknown
): Date | null {

    if (
        valor === null ||
        valor === undefined ||
        valor === ""
    ) {
        return null;
    }

    if (
        valor instanceof
        Date
    ) {
        return Number.isNaN(
            valor.getTime()
        )
            ? null
            : valor;
    }

    const texto =
        String(
            valor
        ).trim();

    if (
        CON_ZONA.test(
            texto
        )
    ) {

        const d =
            new Date(
                texto
            );

        return Number.isNaN(
            d.getTime()
        )
            ? null
            : d;
    }

    const m =
        FORMATO_LOCAL.exec(
            texto
        );

    if (
        !m
    ) {
        return null;
    }

    const fraccion =
        m[7]
            ? Math.round(
                Number(
                    `0.${m[7]}`
                ) *
                1000
            )
            : 0;

    /* Los campos de la fecha leídos como si fueran UTC. */
    const local =
        Date.UTC(
            Number(m[1]),
            Number(m[2]) - 1,
            Number(m[3]),
            Number(m[4] ?? 0),
            Number(m[5] ?? 0),
            Number(m[6] ?? 0),
            fraccion
        );

    if (
        Number.isNaN(
            local
        )
    ) {
        return null;
    }

    /*
     * Dos pasadas: la primera estima el offset; la segunda lo
     * corrige si el instante cae al otro lado de un cambio de hora.
     */
    let utc =
        local -
        offsetChileMinutos(
            local
        ) *
        60_000;

    utc =
        local -
        offsetChileMinutos(
            utc
        ) *
        60_000;

    return new Date(
        utc
    );
}