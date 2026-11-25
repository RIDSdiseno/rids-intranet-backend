import type { RequestHandler, RequestParamHandler } from "express";
/**
 * Exige un usuario autenticado. Se usa en routers montados después de
 * `api.use(auth(false))`, que deja pasar requests sin token.
 */
export declare const requireAuth: RequestHandler;
/**
 * El rol CLIENTE solo puede leer (GET/HEAD). Se usa en routers que el portal
 * muestra en modo «solo visualización» (p. ej. la ficha de empresa).
 */
export declare const soloLecturaCliente: RequestHandler;
export declare function auth(required?: boolean): RequestHandler;
/**
 * G2c: valida el `:empresaId` de la URL para el rol CLIENTE.
 * `onlyOwnEmpresa()` corre a nivel de `api`, donde `req.params` todavía está vacío,
 * así que cada router con `:empresaId` lo registra con
 * `router.param("empresaId", validarEmpresaParam)`. Compara contra `req.user.empresaId`,
 * que ya trae la empresa elegida con `X-Empresa-Id` (G2a). Para roles internos no hace nada.
 */
export declare const validarEmpresaParam: RequestParamHandler;
export declare function onlyOwnEmpresa(): RequestHandler;
//# sourceMappingURL=auth.d.ts.map