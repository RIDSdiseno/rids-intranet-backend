/**
 * Resumen de campañas de consentimiento creadas
 * desde Ley PD para una empresa.
 *
 * Solo cuenta campañas con:
 *   empresaId = empresa
 *   origen = LEYPD
 *   leypdElementoNumero = 4
 *
 * NO modifica el estado del elemento 04:
 * eso sigue siendo decisión del técnico.
 */
export declare function obtenerResumenConsentimientosLeypd(empresaId: number): Promise<{
    empresaId: number;
    totales: {
        campanias: number;
        activas: number;
        borradores: number;
        destinatarios: number;
        respondidos: number;
        aceptados: number;
        rechazados: number;
        revocados: number;
        pendientes: number;
        erroresEnvio: number;
        expirados: number;
    };
    campanias: {
        id: number;
        nombre: string;
        estado: import("@prisma/client").$Enums.EstadoCampaniaProteccionDatos;
        versionDocumento: string;
        fechaInicio: Date | null;
        fechaFin: Date | null;
        fechaEnvioInicial: Date | null;
        createdAt: Date;
        destinatarios: number;
    }[];
}>;
//# sourceMappingURL=leypd-consentimientos.service.d.ts.map