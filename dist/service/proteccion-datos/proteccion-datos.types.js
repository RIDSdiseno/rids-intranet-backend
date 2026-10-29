// src/service/proteccion-datos/proteccion-datos.types.ts
import { EstadoCampaniaProteccionDatos, EstadoConsentimientoDatos, TipoEventoConsentimientoDatos, } from "@prisma/client";
/* =========================================================
   ESTADOS PERMITIDOS
   ========================================================= */
export const ESTADOS_RESPONDIBLES = [
    EstadoConsentimientoDatos.PENDIENTE,
    EstadoConsentimientoDatos.ENVIADO,
];
export const ESTADOS_REVOCABLES = [
    EstadoConsentimientoDatos.ACEPTADO,
];
//# sourceMappingURL=proteccion-datos.types.js.map