import { prisma } from "../../lib/prisma.js";
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export async function analizarInventarioEmpresa(req, res) {
    try {
        const user = req.user;
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
        const empresaId = user?.rol === "CLIENTE"
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
                /*
                 * Se incluye el solicitante para poder enriquecer
                 * posteriormente los equipos encontrados por la IA.
                 */
                solicitante: {
                    select: {
                        id_solicitante: true,
                        nombre: true,
                        email: true,
                    },
                },
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
        const resumenEstados = equipos.reduce((acc, equipo) => {
            const estado = String(equipo.estado ??
                "SIN_ESTADO");
            acc[estado] =
                (acc[estado] ?? 0) + 1;
            return acc;
        }, {});
        const prompt = `
Analiza este inventario IT de la empresa "${empresa.nombre}"
para el periodo ${String(mes).padStart(2, "0")}/${ano}.

Devuelve SOLO JSON válido con esta estructura exacta:

{
  "hallazgos": [
    {
      "severidad": "ALTA | MEDIA | BAJA",
      "descripcion": "Descripción general del hallazgo",
      "equipos": [
        {
          "id": 123,
          "motivo": "Explicación concreta del problema detectado en este equipo",
          "mejora": "Acción concreta recomendada para mejorar este equipo"
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

REGLAS OBLIGATORIAS:

- Cada hallazgo debe identificar exactamente los equipos afectados.
- Usa exclusivamente IDs existentes en el inventario entregado.
- Nunca inventes IDs.
- Para cada equipo afectado debes explicar:
  1. por qué fue incluido en el hallazgo mediante "motivo";
  2. qué mejora concreta se recomienda mediante "mejora".
- El motivo debe referirse a datos reales del equipo entregado.
- La mejora debe ser concreta, técnica y accionable.
- No uses recomendaciones genéricas como "revisar equipo" si puedes indicar una acción específica.
- No incluyas un equipo si los datos disponibles no justifican el hallazgo.
- Mantén los hallazgos agrupados por problema.
- Evita repetir exactamente el mismo texto de motivo para todos los equipos cuando sus condiciones sean distintas.

CRITERIOS DE ANÁLISIS:

- Equipos antiguos.
- Bajo nivel de RAM.
- Discos mecánicos o almacenamiento problemático.
- Sistemas operativos antiguos o no informados.
- Equipos sin revisión.
- Falta de TeamViewer o soporte remoto.
- Estado actual del equipo.
- Equipos dados de baja deben ser tratados como información histórica y no necesariamente como candidatos a mejora.
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
                    content: "Eres un experto en soporte IT, inventario tecnológico, seguridad y renovación de equipos.",
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
        const equiposPorId = new Map(equipos.map((equipo) => [
            equipo.id_equipo,
            equipo,
        ]));
        const rawAnalisis = JSON.parse(content);
        /* =========================================================
   NORMALIZAR HALLAZGOS
========================================================= */
        const hallazgosNormalizados = Array.isArray(rawAnalisis.hallazgos)
            ? rawAnalisis.hallazgos.map((hallazgo) => {
                /* =============================================
EQUIPOS AFECTADOS DEL HALLAZGO
============================================= */
                const equiposRaw = Array.isArray(hallazgo.equipos)
                    ? hallazgo.equipos
                    : [];
                const equiposHallazgoRaw = equiposRaw
                    .map((equipoIA) => {
                    /*
                     * Los únicos campos que aceptamos
                     * desde la IA son:
                     *
                     * - id
                     * - motivo
                     * - mejora
                     *
                     * El resto se recupera desde Prisma.
                     */
                    const equipoObj = equipoIA;
                    const id = Number(equipoObj.id);
                    /*
                     * Si la IA devuelve un ID inválido,
                     * descartamos el registro.
                     */
                    if (!Number.isInteger(id) ||
                        id <= 0) {
                        return null;
                    }
                    /*
                     * Comprobamos que el equipo exista
                     * realmente dentro del inventario
                     * de la empresa analizada.
                     */
                    const equipoReal = equiposPorId.get(id);
                    if (!equipoReal) {
                        return null;
                    }
                    const motivo = String(equipoObj.motivo ??
                        "").trim();
                    const mejora = String(equipoObj.mejora ??
                        "").trim();
                    /*
                     * Los datos identificativos siempre
                     * salen desde la base de datos.
                     */
                    return {
                        id: equipoReal.id_equipo,
                        serial: equipoReal.serial ??
                            null,
                        marca: equipoReal.marca ??
                            null,
                        modelo: equipoReal.modelo ??
                            null,
                        solicitante: equipoReal.solicitante
                            ?.nombre ??
                            null,
                        correoSolicitante: equipoReal.solicitante
                            ?.email ??
                            null,
                        motivo: motivo ||
                            "La IA identificó este equipo dentro del hallazgo, pero no entregó un motivo específico.",
                        mejora: mejora ||
                            "Revisar técnicamente el equipo y definir la acción correctiva correspondiente.",
                    };
                })
                    .filter((equipo) => equipo !== null);
                /* =============================================
                   ELIMINAR EQUIPOS DUPLICADOS
                ============================================= */
                const equiposHallazgo = Array.from(new Map(equiposHallazgoRaw.map((equipo) => [
                    equipo.id,
                    equipo,
                ])).values());
                /* =============================================
                   NORMALIZAR SEVERIDAD
                ============================================= */
                const severidad = hallazgo.severidad ===
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
                    descripcion: String(hallazgo.descripcion ??
                        "").trim(),
                    equipos: equiposHallazgo,
                };
            })
            : [];
        const analisis = {
            resumen: String(rawAnalisis.resumen ??
                ""),
            hallazgos: hallazgosNormalizados,
            riesgos: Array.isArray(rawAnalisis.riesgos)
                ? rawAnalisis.riesgos
                : [],
            recomendaciones: Array.isArray(rawAnalisis.recomendaciones)
                ? rawAnalisis.recomendaciones
                : [],
        };
        const saved = await prisma.analisisInventarioIA.upsert({
            where: {
                empresaId_mes_ano: {
                    empresaId,
                    mes,
                    ano,
                },
            },
            update: {
                totalEquipos: equipos.length,
                /*
                 * Snapshot del estado del inventario
                 * al momento de generar el análisis.
                 */
                resumenEstados,
                resumen: analisis.resumen ||
                    null,
                hallazgos: analisis.hallazgos,
                riesgos: analisis.riesgos,
                recomendaciones: analisis.recomendaciones,
                generadoPorId: user?.id ??
                    null,
            },
            create: {
                empresaId,
                mes,
                ano,
                totalEquipos: equipos.length,
                resumenEstados,
                resumen: analisis.resumen ||
                    null,
                hallazgos: analisis.hallazgos,
                riesgos: analisis.riesgos,
                recomendaciones: analisis.recomendaciones,
                generadoPorId: user?.id ??
                    null,
            },
        });
        return res.json({
            ok: true,
            empresaId,
            empresa,
            mes,
            ano,
            totalEquipos: equipos.length,
            resumenEstados,
            analisis,
            registroId: saved.id,
        });
    }
    catch (err) {
        console.error("analizarInventarioEmpresa:", err);
        return res.status(500).json({
            error: "Error analizando inventario",
        });
    }
}
export async function getAnalisisInventarioEmpresa(req, res) {
    try {
        const user = req.user;
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
        const empresaId = user?.rol === "CLIENTE"
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
    }
    catch (error) {
        console.error("getAnalisisInventarioEmpresa:", error);
        return res.status(500).json({
            ok: false,
            error: "Error obteniendo análisis de inventario",
        });
    }
}
//# sourceMappingURL=ia-inventario.controller.js.map