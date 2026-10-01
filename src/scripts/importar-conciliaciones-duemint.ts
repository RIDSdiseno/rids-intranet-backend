// src/scripts/importar-conciliaciones-duemint.ts

import "dotenv/config";

import {
    createRequire,
} from "node:module";

import {
    prisma,
} from "../lib/prisma.js";

import {
    normalizarRutRcv,
} from "../service/baseapi/rcv-concilacion.mapper.js";

/* =========================================================
   XLSX
========================================================= */

const require =
    createRequire(
        import.meta.url
    );

const XLSX =
    require(
        "xlsx"
    );

/* =========================================================
   CONFIGURACIÓN
========================================================= */

/*
 * true:
 *   solo analiza y muestra qué haría.
 *   NO escribe en PostgreSQL.
 *
 * false:
 *   realiza realmente:
 *   - conciliaciones
 *   - vencimientos
 */
const DRY_RUN =
    false;

const ARCHIVO =
    process.argv[2];

const EMPRESA =
    (
        process.argv[3] ??
        "rids"
    )
        .trim()
        .toLowerCase();

/* =========================================================
   VALIDACIÓN INICIAL
========================================================= */

if (
    !ARCHIVO
) {
    throw new Error(
        "Debes indicar la ruta del archivo Duemint."
    );
}

if (
    EMPRESA !==
    "rids" &&
    EMPRESA !==
    "econnet"
) {
    throw new Error(
        "Empresa inválida. Usa rids o econnet."
    );
}

/* =========================================================
   HELPERS
========================================================= */

function texto(
    value:
        unknown
): string {
    return String(
        value ??
        ""
    )
        .trim();
}

function estadoNormalizado(
    value:
        unknown
): string {
    return texto(
        value
    )
        .toUpperCase()
        .normalize(
            "NFD"
        )
        .replace(
            /[\u0300-\u036f]/g,
            ""
        );
}

/* =========================================================
   MONTO
========================================================= */

function monto(
    value:
        unknown
): number {
    if (
        typeof value ===
        "number"
    ) {
        return Number.isFinite(
            value
        )
            ? value
            : 0;
    }

    const raw =
        texto(
            value
        );

    if (
        !raw
    ) {
        return 0;
    }

    /*
     * Ejemplos soportados:
     *
     * $1.715.980
     * 1715980
     * 1.715.980
     * 1715980,50
     */
    const limpio =
        raw
            .replace(
                /\$/g,
                ""
            )
            .replace(
                /\s/g,
                ""
            )
            .replace(
                /\./g,
                ""
            )
            .replace(
                ",",
                "."
            )
            .replace(
                /[^0-9.-]/g,
                ""
            );

    const parsed =
        Number(
            limpio
        );

    return Number.isFinite(
        parsed
    )
        ? parsed
        : 0;
}

/* =========================================================
   FECHAS
========================================================= */

function fecha(
    value:
        unknown
): Date | null {
    /*
     * XLSX con cellDates:true puede
     * entregar directamente Date.
     */
    if (
        value instanceof
        Date
    ) {
        return Number.isNaN(
            value.getTime()
        )
            ? null
            : value;
    }

    /*
     * Excel serial date.
     */
    if (
        typeof value ===
        "number"
    ) {
        const parsed =
            XLSX.SSF
                .parse_date_code(
                    value
                );

        if (
            parsed
        ) {
            return new Date(
                parsed.y,
                parsed.m - 1,
                parsed.d,
                12,
                0,
                0,
                0
            );
        }
    }

    const raw =
        texto(
            value
        );

    if (
        !raw
    ) {
        return null;
    }

    /*
     * Duemint:
     *
     * 04/09/2026
     *
     * También:
     *
     * 04-09-2026
     */
    const match =
        raw.match(
            /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/
        );

    if (
        match
    ) {
        const dia =
            Number(
                match[1]
            );

        const mes =
            Number(
                match[2]
            );

        const ano =
            Number(
                match[3]
            );

        const parsed =
            new Date(
                ano,
                mes - 1,
                dia,
                12,
                0,
                0,
                0
            );

        return Number.isNaN(
            parsed.getTime()
        )
            ? null
            : parsed;
    }

    const parsed =
        new Date(
            raw
        );

    return Number.isNaN(
        parsed.getTime()
    )
        ? null
        : parsed;
}

