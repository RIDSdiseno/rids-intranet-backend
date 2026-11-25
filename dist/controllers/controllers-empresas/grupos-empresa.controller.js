import { prisma } from "../../lib/prisma.js";
import { invalidarAlcanceClientes } from "../../service/empresas/alcance-cliente.service.js";
const NOMBRE_MIN = 2;
const NOMBRE_MAX = 120;
const DESCRIPCION_MAX = 500;
function parseId(valor) {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 ? n : null;
}
function normalizarNombre(valor) {
    return typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
}
function normalizarDescripcion(valor) {
    if (typeof valor !== "string")
        return null;
    const limpio = valor.trim();
    return limpio ? limpio : null;
}
/** Valida nombre/descripcion. Devuelve el mensaje de error o null si está ok. */
function validarCampos(nombre, descripcion) {
    if (nombre.length < NOMBRE_MIN)
        return `El nombre debe tener al menos ${NOMBRE_MIN} caracteres`;
    if (nombre.length > NOMBRE_MAX)
        return `El nombre no puede superar ${NOMBRE_MAX} caracteres`;
    if (descripcion && descripcion.length > DESCRIPCION_MAX) {
        return `La descripción no puede superar ${DESCRIPCION_MAX} caracteres`;
    }
    return null;
}
const MAX_EMPRESAS_POR_GUARDADO = 500;
/**
 * Lee `empresaIds` del body.
 * - undefined → no se tocan las empresas del grupo.
 * - array de ids → el grupo queda exactamente con esas empresas activas.
 * Devuelve el error como string.
 */
function parseEmpresaIds(valor) {
    if (valor === undefined)
        return undefined;
    if (!Array.isArray(valor))
        return "empresaIds debe ser una lista de ids";
    const ids = [];
    for (const v of valor) {
        const id = parseId(v);
        if (!id)
            return "empresaIds contiene un id inválido";
        ids.push(id);
    }
    const unicos = Array.from(new Set(ids));
    if (unicos.length > MAX_EMPRESAS_POR_GUARDADO) {
        return `No se pueden asignar más de ${MAX_EMPRESAS_POR_GUARDADO} empresas a la vez`;
    }
    return unicos;
}
/**
 * Calcula qué empresas agregar/quitar. `grupoId` null = grupo nuevo.
 * Las empresas inactivas que ya están en el grupo no se quitan (el selector solo muestra activas).
 */
async function planificarEmpresasGrupo(grupoId, empresaIds) {
    const encontradas = empresaIds.length
        ? await prisma.empresa.findMany({
            where: { id_empresa: { in: empresaIds } },
            select: { id_empresa: true, nombre: true, isActive: true, grupoId: true },
        })
        : [];
    if (encontradas.length !== empresaIds.length) {
        const existentes = new Set(encontradas.map((e) => e.id_empresa));
        const faltantes = empresaIds.filter((id) => !existentes.has(id));
        return `Empresas no encontradas: ${faltantes.join(", ")}`;
    }
    const inactivasNuevas = encontradas.filter((e) => !e.isActive && e.grupoId !== grupoId);
    if (inactivasNuevas.length) {
        return `No se pueden agregar empresas inactivas: ${inactivasNuevas.map((e) => e.nombre).join(", ")}`;
    }
    const agregarEmpresas = encontradas.filter((e) => grupoId === null || e.grupoId !== grupoId);
    const quitar = grupoId === null
        ? []
        : (await prisma.empresa.findMany({
            where: {
                grupoId,
                isActive: true,
                id_empresa: { notIn: empresaIds },
            },
            select: { id_empresa: true },
        })).map((e) => e.id_empresa);
    return {
        agregar: agregarEmpresas.map((e) => e.id_empresa),
        quitar,
        movidas: agregarEmpresas.filter((e) => e.grupoId !== null).length,
    };
}
/** ¿Existe otro grupo con el mismo nombre (sin distinguir mayúsculas)? */
async function nombreDuplicado(nombre, excluirId) {
    const existente = await prisma.grupoEmpresa.findFirst({
        where: {
            nombre: { equals: nombre, mode: "insensitive" },
            ...(excluirId ? { id: { not: excluirId } } : {}),
        },
        select: { id: true },
    });
    return Boolean(existente);
}
/* =======================================================
   GET /api/grupos-empresa
   Lista de grupos con sus empresas (id, nombre, isActive).
   ======================================================= */
