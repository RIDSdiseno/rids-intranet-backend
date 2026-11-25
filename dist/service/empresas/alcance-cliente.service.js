// src/service/empresas/alcance-cliente.service.ts
// Grupos de empresas · G2a: qué empresas puede ver un usuario CLIENTE.
//
// - verTodoGrupo = false (o su empresa sin grupo) → solo su empresa.
// - verTodoGrupo = true → todas las empresas ACTIVAS de su grupo (más la propia).
//
// Se lee desde la BD (no desde el token) para que el cambio del admin aplique sin re-login.
// Caché en memoria de 60 s por usuario (Railway: 1 réplica). Se limpia al editar
// clientes externos o grupos (invalidarAlcanceClientes).
import { prisma } from "../../lib/prisma.js";
const TTL_MS = 60_000;
const cache = new Map();
export function invalidarAlcanceClientes() {
    cache.clear();
}
const SIN_ACCESO = {
    empresaIdPropia: null,
    verTodoGrupo: false,
    grupo: null,
    empresas: [],
};
export async function obtenerAlcanceCliente(userId) {
    const enCache = cache.get(userId);
    if (enCache && enCache.expira > Date.now()) {
        return enCache.alcance;
    }
    const usuario = await prisma.tecnico.findUnique({
        where: { id_tecnico: userId },
        select: {
            rol: true,
            status: true,
            empresaId: true,
            verTodoGrupo: true,
            empresa: {
                select: {
                    id_empresa: true,
                    nombre: true,
                    grupo: { select: { id: true, nombre: true } },
                },
            },
        },
    });
    let alcance;
    if (!usuario || usuario.rol !== "CLIENTE" || !usuario.status || !usuario.empresa) {
        alcance = SIN_ACCESO;
    }
    else {
        const propia = {
            id_empresa: usuario.empresa.id_empresa,
            nombre: usuario.empresa.nombre,
        };
        const grupo = usuario.empresa.grupo;
        if (!usuario.verTodoGrupo || !grupo) {
            alcance = {
                empresaIdPropia: propia.id_empresa,
                verTodoGrupo: usuario.verTodoGrupo,
                grupo,
                empresas: [propia],
            };
        }
        else {
            const delGrupo = await prisma.empresa.findMany({
                where: {
                    grupoId: grupo.id,
                    isActive: true,
                    id_empresa: { not: propia.id_empresa },
                },
                select: { id_empresa: true, nombre: true },
                orderBy: { nombre: "asc" },
            });
            alcance = {
                empresaIdPropia: propia.id_empresa,
                verTodoGrupo: true,
                grupo,
                empresas: [propia, ...delGrupo],
            };
        }
    }
    cache.set(userId, { alcance, expira: Date.now() + TTL_MS });
    return alcance;
}
/** ¿El usuario CLIENTE puede ver la empresa indicada? */
export async function clientePuedeVerEmpresa(userId, empresaId) {
    const alcance = await obtenerAlcanceCliente(userId);
    return alcance.empresas.some((e) => e.id_empresa === empresaId);
}
//# sourceMappingURL=alcance-cliente.service.js.map