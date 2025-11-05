export type MsUserInput = {
    id: string;
    email: string | null;
    name: string;
    suspended: boolean;
    licenses: Array<{
        skuId: string;
        skuPartNumber: string;
        displayName?: string;
    }>;
};
/**
 * Upsert principal (sin upserts de SKUs aquí).
 * - El catálogo de SKUs se pre-crea en lote desde el router.
 * - Transacción solo para Solicitante + diff de licencias.
 * - Timeout e isolationLevel ajustados para reducir deadlocks.
 * - Retries ante deadlocks/tx cerrada.
 *
 * Devuelve: { solicitante, created }
 */
export declare function upsertSolicitanteFromMicrosoft(u: MsUserInput, empresaId: number): Promise<{
    solicitante: any;
    created: boolean;
}>;
//# sourceMappingURL=solicitanteSyncMs.d.ts.map