export async function listarGruposEmpresa(_req, res) {
    try {
        const grupos = await prisma.grupoEmpresa.findMany({
            orderBy: { nombre: "asc" },
            select: {
                id: true,
                nombre: true,
                descripcion: true,
                createdAt: true,
                updatedAt: true,
                empresas: {
                    select: { id_empresa: true, nombre: true, isActive: true },
                    orderBy: { nombre: "asc" },
                },
            },
        });
        res.json({
            success: true,
            data: grupos.map((g) => ({
                ...g,
                totalEmpresas: g.empresas.length,
            })),
        });
    }
    catch (error) {
        console.error("[grupos-empresa] listar:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor" });
    }
}
/* =======================================================
   POST /api/grupos-empresa   { nombre, descripcion?, empresaIds? }
   ======================================================= */
export async function crearGrupoEmpresa(req, res) {
    try {
        const nombre = normalizarNombre(req.body?.nombre);
        const descripcion = normalizarDescripcion(req.body?.descripcion);
        const empresaIds = parseEmpresaIds(req.body?.empresaIds);
        const errorValidacion = validarCampos(nombre, descripcion);
        if (errorValidacion) {
            res.status(400).json({ success: false, error: errorValidacion });
            return;
        }
        if (typeof empresaIds === "string") {
            res.status(400).json({ success: false, error: empresaIds });
            return;
        }
        if (await nombreDuplicado(nombre)) {
            res.status(409).json({
                success: false,
                code: "GRUPO_DUPLICADO",
                error: `Ya existe un grupo llamado "${nombre}"`,
            });
            return;
        }
        const plan = await planificarEmpresasGrupo(null, empresaIds ?? []);
        if (typeof plan === "string") {
            res.status(400).json({ success: false, error: plan });
            return;
        }
        const grupo = await prisma.$transaction(async (tx) => {
            const creado = await tx.grupoEmpresa.create({
                data: { nombre, descripcion },
                select: { id: true, nombre: true, descripcion: true, createdAt: true, updatedAt: true },
            });
            for (const idEmpresa of plan.agregar) {
                await tx.empresa.update({
                    where: { id_empresa: idEmpresa },
                    data: { grupoId: creado.id },
                });
            }
            return creado;
        });
        invalidarAlcanceClientes();
        res.status(201).json({
            success: true,
            data: grupo,
            empresas: { agregadas: plan.agregar.length, quitadas: 0, movidas: plan.movidas },
        });
    }
    catch (error) {
        console.error("[grupos-empresa] crear:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor" });
    }
}
/* =======================================================
   PUT /api/grupos-empresa/:id   { nombre, descripcion?, empresaIds? }
   Si viene empresaIds, el grupo queda con exactamente esas empresas activas.
   ======================================================= */
