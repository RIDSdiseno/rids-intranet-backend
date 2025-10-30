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
 * Upsert principal (¡sin upserts de SKUs dentro del tx!).
 * - Crea/actualiza catálogo de SKUs **fuera** de la transacción (createMany + skipDuplicates).
 * - Transacción solo para Solicitante + diff de licencias.
 * - Timeout e isolationLevel ajustados para reducir deadlocks.
 * - Retries ante deadlocks/tx cerrada.
 */
export declare function upsertSolicitanteFromMicrosoft(u: MsUserInput, empresaId: number): Promise<{
    nombre: string;
    email: string | null;
    id_solicitante: number;
    empresaId: number;
    telefono: string | null;
    clienteId: number | null;
    googleUserId: string | null;
    isActive: boolean;
    microsoftUserId: string | null;
    accountType: import("@prisma/client").$Enums.AccountType | null;
}>;
//# sourceMappingURL=solicitanteSyncMs.d.ts.map