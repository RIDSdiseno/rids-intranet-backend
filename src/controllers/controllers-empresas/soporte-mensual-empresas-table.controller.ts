import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";

function normalizeMes(value: unknown): string {
  const n = Number(value);

  if (!Number.isFinite(n) || n < 1 || n > 12) {
    const now = new Date();
    return String(now.getMonth() + 1).padStart(2, "0");
  }

  return String(n).padStart(2, "0");
}

function normalizeAno(value: unknown): string {
  const n = Number(value);

  if (!Number.isFinite(n) || n < 2000 || n > 2100) {
    return String(new Date().getFullYear());
  }

  return String(n);
}

function buildMonthlyRangeSantiago(mes: string, ano: string) {
  const desde = DateTime.fromObject(
    {
      year: Number(ano),
      month: Number(mes),
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    },
    { zone: "America/Santiago" }
  ).toUTC();

  const hasta = desde.plus({ months: 1 });

  return {
    desde: desde.toJSDate(),
    hasta: hasta.toJSDate(),
  };
}

export async function getSoporteMensualPorEmpresa(req: Request, res: Response) {
  try {
    const mes = normalizeMes(req.query.mes);
    const ano = normalizeAno(req.query.ano);
    const { desde, hasta } = buildMonthlyRangeSantiago(mes, ano);

    const user = req.user as {
      id?: number;
      rol?: string;
      empresaId?: number | null;
    };

    const rol = String(user?.rol ?? "").toUpperCase();

    const empresaFilter =
      rol === "CLIENTE" && user.empresaId
        ? Prisma.sql`WHERE e.id_empresa = ${user.empresaId}`
        : Prisma.empty;

    const rows = await prisma.$queryRaw<
      Array<{
        empresaId: number;
        empresa: string;
        visitas: bigint | number | null;
        diasConVisitas: bigint | number | null;
        remotas: bigint | number | null;
        tickets: bigint | number | null;
        ticketsResueltos: bigint | number | null;
        ticketsAbiertos: bigint | number | null;
        minutosVisitas: number | null;
        minutosRemotos: number | null;
        minutosTickets: number | null;
        totalMinutos: number | null;
      }>
    >(Prisma.sql`
      WITH visitas_unicas AS (
        SELECT DISTINCT
          v."empresaId",
          v."tecnicoId",
          v.inicio,
          v.fin,
          DATE(v.inicio AT TIME ZONE 'America/Santiago') AS dia
        FROM "Visita" v
        WHERE v.inicio >= ${desde}
          AND v.inicio < ${hasta}
          AND v.status = 'COMPLETADA'
          AND v.fin IS NOT NULL
          AND v.fin > v.inicio
      ),

      visitas_mes AS (
        SELECT
          vu."empresaId",
          COUNT(*)::int AS visitas,
          COUNT(DISTINCT vu.dia)::int AS dias_con_visitas,
          COALESCE(
            SUM(EXTRACT(EPOCH FROM (vu.fin - vu.inicio)) / 60),
            0
          )::int AS minutos_visitas
        FROM visitas_unicas vu
        GROUP BY vu."empresaId"
      ),

      remotas_mes AS (
        SELECT
          m."empresaId",
          COUNT(*)::int AS remotas,
          COALESCE(
            SUM(
              CASE
                WHEN m."duracionMinutos" IS NOT NULL
                  AND m."duracionMinutos" > 0
                THEN m."duracionMinutos"
                ELSE 0
              END
            ),
            0
          )::int AS minutos_remotos
        FROM "MantencionRemota" m
        WHERE m.inicio >= ${desde}
          AND m.inicio < ${hasta}
        GROUP BY m."empresaId"
      ),

      tickets_mes AS (
        SELECT
          t."empresaId",
          COUNT(*)::int AS tickets,

          COUNT(*) FILTER (
            WHERE t.status IN ('RESOLVED', 'CLOSED')
          )::int AS tickets_resueltos,

          COUNT(*) FILTER (
            WHERE t.status NOT IN ('RESOLVED', 'CLOSED')
          )::int AS tickets_abiertos,

          COALESCE(
            SUM(
              CASE
                WHEN COALESCE(t."resolvedAt", t."closedAt") IS NOT NULL
                  AND COALESCE(t."resolvedAt", t."closedAt") > t."createdAt"
                THEN LEAST(
                  ROUND(
                    EXTRACT(
                      EPOCH FROM (
                        COALESCE(t."resolvedAt", t."closedAt") - t."createdAt"
                      )
                    ) / 60
                  ),
                  480
                )
                ELSE 0
              END
            ),
            0
          )::int AS minutos_tickets
        FROM "Ticket" t
        WHERE t."createdAt" >= ${desde}
          AND t."createdAt" < ${hasta}
          AND t."deletedAt" IS NULL
        GROUP BY t."empresaId"
      )

      SELECT
        e.id_empresa AS "empresaId",
        e.nombre AS empresa,

        COALESCE(v.visitas, 0) AS visitas,
        COALESCE(v.dias_con_visitas, 0) AS "diasConVisitas",

        COALESCE(r.remotas, 0) AS remotas,
        COALESCE(t.tickets, 0) AS tickets,
        COALESCE(t.tickets_resueltos, 0) AS "ticketsResueltos",
        COALESCE(t.tickets_abiertos, 0) AS "ticketsAbiertos",

        COALESCE(v.minutos_visitas, 0) AS "minutosVisitas",
        COALESCE(r.minutos_remotos, 0) AS "minutosRemotos",
        COALESCE(t.minutos_tickets, 0) AS "minutosTickets",

        (
          COALESCE(v.minutos_visitas, 0)
          + COALESCE(r.minutos_remotos, 0)
          + COALESCE(t.minutos_tickets, 0)
        ) AS "totalMinutos"

      FROM "Empresa" e
      LEFT JOIN visitas_mes v ON v."empresaId" = e.id_empresa
      LEFT JOIN remotas_mes r ON r."empresaId" = e.id_empresa
      LEFT JOIN tickets_mes t ON t."empresaId" = e.id_empresa
      ${empresaFilter}
      ORDER BY "totalMinutos" DESC, e.nombre ASC
    `);

    const data = rows.map((row) => {
      const visitas = Number(row.visitas ?? 0);
      const diasConVisitas = Number(row.diasConVisitas ?? 0);
      const remotas = Number(row.remotas ?? 0);
      const tickets = Number(row.tickets ?? 0);
      const ticketsResueltos = Number(row.ticketsResueltos ?? 0);
      const ticketsAbiertos = Number(row.ticketsAbiertos ?? 0);

      const minutosVisitas = Number(row.minutosVisitas ?? 0);
      const minutosRemotos = Number(row.minutosRemotos ?? 0);
      const minutosTickets = Number(row.minutosTickets ?? 0);
      const totalMinutos = Number(row.totalMinutos ?? 0);

      return {
        empresaId: Number(row.empresaId),
        empresa: row.empresa,

        visitas,
        visitasPresenciales: visitas,
        diasConVisitas,

        remotas,
        sesionesRemotas: remotas,

        tickets,
        ticketsTotal: tickets,
        ticketsResueltos,
        ticketsAbiertos,

        minutosVisitas,
        minutosRemotos,
        minutosTickets,
        totalMinutos,

        totalHoras: Math.round((totalMinutos / 60) * 10) / 10,
        horasVisitas: Math.round((minutosVisitas / 60) * 10) / 10,
        horasRemotas: Math.round((minutosRemotos / 60) * 10) / 10,
        horasTickets: Math.round((minutosTickets / 60) * 10) / 10,
      };
    });

    return res.json({
      ok: true,
      versionCalculo: "SOPORTE_MENSUAL_VISITAS_UNICAS_V2",
      periodo: {
        mes,
        ano,
        desde,
        hasta,
      },
      data,
    });
  } catch (error) {
    console.error("getSoporteMensualPorEmpresa error:", error);

    return res.status(500).json({
      ok: false,
      message: "Error al obtener soporte mensual por empresa",
    });
  }
}