import { PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../lib/request-context.js";


type AuditAction = "CREATE" | "UPDATE" | "DELETE";
const prismaBase = new PrismaClient({
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"],
});

/* =========================
   EXTRAER ID DINÁMICAMENTE
========================= */

function extractId(obj: any): string {
  if (!obj) return "unknown";

  for (const key of Object.keys(obj)) {
    if (key.toLowerCase().startsWith("id")) {
      return String(obj[key]);
    }
  }

  return "unknown";
}

/* =========================
   DIFF SEGURO
========================= */

function diffObjects(before: any, after: any) {
  const changes: Record<string, { before: any; after: any }> = {};

  if (!before || !after) return changes;

  const isPrimitive = (val: any) =>
    val === null ||
    typeof val === "string" ||
    typeof val === "number" ||
    typeof val === "boolean";

  for (const key in after) {
    if (key === "updatedAt") continue; // opcional ignorar

    const beforeVal = before[key];
    const afterVal = after[key];

    // 🔥 Solo comparar primitivos
    if (!isPrimitive(afterVal)) continue;

    if (beforeVal !== afterVal) {
      changes[key] = {
        before: beforeVal ?? null,
        after: afterVal ?? null,
      };
    }
  }

  return changes;
}

function sanitizeForAudit(obj: any) {
  if (!obj) return {};

  const clean: Record<string, any> = {};

  const isPrimitive = (val: any) =>
    val === null ||
    typeof val === "string" ||
    typeof val === "number" ||
    typeof val === "boolean";

  for (const key in obj) {
    if (isPrimitive(obj[key])) {
      clean[key] = obj[key];
    }
  }

  return clean;
}

/* =========================
   EXTENSION GLOBAL AUTOMÁTICA
========================= */

export const prisma = prismaBase.$extends({
  query: {
    $allModels: {
      async create({ model, args, query }) {
        const result = await query(args);

        if (!model || model === "AuditLog") return result;

        const r: any = result;

        let empresaId: number | null = null;

        if (model === "Equipo") {
          const equipoFull = await prismaBase.equipo.findUnique({
            where: { id_equipo: r.id_equipo },
            include: { solicitante: true },
          });

          empresaId = equipoFull?.solicitante?.empresaId ?? null;
        }

        if (model === "Solicitante") {
          empresaId = r.empresaId ?? null;
        }

        if (model === "Empresa") {
          empresaId = r.id_empresa ?? null;
        }

        await prismaBase.auditLog.create({
          data: {
            entity: model,
            entityId: extractId(r),
            empresaId,
            action: "CREATE",
            changes: sanitizeForAudit(r),
            actorId: getCurrentUserId(),
          },
        });

        return result;
      },

      async update({ model, args, query }) {
        if (!model || model === "AuditLog") {
          return query(args);
        }

        const delegate = (prismaBase as any)[
          model.charAt(0).toLowerCase() + model.slice(1)
        ];

        let before: any = null;

        if (args?.where) {
          before = await delegate.findUnique({
            where: args.where,
          });
        }

        const result = await query(args);
        const r: any = result;

        const changes = diffObjects(
          sanitizeForAudit(before),
          sanitizeForAudit(r)
        );

        let empresaId: number | null = null;

        if (model === "Equipo" && before?.idSolicitante) {
          const solicitante = await prismaBase.solicitante.findUnique({
            where: { id_solicitante: before.idSolicitante },
          });

          empresaId = solicitante?.empresaId ?? null;
        }

        if (model === "Solicitante") {
          empresaId = before?.empresaId ?? null;
        }

        if (model === "Empresa") {
          empresaId = before?.id_empresa ?? null;
        }

        await prismaBase.auditLog.create({
          data: {
            entity: model,
            entityId: extractId(r),
            empresaId,
            action: "UPDATE",
            changes: JSON.parse(JSON.stringify(changes)),
            actorId: getCurrentUserId(),
          },
        });

        return result;
      },

      async delete({ model, args, query }) {
        if (!model || model === "AuditLog") {
          return query(args);
        }

        const delegate = (prismaBase as any)[
          model.charAt(0).toLowerCase() + model.slice(1)
        ];

        let before: any = null;

        if (args?.where) {
          before = await delegate.findUnique({
            where: args.where,
          });
        }

        const result = await query(args);

        let empresaId: number | null = null;

        if (model === "Equipo" && before?.idSolicitante) {
          const solicitante = await prismaBase.solicitante.findUnique({
            where: { id_solicitante: before.idSolicitante },
          });

          empresaId = solicitante?.empresaId ?? null;
        }

        if (model === "Solicitante") {
          empresaId = before?.empresaId ?? null;
        }

        if (model === "Empresa") {
          empresaId = before?.id_empresa ?? null;
        }

        await prismaBase.auditLog.create({
          data: {
            entity: model,
            entityId: before ? extractId(before) : "unknown",
            empresaId,
            action: "DELETE",
            changes: sanitizeForAudit(before),
            actorId: getCurrentUserId(),
          },
        });

        return result;
      },
    },
  },
});