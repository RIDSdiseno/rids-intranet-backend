import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import OpenAI from "openai";

type EquipoHallazgoNormalizado = {
    id: number;
    serial: string | null;
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function analizarInventarioEmpresa(req: Request, res: Response) {
    try {
        const user = (req as any).user;

        const empresaIdParam = Number(req.params.empresaId);
        const mes = Number(req.query.mes ?? new Date().getMonth() + 1);
        const ano = Number(req.query.ano ?? new Date().getFullYear());

        if (!Number.isInteger(empresaIdParam) || empresaIdParam <= 0) {
            return res.status(400).json({ error: "empresaId inválido" });
        }

        if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
            return res.status(400).json({ error: "mes inválido" });
        }

        if (!Number.isInteger(ano) || ano < 2020) {
            return res.status(400).json({ error: "año inválido" });
        }

        const empresaId =
            user?.rol === "CLIENTE"
                ? user.empresaId
                : empresaIdParam;

        if (!empresaId) {
            return res.status(403).json({
                error: "No tienes empresa asociada",
            });
        }

        if (user?.rol === "CLIENTE" && empresaIdParam !== user.empresaId) {
            return res.status(403).json({
                error: "No tienes permisos para analizar esta empresa",
            });
        }

        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: empresaId },
            select: {
                id_empresa: true,
                nombre: true,
            },
        });

        if (!empresa) {
            return res.status(404).json({
                error: "Empresa no encontrada",
            });
        }

        const equipos = await prisma.equipo.findMany({
            where: {
                deletedAt: null,

                OR: [
                    {
                        empresaId,
                    },

                    {
                        solicitante: {
                            is: {
                                empresaId,
                            },
                        },
                    },
                ],
            },
            include: {
                detalle: true,
            },
            orderBy: {
                id_equipo: "asc",
            },
        });

        const resumenInventario = equipos.map((e) => ({
            id: e.id_equipo,
            serial: e.serial,
            marca: e.marca,
            modelo: e.modelo,
            procesador: e.procesador,
            ram: e.ram,
            disco: e.disco,
            propiedad: e.propiedad,
            estado: e.estado,
            anioPc: e.anioPc,
            anioPcOrigen: e.anioPcOrigen,
            so: e.detalle?.so ?? null,
            estadoAlm: e.detalle?.estadoAlm ?? null,
            office: e.detalle?.office ?? null,
            teamViewer: e.detalle?.teamViewer ?? null,
            revisado: e.detalle?.revisado ?? null,
        }));

        /* =========================================================
   RESUMEN POR ESTADO
========================================================= */

        const resumenEstados = equipos.reduce<
            Record<string, number>
        >(
            (acc, equipo) => {
                const estado =
                    String(
                        equipo.estado ??
                        "SIN_ESTADO"
                    );

                acc[estado] =
                    (acc[estado] ?? 0) + 1;

                return acc;
            },
            {}
        );

        const prompt = `
Analiza este inventario IT de la empresa "${empresa.nombre}"
para el periodo ${String(mes).padStart(2, "0")}/${ano}.

Devuelve SOLO JSON válido con esta estructura exacta:

{
  "hallazgos": [
    {
      "severidad": "ALTA | MEDIA | BAJA",
      "descripcion": "Descripción clara del hallazgo",
      "equipos": [
        {
          "id": 123,
          "serial": "ABC123"
        }
      ]
    }
  ],
  "riesgos": [
    "texto"
  ],
  "recomendaciones": [
    "texto"
  ],
  "resumen": "texto corto"
}

REGLAS OBLIGATORIAS PARA LOS HALLAZGOS:

- Cada hallazgo debe indicar exactamente qué equipos están afectados.
- Usa exclusivamente los campos "id" y "serial" disponibles en el inventario entregado.
- Nunca inventes IDs.
- Nunca inventes seriales.
- Si el serial de un equipo es null, vacío o no está disponible, usa null.
- Si un hallazgo aplica a varios equipos, incluye todos los equipos afectados dentro de "equipos".
- No escribas solamente "varios equipos" o "algunos equipos": identifica cada uno.
- No incluyas un equipo dentro de un hallazgo si los datos entregados no permiten justificarlo.
- Los IDs deben devolverse como números.
- Mantén los hallazgos agrupados por problema; no generes necesariamente un hallazgo separado para cada equipo.

CRITERIOS DE ANÁLISIS:

- Detecta equipos antiguos.
- Detecta bajo nivel de RAM.
- Detecta discos mecánicos o almacenamiento problemático.
- Detecta sistemas operativos antiguos o no informados.
- Detecta equipos sin revisión.
- Detecta falta de TeamViewer o datos de soporte remoto.
- Considera el estado actual del equipo.
- No presentes equipos dados de baja como si fueran equipos activos que requieren necesariamente una intervención.
- Entrega recomendaciones concretas y accionables.
- Considera que este análisis será comparado mes a mes.

RESUMEN REAL DE ESTADOS CALCULADO POR EL SISTEMA:

${JSON.stringify(resumenEstados, null, 2)}

INVENTARIO:

${JSON.stringify(resumenInventario, null, 2)}
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content:
                        "Eres un experto en soporte IT, inventario tecnológico, seguridad y renovación de equipos.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });

        const content = completion.choices?.[0]?.message?.content;

        if (!content) {
            return res.status(500).json({
                error: "La IA no devolvió contenido",
            });
        }

        const equiposPorId =
            new Map(
                equipos.map(
                    (equipo) => [
                        equipo.id_equipo,
                        equipo,
                    ]
                )
            );

        const rawAnalisis =
            JSON.parse(content);

        /* =========================================================
   NORMALIZAR HALLAZGOS
========================================================= */

        const hallazgosNormalizados =
            Array.isArray(
                rawAnalisis.hallazgos
            )
                ? rawAnalisis.hallazgos.map(
                    (
                        hallazgo: any
                    ) => {

                        /* =============================================
   EQUIPOS AFECTADOS DEL HALLAZGO
============================================= */

                        const equiposRaw: unknown[] =
                            Array.isArray(
                                hallazgo.equipos
                            )
                                ? hallazgo.equipos
                                : [];

                        const equiposHallazgoRaw:
                            EquipoHallazgoNormalizado[] =
                            equiposRaw
                                .map(
                                    (
                                        equipoIA: unknown
                                    ):
                                        | EquipoHallazgoNormalizado
                                        | null => {

                                        const equipoObj =
                                            equipoIA as {
                                                id?: unknown;
                                            };

                                        const id =
                                            Number(
                                                equipoObj?.id
                                            );

                                        /*
                                         * ID inválido:
                                         * se descarta.
                                         */
                                        if (
                                            !Number.isInteger(
                                                id
                                            )
                                        ) {
                                            return null;
                                        }

                                        /*
                                         * Validar que el equipo
                                         * realmente exista dentro
                                         * del inventario analizado.
                                         */
                                        const equipoReal =
                                            equiposPorId.get(
                                                id
                                            );

                                        if (
                                            !equipoReal
                                        ) {
                                            return null;
                                        }

                                        /*
                                         * El serial siempre se obtiene
                                         * desde la BD.
                                         */
                                        return {
                                            id:
                                                equipoReal.id_equipo,

                                            serial:
                                                equipoReal.serial ??
                                                null,
                                        };
                                    }
                                )
                                .filter(
                                    (
                                        equipo:
                                            | EquipoHallazgoNormalizado
                                            | null
                                    ): equipo is EquipoHallazgoNormalizado =>
                                        equipo !== null
                                );

                        /* =============================================
                           ELIMINAR EQUIPOS DUPLICADOS
                        ============================================= */

                        const equiposHallazgo:
                            EquipoHallazgoNormalizado[] =
                            Array.from(
                                new Map<
                                    number,
                                    EquipoHallazgoNormalizado
                                >(
                                    equiposHallazgoRaw.map(
                                        (
                                            equipo
                                        ) => [
                                                equipo.id,
                                                equipo,
                                            ]
                                    )
                                ).values()
                            );

                        /* =============================================
                           NORMALIZAR SEVERIDAD
                        ============================================= */

                        const severidad:
                            "ALTA" |
                            "MEDIA" |
                            "BAJA" =
                            hallazgo.severidad ===
                                "ALTA" ||
                                hallazgo.severidad ===
                                "MEDIA" ||
                                hallazgo.severidad ===
                                "BAJA"
                                ? hallazgo.severidad
                                : "BAJA";

                        /* =============================================
                           RETORNAR HALLAZGO NORMALIZADO
                        ============================================= */

                        return {
                            severidad,

                            descripcion:
                                String(
                                    hallazgo.descripcion ??
                                    ""
                                ).trim(),

                            equipos:
                                equiposHallazgo,
                        };
                    }
                )
                : [];

        const analisis = {
            resumen:
                String(
                    rawAnalisis.resumen ??
                    ""
                ),

            hallazgos:
                hallazgosNormalizados,

            riesgos:
                Array.isArray(
                    rawAnalisis.riesgos
                )
                    ? rawAnalisis.riesgos
                    : [],

            recomendaciones:
                Array.isArray(
                    rawAnalisis.recomendaciones
                )
                    ? rawAnalisis.recomendaciones
                    : [],
        };

        const saved =
            await prisma.analisisInventarioIA.upsert({
                where: {
                    empresaId_mes_ano: {
                        empresaId,
                        mes,
                        ano,
                    },
                },

                update: {
                    totalEquipos:
                        equipos.length,

                    /*
                     * Snapshot del estado del inventario
                     * al momento de generar el análisis.
                     */
                    resumenEstados,

                    resumen:
                        analisis.resumen ||
                        null,

                    hallazgos:
                        analisis.hallazgos,

                    riesgos:
                        analisis.riesgos,

                    recomendaciones:
                        analisis.recomendaciones,

                    generadoPorId:
                        user?.id ??
                        null,
                },

                create: {
                    empresaId,
                    mes,
                    ano,

                    totalEquipos:
                        equipos.length,

                    resumenEstados,

                    resumen:
                        analisis.resumen ||
                        null,

                    hallazgos:
                        analisis.hallazgos,

                    riesgos:
                        analisis.riesgos,

                    recomendaciones:
                        analisis.recomendaciones,

                    generadoPorId:
                        user?.id ??
                        null,
                },
            });

        return res.json({
            ok: true,

            empresaId,
            empresa,

            mes,
            ano,

            totalEquipos:
                equipos.length,

            resumenEstados,

            analisis,

            registroId:
                saved.id,
        });
    } catch (err) {
        console.error("analizarInventarioEmpresa:", err);

        return res.status(500).json({
            error: "Error analizando inventario",
        });
    }
}

export async function getAnalisisInventarioEmpresa(req: Request, res: Response) {
    try {
        const user = (req as any).user;

        const empresaIdParam = Number(req.params.empresaId);
        const mes = Number(req.query.mes);
        const ano = Number(req.query.ano);

        if (!Number.isInteger(empresaIdParam) || empresaIdParam <= 0) {
            return res.status(400).json({ error: "empresaId inválido" });
        }

        if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
            return res.status(400).json({ error: "mes inválido" });
        }

        if (!Number.isInteger(ano) || ano < 2020) {
            return res.status(400).json({ error: "año inválido" });
        }

        const empresaId =
            user?.rol === "CLIENTE"
                ? user.empresaId
                : empresaIdParam;

        if (user?.rol === "CLIENTE" && empresaIdParam !== user.empresaId) {
            return res.status(403).json({
                error: "No tienes permisos para ver esta empresa",
            });
        }

        const registro = await prisma.analisisInventarioIA.findUnique({
            where: {
                empresaId_mes_ano: {
                    empresaId,
                    mes,
                    ano,
                },
            },
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                    },
                },
                generadoPor: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
            },
        });

        if (!registro) {
            return res.json({
                ok: true,
                data: null,
            });
        }

        return res.json({
            ok: true,
            data: registro,
        });
    } catch (error) {
        console.error("getAnalisisInventarioEmpresa:", error);

        return res.status(500).json({
            ok: false,
            error: "Error obteniendo análisis de inventario",
        });
    }
}