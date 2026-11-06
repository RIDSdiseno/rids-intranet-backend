// src/service/proteccion-datos/proteccion-datos.types.ts
import { EstadoCampaniaProteccionDatos, EstadoConsentimientoDatos, TipoEventoConsentimientoDatos, } from "@prisma/client";
export const ORIGENES_CAMPANIA_PROTECCION_DATOS = [
    "GENERAL",
    "LEYPD",
];
/**
 * Elemento Ley PD "Gestión del consentimiento".
 */
export const LEYPD_ELEMENTO_CONSENTIMIENTO = 4;
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