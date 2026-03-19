import { PrismaClient, AuditAction } from "@prisma/client";

import { getCurrentUserId } from "../lib/request-context.js";

const prismaBase = new PrismaClient({
  //log:
    //process.env.NODE_ENV === "development"
    //  ? ["query", "error", "warn"]
    //  : ["error"],
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
 // --- Helper reutilizable ---
 async function getNombreSolicitante(id: number | null | undefined) {
  if (!id) return null;
  const sol = await prismaBase.solicitante.findUnique({
    where: { id_solicitante: Number(id) },
    select: { nombre: true }
  });
  return sol?.nombre || null;
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
  
      // 1. Preparamos los datos básicos con sanitizeForAudit
      let auditChanges = sanitizeForAudit(r);

      // 2. ENRIQUECIMIENTO: Si es Historial, buscamos el nombre del solicitante
      // Esto inyecta el nombre en el log sin tocar el frontend
      if (model === "Historial" && r.solicitanteId) {
      const nombre = await getNombreSolicitante(r.solicitanteId);
     if (nombre) auditChanges.nombreSolicitante = nombre;
      }

      // NUEVA LÓGICA: Si estás creando un Solicitante, captura su nombre directamente
      if (model?.toLowerCase() === "solicitante" && r.nombre) {
      auditChanges.nombreSolicitante = r.nombre;

    }

      // 3. Lógica original para obtener empresaId
      let empresaId: number | null = null;
      if (model === "Equipo") {
      const equipoFull = await prismaBase.equipo.findUnique({
      where: { id_equipo: r.id_equipo },
      include: { solicitante: true },
     });
     empresaId = equipoFull?.solicitante?.empresaId ?? null;
       } else if (model?.toLowerCase() === "solicitante") {
       empresaId = r.empresaId ?? null;
        } else if (model === "Empresa") {
         empresaId = r.id_empresa ?? null;
         }

    // 4. Guardamos el log con los cambios ya enriquecidos
    await prismaBase.auditLog.create({
      data: {
      entity: model,
      entityId: extractId(r),
      empresaId,
      action: "CREATE",
      changes: auditChanges, // Usamos el objeto modificado
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
        if (model === "Historial") {
          const oldId = before?.solicitanteId;
          const newId = r?.solicitanteId;

          // Solo procesamos si hay IDs involucrados
          if (oldId || newId) {
            const oldName = await getNombreSolicitante(oldId);
            const newName = await getNombreSolicitante(newId);

            // Solo agregamos al log si el nombre cambió o si se está creando/vinculando por primera vez
            if (oldName !== newName) {
              changes.nombreSolicitante = {
                before: oldName,
                after: newName,
              };
            }
          }
        }

        let empresaId: number | null = null;

        if (model === "Equipo" && before?.idSolicitante) {
          const solicitante = await prismaBase.solicitante.findUnique({
            where: { id_solicitante: before.idSolicitante },
          });

          empresaId = solicitante?.empresaId ?? null;
        }

        if (model?.toLowerCase() === "solicitante") {
          empresaId = before?.empresaId ?? null;
        }

        if (model === "Empresa") {
          empresaId = before?.id_empresa ?? null;
        }
        //console.log("🔍 [DEBUG PRISMA] Estructura de cambios antes de guardar:", JSON.stringify(changes, null, 2));

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

        if (model?.toLowerCase() === "solicitante"){
          const before = await prismaBase.solicitante.findUnique({ 
            where: args.where as any,
          });
          const result =await prismaBase.solicitante.update({
            where: args.where as any, 
            data : {isActive: false},
          });
          await prismaBase.auditLog.create ({
            data :{entity: model,
              entityId: before ? extractId(before) : "unknown",
              empresaId: before?.empresaId ?? null,
              action: "DELETE",
              changes: sanitizeForAudit(before),
              actorId: getCurrentUserId(),
            },
            
          });
          return result;
        }

        const delegate = (prismaBase as any)[
          model.charAt(0).toLowerCase() + model.slice(1)
        ];

        let before: any = null;

        if (args?.where) {
          before = await delegate.findUnique({
            where: args.where as any,
          });
        }

        const result = await query(args);

        // --- ESTO ES LO QUE CAMBIA: Enriquecimiento para el DELETE ---
        let auditChanges = sanitizeForAudit(before);
        
        if (model === "Historial" && before?.solicitanteId) {
          const nombre = await getNombreSolicitante(before.solicitanteId);
          if (nombre) auditChanges.nombreSolicitante = nombre;
        }
        // -------------------------------------------------------------

        let empresaId: number | null = null;

        if (model === "Equipo" && before?.solicitanteId) {
          const solicitante = await prismaBase.solicitante.findUnique({
            where: { id_solicitante: before.solicitanteId },
          });
          empresaId = solicitante?.empresaId ?? null;
          } else if (model?.toLowerCase() === "solicitante") {
          empresaId = before?.empresaId ?? null;
          } else if (model === "Empresa") {
          empresaId = before?.id_empresa ?? null;
          }

          await prismaBase.auditLog.create({
          data: {
            entity: model,
            entityId: before ? extractId(before) : "unknown",
            empresaId,
            action: "DELETE",
            // --- USAMOS LA VARIABLE ENRIQUECIDA ---
            changes: auditChanges, 
            // -------------------------------------
            actorId: getCurrentUserId(),
          },
        });
        return result;
      },
    },
  },
});