import { EtapaBitacora } from "@prisma/client";
type SubirEvidenciaBitacoraStorageParams = {
    bitacoraId: number;
    etapa: EtapaBitacora;
    file: Express.Multer.File;
};
type ResultadoSubidaEvidencia = {
    storagePath: string;
};
/**
 * Sube una imagen o video al bucket privado
 * de evidencias de Bitácora.
 *
 * La función solamente devuelve storagePath,
 * ya que la URL de acceso será temporal
 * mediante createSignedUrl().
 */
export declare function subirEvidenciaBitacoraStorage(params: SubirEvidenciaBitacoraStorageParams): Promise<ResultadoSubidaEvidencia>;
/**
 * Genera una URL firmada temporal para visualizar
 * una evidencia almacenada en bucket privado.
 *
 * Por defecto dura una hora.
 */
export declare function obtenerUrlFirmadaEvidenciaBitacora(storagePath: string, expiresInSeconds?: number): Promise<string>;
/**
 * Elimina físicamente una evidencia
 * desde Supabase Storage.
 */
export declare function eliminarEvidenciaBitacoraStorage(storagePath: string): Promise<void>;
/**
 * Genera signed URLs para varias evidencias.
 *
 * Esta función será útil posteriormente en:
 *
 * GET /bitacora-tecnico/:id/evidencias
 *
 * y en el detalle individual de la bitácora.
 */
export declare function agregarUrlsFirmadasAEvidencias<T extends {
    storagePath: string;
}>(evidencias: T[], expiresInSeconds?: number): Promise<Array<T & {
    url: string;
}>>;
export {};
//# sourceMappingURL=bitacora-evidencias-storage.service.d.ts.map