/* =========================================================
   TIPO DOCUMENTO DUEMINT -> SII
========================================================= */

function mapTipoDocumento(
    value:
        unknown
): string | null {
    const raw =
        texto(
            value
        );

    if (
        !raw
    ) {
        return null;
    }

    /*
     * Si Duemint entrega directamente
     * código SII.
     */
    if (
        /^\d+$/.test(
            raw
        )
    ) {
        return raw;
    }

    const tipo =
        estadoNormalizado(
            raw
        );

    /*
     * IMPORTANTE:
     *
     * Factura Exenta debe evaluarse antes
     * de Factura genérica.
     */

    if (
        tipo.includes(
            "FACTURA"
        ) &&
        tipo.includes(
            "EXENTA"
        )
    ) {
        return "34";
    }

    if (
        tipo.includes(
            "FACTURA"
        )
    ) {
        return "33";
    }

    if (
        tipo.includes(
            "NOTA"
        ) &&
        tipo.includes(
            "CREDITO"
        )
    ) {
        return "61";
    }

    if (
        tipo.includes(
            "NOTA"
        ) &&
        tipo.includes(
            "DEBITO"
        )
    ) {
        return "56";
    }

    return null;
}

async function ejecutarConReintento<T>(
    fn: () => Promise<T>,
    intentosMaximos =
        4,
    esperaMs =
        1500
): Promise<T> {
    let ultimoError:
        unknown;

    for (
        let intento =
            1;
        intento <=
        intentosMaximos;
        intento++
    ) {
        try {
            return await fn();
        } catch (
        error
        ) {
            ultimoError =
                error;

            const mensaje =
                error instanceof
                    Error
                    ? error.message
                    : String(
                        error
                    );

            const errorConexion =
                mensaje.includes(
                    "Server has closed the connection"
                ) ||
                mensaje.includes(
                    "Can't reach database server"
                ) ||
                mensaje.includes(
                    "Connection terminated"
                );

            if (
                !errorConexion ||
                intento ===
                intentosMaximos
            ) {
                throw error;
            }

            console.warn(
                `[DB] ⚠️ Conexión interrumpida. Reintento ${intento}/${intentosMaximos}...`
            );

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        esperaMs *
                        intento
                    )
            );
        }
    }

    throw ultimoError;
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
    /*
     * Se vuelve a validar dentro de main()
     * para que TypeScript conserve narrowing.
     */
    if (
        !ARCHIVO
    ) {
        throw new Error(
            "Debes indicar la ruta del archivo Duemint."
        );
    }

    const archivo =
        ARCHIVO;

    /* =====================================================
       LEER ARCHIVO
    ===================================================== */

    const workbook =
        XLSX.readFile(
            archivo,
            {
                cellDates:
                    true,
            }
        );

    const hojaNombre =
        workbook
            .SheetNames[0];

    if (
        !hojaNombre
    ) {
        throw new Error(
            "El archivo no contiene hojas."
        );
    }

    const hoja =
        workbook
            .Sheets[
        hojaNombre
        ];

    if (
        !hoja
    ) {
        throw new Error(
            `No fue posible leer la hoja "${hojaNombre}".`
        );
    }

    const filas =
        XLSX.utils
            .sheet_to_json(
                hoja,
                {
                    defval:
                        null,
                }
            ) as Array<
                Record<
                    string,
                    unknown
                >
            >;

    if (
        filas.length ===
        0
    ) {
        throw new Error(
            "El archivo no contiene registros."
        );
    }

    /* =====================================================
       DIAGNÓSTICO
    ===================================================== */

    console.log(
        "\n[DUEMINT IMPORT] Columnas detectadas:"
    );

    console.log(
        Object.keys(
            filas[0] ??
            {}
        )
    );

    console.log(
        "\n[DUEMINT IMPORT] Primeras filas:"
    );

    for (
        const [
            index,
            row,
        ]
        of filas
            .slice(
                0,
                10
            )
            .entries()
    ) {
        console.log(
            `Fila ${index + 2}`,
            {
                Cliente:
                    row.Cliente,

                Rut:
                    row.Rut,

                Folio:
                    row.Folio,

                Tipo:
                    row.Tipo,

                Estado:
                    row.Estado,

                Emision:
                    row["Emisión"],

                Vencimiento:
                    row.Vencimiento,

                Total:
                    row.Total,

                MontoPagado:
                    row[
                    "Monto Pagado"
                    ],

                MontoPorPagar:
                    row[
                    "Monto Por Pagar"
                    ],

                Pago:
                    row.Pago,
            }
        );
    }

    console.log(
        "\n[DUEMINT IMPORT] Archivo cargado",
        {
            archivo,

            empresa:
                EMPRESA,

            filas:
                filas.length,

            modo:
                DRY_RUN
                    ? "SIMULACION"
                    : "REAL",
        }
    );

    /* =====================================================
       CONTADORES
    ===================================================== */

    let conciliadas =
        0;

    let yaConciliadas =
        0;

    let tiposVacios =
        0;

    let omitidas =
        0;

    let parciales =
        0;

    let errores =
        0;

    let estadoPagadoCount =
        0;

    let saldoCeroCount =
        0;

    let montoCompletoCount =
        0;

    let tiposNoReconocidos =
        0;

    /*
     * NUEVO:
     * métricas de vencimientos.
     */
    let vencimientosDetectados =
        0;

    let vencimientosGuardados =
        0;

    let sinVencimiento =
        0;

    /* =====================================================
       PROCESAR FILAS
    ===================================================== */

    for (
        let index =
            0;
        index <
        filas.length;
        index++
    ) {
        const row =
            filas[
            index
            ];

        if (
            !row
        ) {
            continue;
        }

        const numeroFila =
            index +
            2;

        try {
            /* =============================================
               DATOS DE PAGO
            ============================================= */

            const estado =
                estadoNormalizado(
                    row.Estado
                );

            const total =
                monto(
                    row.Total
                );

            const pagado =
                monto(
                    row[
                    "Monto Pagado"
                    ]
                );

            const pendiente =
                monto(
                    row[
                    "Monto Por Pagar"
                    ]
                );

            /* =============================================
               PAGO PARCIAL
            ============================================= */

            if (
                pagado >
                0 &&
                pendiente >
                0
            ) {
                parciales++;
                omitidas++;

                continue;
            }

            /* =============================================
               DOCUMENTO PAGADO
            ============================================= */

            /*
             * Estado real observado en Duemint:
             *
             * Documento Pagado
             *
             * Normalizado:
             *
             * DOCUMENTO PAGADO
             */
            const estadoPagado =
                estado ===
                "DOCUMENTO PAGADO" ||
                estado ===
                "PAGADA" ||
                estado ===
                "PAGADO";

            const saldoCero =
                Math.abs(
                    pendiente
                ) <
                1;

            const notasCredito =
                monto(
                    row[
                    "Notas de credito"
                    ]
                );

            const notasDebito =
                monto(
                    row[
                    "Notas de debito"
                    ]
                );

            /*
             * Tolerancia $1 por redondeos.
             */
            const montoCubierto =
                pagado +
                notasCredito;

            const montoExigible =
                total +
                notasDebito;

            const montoCompleto =
                montoCubierto >=
                montoExigible -
                1;

            if (
                estadoPagado
            ) {
                estadoPagadoCount++;
            }

            if (
                saldoCero
            ) {
                saldoCeroCount++;
            }

            if (
                montoCompleto
            ) {
                montoCompletoCount++;
            }

            const pagada =
                estadoPagado &&
                saldoCero &&
                montoCompleto;

            if (
                !pagada
            ) {
                omitidas++;

                console.log(
                    `[FILA ${numeroFila}] ⚠️ OMITIDA`,
                    {
                        cliente:
                            texto(
                                row.Cliente
                            ),

                        rut:
                            texto(
                                row.Rut
                            ),

                        folio:
                            texto(
                                row.Folio
                            ),

                        tipo:
                            texto(
                                row.Tipo
                            ),

                        estadoOriginal:
                            texto(
                                row.Estado
                            ),

                        total,

                        montoPagado:
                            pagado,

                        montoPorPagar:
                            pendiente,

                        notasCredito,

                        notasDebito,

                        montoCubierto,

                        montoExigible,

                        pago:
                            row.Pago,

                        cumpleEstado:
                            estadoPagado,

                        cumpleSaldo:
                            saldoCero,

                        cumpleMontoPagado:
                            montoCompleto,

                        diferencia:
                            montoExigible -
                            montoCubierto,
                    }
                );

                continue;
            }

            /* =============================================
               IDENTIFICADORES
            ============================================= */

            const folio =
                texto(
                    row.Folio
                );

            const rut =
                normalizarRutRcv(
                    texto(
                        row.Rut
                    )
                );

            const tipoDoc =
                mapTipoDocumento(
                    row.Tipo
                );

            if (
                !folio
            ) {
                throw new Error(
                    "Folio vacío."
                );
            }

            if (
                !rut
            ) {
                throw new Error(
                    "RUT vacío o inválido."
                );
            }

            if (
                !tipoDoc
            ) {
                const tipoOriginal =
                    texto(
                        row.Tipo
                    );

                if (
                    !tipoOriginal
                ) {
                    tiposVacios++;
                    omitidas++;

                    console.log(
                        `[FILA ${numeroFila}] ⚠️ OMITIDA POR TIPO VACÍO`,
                        {
                            cliente:
                                texto(
                                    row.Cliente
                                ),

                            rut:
                                texto(
                                    row.Rut
                                ),

                            folio:
                                texto(
                                    row.Folio
                                ),

                            estado:
                                texto(
                                    row.Estado
                                ),

                            total:
                                row.Total,
                        }
                    );

                    continue;
                }

                tiposNoReconocidos++;

                console.log(
                    `[FILA ${numeroFila}] ⚠️ TIPO NO RECONOCIDO`,
                    {
                        tipoOriginal,

                        cliente:
                            texto(
                                row.Cliente
                            ),

                        rut:
                            texto(
                                row.Rut
                            ),

                        folio:
                            texto(
                                row.Folio
                            ),

                        estado:
                            texto(
                                row.Estado
                            ),

                        total:
                            row.Total,
                    }
                );

                throw new Error(
                    `Tipo no reconocido: ${tipoOriginal}`
                );
            }

            /* =============================================
               VENCIMIENTO DUEMINT
            ============================================= */

            /*
             * IMPORTANTE:
             *
             * Este bloque debe ejecutarse ANTES de comprobar
             * si la conciliación ya existe.
             *
             * De esa manera podemos volver a ejecutar el
             * importador sobre las conciliaciones históricas
             * ya cargadas y completar RcvVencimiento.
             */

            const fechaVencimiento =
                fecha(
                    row.Vencimiento
                );

            if (
                fechaVencimiento
            ) {
                vencimientosDetectados++;

                if (
                    DRY_RUN
                ) {
                    console.log(
                        `[DRY RUN FILA ${numeroFila}] 📅 Guardaría vencimiento`,
                        {
                            empresa:
                                EMPRESA,

                            tipoDoc,

                            folio,

                            rut,

                            cliente:
                                texto(
                                    row.Cliente
                                ),

                            vencimientoOriginal:
                                row.Vencimiento,

                            fechaVencimiento,
                        }
                    );
                } else {
                    const vencimientoExistente =
                        !DRY_RUN
                            ? await ejecutarConReintento(
                                () =>
                                    prisma
                                        .rcvVencimiento
                                        .findUnique({
                                            where: {
                                                empresaKey_tipoDoc_folio: {
                                                    empresaKey:
                                                        EMPRESA,

                                                    tipoDoc,

                                                    folio,
                                                },
                                            },

                                            select: {
                                                origenVencimiento:
                                                    true,
                                            },
                                        })
                            )
                            : null;
                    if (
                        vencimientoExistente
                            ?.origenVencimiento ===
                        "MANUAL"
                    ) {
                        console.log(
                            `[FILA ${numeroFila}] 🔒 Vencimiento manual conservado`,
                            {
                                empresa:
                                    EMPRESA,

                                tipoDoc,

                                folio,
                            }
                        );
                    } else {
                        await ejecutarConReintento(
                            () =>
                                prisma
                                    .rcvVencimiento
                                    .upsert({
                                        where: {
                                            empresaKey_tipoDoc_folio: {
                                                empresaKey:
                                                    EMPRESA,

                                                tipoDoc,

                                                folio,
                                            },
                                        },

                                        create: {
                                            empresaKey:
                                                EMPRESA,

                                            tipoDoc,

                                            folio,

                                            fechaVencimiento,

                                            origenVencimiento:
                                                "DUEMINT",
                                        },

                                        update: {
                                            fechaVencimiento,

                                            origenVencimiento:
                                                "DUEMINT",
                                        },
                                    })
                        );

                        vencimientosGuardados++;
                    }

                    vencimientosGuardados++;
                }
            } else {
                sinVencimiento++;

                console.log(
                    `[FILA ${numeroFila}] ⚠️ SIN VENCIMIENTO`,
                    {
                        empresa:
                            EMPRESA,

                        tipoDoc,

                        folio,

                        rut,

                        cliente:
                            texto(
                                row.Cliente
                            ),

                        vencimientoOriginal:
                            row.Vencimiento,
                    }
                );
            }

            /* =============================================
               BUSCAR CONCILIACIÓN EXISTENTE
            ============================================= */

            const existente =
                await ejecutarConReintento(
                    () =>
                        prisma
                            .rcvConciliacion
                            .findUnique({
                                where: {
                                    empresaKey_tipoRcv_tipoDoc_rutContraparte_folio: {
                                        empresaKey:
                                            EMPRESA,

                                        tipoRcv:
                                            "ventas",

                                        tipoDoc,

                                        rutContraparte:
                                            rut,

                                        folio,
                                    },
                                },
                            })
                );

            /*
             * IMPORTANTE:
             *
             * El vencimiento ya fue procesado ARRIBA.
             *
             * Por eso ahora sí podemos saltarnos una
             * conciliación existente sin perder
             * fechaVencimiento.
             */
            if (
                existente
                    ?.estadoConciliacion ===
                "CONCILIADA"
            ) {
                yaConciliadas++;

                console.log(
                    `[FILA ${numeroFila}] ℹ️ Ya conciliada`,
                    {
                        folio,

                        rut,

                        tipoDoc,

                        conciliacionId:
                            existente.id,

                        vencimiento:
                            fechaVencimiento,
                    }
                );

                continue;
            }

            /* =============================================
               FECHAS
            ============================================= */

            const fechaDocto =
                fecha(
                    row["Emisión"]
                );

            /*
             * Duemint entrega "Pago" como la fecha
             * efectiva de pago:
             *
             * 04/09/2026
             *
             * Por lo tanto esta fecha queda almacenada
             * como conciliadoAt para conservar el
             * histórico real.
             */
            const fechaPago =
                fecha(
                    row.Pago
                );

            if (
                !fechaPago
            ) {
                throw new Error(
                    `No fue posible obtener la fecha de pago para el folio ${folio}.`
                );
            }

            /* =============================================
               DRY RUN
            ============================================= */

            if (
                DRY_RUN
            ) {
                console.log(
                    `[DRY RUN FILA ${numeroFila}] ✅ Conciliaría`,
                    {
                        empresa:
                            EMPRESA,

                        tipoRcv:
                            "ventas",

                        tipoDoc,

                        folio,

                        rut,

                        cliente:
                            texto(
                                row.Cliente
                            ),

                        total,

                        montoPagado:
                            pagado,

                        montoPorPagar:
                            pendiente,

                        estado:
                            texto(
                                row.Estado
                            ),

                        fechaDocto,

                        fechaVencimiento,

                        fechaPago,

                        yaExiste:
                            Boolean(
                                existente
                            ),

                        estadoActual:
                            existente
                                ?.estadoConciliacion ??
                            null,
                    }
                );

                conciliadas++;

                continue;
            }

            /* =============================================
               IMPORTACIÓN REAL
            ============================================= */

            await prisma
                .rcvConciliacion
                .upsert({
                    where: {
                        empresaKey_tipoRcv_tipoDoc_rutContraparte_folio: {
                            empresaKey:
                                EMPRESA,

                            tipoRcv:
                                "ventas",

                            tipoDoc,

                            rutContraparte:
                                rut,

                            folio,
                        },
                    },

                    create: {
                        empresaKey:
                            EMPRESA,

                        tipoRcv:
                            "ventas",

                        tipoDoc,

                        folio,

                        rutContraparte:
                            rut,

                        razonSocial:
                            texto(
                                row.Cliente
                            ) ||
                            null,

                        fechaDocto,

                        montoNeto:
                            monto(
                                row.Neto
                            ),

                        montoIva:
                            monto(
                                row.Impuestos
                            ),

                        montoTotal:
                            total,

                        estadoRcv:
                            texto(
                                row.Estado
                            ) ||
                            null,

                        origenRcv:
                            "DUEMINT",

                        estadoConciliacion:
                            "CONCILIADA",

                        formaPago:
                            "DUEMINT",

                        observacion:
                            "Conciliación importada desde Duemint.",

                        responsable:
                            "IMPORTACION_DUEMINT",

                        conciliadoAt:
                            fechaPago,
                    },

                    update: {
                        razonSocial:
                            texto(
                                row.Cliente
                            ) ||
                            null,

                        fechaDocto,

                        montoNeto:
                            monto(
                                row.Neto
                            ),

                        montoIva:
                            monto(
                                row.Impuestos
                            ),

                        montoTotal:
                            total,

                        estadoRcv:
                            texto(
                                row.Estado
                            ) ||
                            null,

                        origenRcv:
                            "DUEMINT",

                        estadoConciliacion:
                            "CONCILIADA",

                        formaPago:
                            "DUEMINT",

                        observacion:
                            "Conciliación importada desde Duemint.",

                        responsable:
                            "IMPORTACION_DUEMINT",

                        conciliadoAt:
                            fechaPago,
                    },
                });

            conciliadas++;

            console.log(
                `[FILA ${numeroFila}] ✅ Conciliada`,
                {
                    folio,

                    rut,

                    tipoDoc,

                    total,

                    fechaVencimiento,

                    fechaPago,
                }
            );
        } catch (
        error
        ) {
            errores++;

            console.error(
                `[FILA ${numeroFila}] ❌ Error`,
                {
                    folio:
                        texto(
                            row.Folio
                        ),

                    rut:
                        texto(
                            row.Rut
                        ),

                    tipo:
                        texto(
                            row.Tipo
                        ),

                    estado:
                        texto(
                            row.Estado
                        ),

                    vencimiento:
                        row.Vencimiento,

                    pago:
                        row.Pago,

                    error:
                        error instanceof
                            Error
                            ? error.message
                            : String(
                                error
                            ),
                }
            );
        }
    }

    /* =====================================================
       RESUMEN
    ===================================================== */

    console.log(
        "\n============================================"
    );

    console.log(
        "        RESULTADO IMPORTACIÓN DUEMINT"
    );

    console.log(
        "============================================"
    );

    const totalClasificado =
        conciliadas +
        yaConciliadas +
        omitidas +
        errores;

    console.log({
        modo:
            DRY_RUN
                ? "SIMULACION"
                : "REAL",

        empresa:
            EMPRESA,

        totalFilas:
            filas.length,

        conEstadoPagado:
            estadoPagadoCount,

        conSaldoCero:
            saldoCeroCount,

        conMontoCompleto:
            montoCompletoCount,

        conciliaria:
            conciliadas,

        yaConciliadas,

        omitidas,

        pagosParciales:
            parciales,

        tiposNoReconocidos,

        tiposVacios,

        /*
         * NUEVO
         */
        vencimientosDetectados,

        vencimientosGuardados,

        sinVencimiento,

        errores,

        totalClasificado,

        coincideTotal:
            totalClasificado ===
            filas.length,
    });

    console.log(
        "============================================\n"
    );

    if (
        DRY_RUN
    ) {
        console.log(
            "ℹ️ SIMULACIÓN FINALIZADA."
        );

        console.log(
            "No se realizaron modificaciones en la base de datos."
        );

        console.log(
            "Los vencimientos mostrados tampoco fueron almacenados."
        );
    } else {
        console.log(
            "✅ IMPORTACIÓN REAL FINALIZADA."
        );

        console.log(
            "Las conciliaciones existentes fueron respetadas y los vencimientos fueron actualizados mediante upsert."
        );
    }
}

/* =========================================================
   EXEC
========================================================= */

main()
    .catch(
        error => {
            console.error(
                "[DUEMINT IMPORT] ❌ Error general",
                error
            );

            process.exitCode =
                1;
        }
    )
    .finally(
        async () => {
            await prisma
                .$disconnect();
        }
    );