export type DriveItemGraph = {
    id: string;
    name: string;
    webUrl: string;
    size?: number;
    lastModifiedDateTime?: string;
    folder?: {
        childCount?: number;
    };
    file?: {
        mimeType?: string;
    };
    parentReference?: {
        driveId?: string;
    };
};
export type CarpetaResuelta = {
    driveId: string;
    itemId: string;
    nombre: string;
    webUrl: string;
};
/**
 * Convierte una URL de SharePoint (copiada del navegador
 * o un enlace compartido) en la carpeta correspondiente.
 */
export declare function resolverCarpetaDesdeUrl(urlTexto: string): Promise<CarpetaResuelta>;
export declare function listarHijosCarpeta(driveId: string, itemId: string): Promise<DriveItemGraph[]>;
//# sourceMappingURL=sharepoint.d.ts.map