export async function actualizarGrupoEmpresa(req, res) {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            res.status(400).json({ success: false, error: "ID inválido" });
            return;
        }
        const nombre = normalizarNombre(req.body?.nombre);
        const descripcion = normalizarDescripcion(req.body?.descripcion);
        const empresaIds = parseEmpresaIds(req.body?.empresaIds);
        const errorValidacion = validarCampos(nombre, descripcion);
        if (errorValidacion) {
            res.status(400).json({ success: false, error: errorValidacion });
            return;
        }
        if (typeof empresaIds === "string") {
            res.status(400).json({ success: false, error: empresaIds });
            return;
        }
        const existe = await prisma.grupoEmpresa.findUnique({ where: { id }, select: { id: true } });
        if (!existe) {
            res.status(404).json({ success: false, error: "Grupo no encontrado" });
            return;
        }
        if (await nombreDuplicado(nombre, id)) {
            res.status(409).json({
                success: false,
                code: "GRUPO_DUPLICADO",
                error: `Ya existe un grupo llamado "${nombre}"`,
            });
            return;
        }
        const plan = empresaIds === undefined
            ? { agregar: [], quitar: [], movidas: 0 }
            : await planificarEmpresasGrupo(id, empresaIds);
        if (typeof plan === "string") {
            res.status(400).json({ success: false, error: plan });
            return;
        }
        const grupo = await prisma.$transaction(async (tx) => {
            const actualizado = await tx.grupoEmpresa.update({
                where: { id },
                data: { nombre, descripcion },
                select: { id: true, nombre: true, descripcion: true, createdAt: true, updatedAt: true },
            });
            for (const idEmpresa of plan.quitar) {
                await tx.empresa.update({
                    where: { id_empresa: idEmpresa },
                    data: { grupoId: null },
                });
            }
            for (const idEmpresa of plan.agregar) {
                await tx.empresa.update({
                    where: { id_empresa: idEmpresa },
                    data: { grupoId: id },
                });
            }
            return actualizado;
        });
        invalidarAlcanceClientes();
        res.json({
            success: true,
            data: grupo,
            empresas: {
                agregadas: plan.agregar.length,
                quitadas: plan.quitar.length,
                movidas: plan.movidas,
            },
        });
    }
    catch (error) {
        console.error("[grupos-empresa] actualizar:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor" });
    }
}
/* =======================================================
   DELETE /api/grupos-empresa/:id
   Bloqueado (409) si el grupo tiene empresas (activas o inactivas).
   ======================================================= */
export async function eliminarGrupoEmpresa(req, res) {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            res.status(400).json({ success: false, error: "ID inválido" });
            return;
        }
        const grupo = await prisma.grupoEmpresa.findUnique({
            where: { id },
            select: { id: true, nombre: true },
        });
        if (!grupo) {
            res.status(404).json({ success: false, error: "Grupo no encontrado" });
            return;
        }
        const totalEmpresas = await prisma.empresa.count({ where: { grupoId: id } });
        if (totalEmpresas > 0) {
            res.status(409).json({
                success: false,
                code: "GRUPO_CON_EMPRESAS",
                totalEmpresas,
                error: `El grupo "${grupo.nombre}" tiene ${totalEmpresas} empresa(s). Desasígnalas antes de eliminarlo.`,
            });
            return;
        }
        await prisma.grupoEmpresa.delete({ where: { id } });
        invalidarAlcanceClientes();
        res.json({ success: true });
    }
    catch (error) {
        console.error("[grupos-empresa] eliminar:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor" });
    }
}
/* =======================================================
   PATCH /api/empresas/:id/grupo   { grupoId: number | null }
   Asigna (o quita, con null) el grupo de una empresa.
   ======================================================= */
export async function asignarGrupoEmpresa(req, res) {
    try {
        const empresaId = parseId(req.params.id);
        if (!empresaId) {
            res.status(400).json({ success: false, error: "ID de empresa inválido" });
            return;
        }
        const rawGrupoId = req.body?.grupoId;
        let grupoId;
        if (rawGrupoId === null) {
            grupoId = null;
        }
        else {
            grupoId = parseId(rawGrupoId);
            if (!grupoId) {
                res.status(400).json({ success: false, error: "grupoId debe ser un número o null" });
                return;
            }
        }
        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: empresaId },
            select: { id_empresa: true, grupoId: true },
        });
        if (!empresa) {
            res.status(404).json({ success: false, error: "Empresa no encontrada" });
            return;
        }
        if (grupoId !== null) {
            const grupo = await prisma.grupoEmpresa.findUnique({ where: { id: grupoId }, select: { id: true } });
            if (!grupo) {
                res.status(404).json({ success: false, error: "Grupo no encontrado" });
                return;
            }
        }
        if (empresa.grupoId === grupoId) {
            res.json({ success: true, sinCambios: true, data: { id_empresa: empresaId, grupoId } });
            return;
        }
        const actualizada = await prisma.empresa.update({
            where: { id_empresa: empresaId },
            data: { grupoId },
            select: {
                id_empresa: true,
                grupoId: true,
                grupo: { select: { id: true, nombre: true } },
            },
        });
        invalidarAlcanceClientes();
        res.json({ success: true, data: actualizada });
    }
    catch (error) {
        console.error("[grupos-empresa] asignar:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor" });
    }
}
//# sourceMappingURL=grupos-empresa.controller.js.map