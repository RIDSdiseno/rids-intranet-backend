import type { RequestHandler, RequestParamHandler } from "express";
/**
 * G2c parte 2: rutas que reciben el id de un recurso (servidor, sucursal…) en vez
 * de `:empresaId`. Para el rol CLIENTE comprueba que el recurso sea de su empresa
 * (`req.user.empresaId`, que ya trae la empresa elegida con X-Empresa-Id).
 * Para roles internos no hace nada. Si el recurso no existe, deja seguir y el
 * controller responde como siempre (404 o lista vacía).
 */
type CargarEmpresaId = (id: number) => Promise<number | null>;
/** Para `router.param("<nombre>", ...)`. */
export declare function validarRecursoParam(cargarEmpresaId: CargarEmpresaId): RequestParamHandler;
/** Para una ruta puntual cuyo parámetro tiene un nombre genérico (p. ej. `:id`). */
export declare function validarRecursoEnRuta(parametro: string, cargarEmpresaId: CargarEmpresaId): RequestHandler;
export declare function empresaIdDeServidor(id: number): Promise<number | null>;
/**
 * Empresa de un equipo: la del equipo o, si no tiene, la de su solicitante.
 * Si el equipo existe pero no tiene empresa, devuelve 0 (no coincide con
 * ningún cliente → 403 para CLIENTE). Si no existe, null (sigue al controller).
 */
export declare function empresaIdDeEquipo(id: number): Promise<number | null>;
export declare function empresaIdDeSucursal(id: number): Promise<number | null>;
export {};
//# sourceMappingURL=recurso-empresa-cliente.d.ts.map