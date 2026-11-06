import type { Prisma } from "@prisma/client";
export type FuenteFichaLeypd = "CRM" | "RIDS" | "CLIENTE_PORTAL" | "ENLACE_PUBLICO";
export interface ValorFichaLeypd {
    valor: unknown;
    fuente: FuenteFichaLeypd;
    confirmado: boolean;
    actualizadoPor: string | null;
    fecha: string | null;
}
export type DatosFichaLeypd = Record<string, ValorFichaLeypd>;
export declare function obtenerFichaLeypdInterna(empresaId: number): Promise<{
    empresa: {
        id_empresa: number;
        nombre: string;
        razonSocial: string | null;
    };
    ficha: {
        id: number | null;
        datos: DatosFichaLeypd;
        enlaceCreadoAt: Date | null;
        tokenExpiresAt: Date | null;
        tokenRevokedAt: Date | null;
        respondidoAt: Date | null;
        respondidoPor: string | null;
        fuenteRespuesta: string | null;
        createdAt: Date | null;
        updatedAt: Date | null;
    };
    campos: import("./leypd-ficha-campos.js").CampoFichaLeypd[];
}>;
export declare function guardarFichaLeypdInterna(empresaId: number, datos: Record<string, unknown>, actorEmail: string | null): Promise<{
    empresaId: number;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    tokenHash: string | null;
    tokenExpiresAt: Date | null;
    respondidoAt: Date | null;
    datos: Prisma.JsonValue;
    tokenRevokedAt: Date | null;
    enlaceCreadoAt: Date | null;
    respondidoPor: string | null;
    fuenteRespuesta: string | null;
    nombreRespondienteBorrador: string | null;
}>;
export declare function generarEnlaceFichaLeypd(empresaId: number): Promise<{
    token: string;
    url: string;
    expiresAt: Date;
}>;
export declare function revocarEnlaceFichaLeypd(empresaId: number): Promise<{
    empresaId: number;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    tokenHash: string | null;
    tokenExpiresAt: Date | null;
    respondidoAt: Date | null;
    datos: Prisma.JsonValue;
    tokenRevokedAt: Date | null;
    enlaceCreadoAt: Date | null;
    respondidoPor: string | null;
    fuenteRespuesta: string | null;
    nombreRespondienteBorrador: string | null;
}>;
export declare function obtenerFichaLeypdPublica(token: string): Promise<{
    empresa: {
        nombre: string;
        razonSocial: string | null;
    };
    datos: DatosFichaLeypd;
    campos: import("./leypd-ficha-campos.js").CampoFichaLeypd[];
    nombreRespondienteBorrador: string | null;
    respondidoAt: Date | null;
    tokenExpiresAt: Date | null;
}>;
export declare function guardarFichaLeypdPublica(token: string, datos: Record<string, unknown>, nombre: string | null): Promise<{
    empresaId: number;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    tokenHash: string | null;
    tokenExpiresAt: Date | null;
    respondidoAt: Date | null;
    datos: Prisma.JsonValue;
    tokenRevokedAt: Date | null;
    enlaceCreadoAt: Date | null;
    respondidoPor: string | null;
    fuenteRespuesta: string | null;
    nombreRespondienteBorrador: string | null;
}>;
export declare function enviarFichaLeypdPublica(token: string, datos: Record<string, unknown>, nombre: string): Promise<{
    empresaId: number;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    tokenHash: string | null;
    tokenExpiresAt: Date | null;
    respondidoAt: Date | null;
    datos: Prisma.JsonValue;
    tokenRevokedAt: Date | null;
    enlaceCreadoAt: Date | null;
    respondidoPor: string | null;
    fuenteRespuesta: string | null;
    nombreRespondienteBorrador: string | null;
}>;
export declare function obtenerFichaLeypdCliente(empresaId: number): Promise<{
    empresa: {
        id_empresa: number;
        nombre: string;
        razonSocial: string | null;
    };
    ficha: {
        id: number | null;
        datos: DatosFichaLeypd;
        enlaceCreadoAt: Date | null;
        tokenExpiresAt: Date | null;
        tokenRevokedAt: Date | null;
        respondidoAt: Date | null;
        respondidoPor: string | null;
        fuenteRespuesta: string | null;
        createdAt: Date | null;
        updatedAt: Date | null;
    };
    campos: import("./leypd-ficha-campos.js").CampoFichaLeypd[];
}>;
export declare function guardarFichaLeypdCliente(empresaId: number, datos: Record<string, unknown>, actorEmail: string | null): Promise<{
    empresaId: number;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    tokenHash: string | null;
    tokenExpiresAt: Date | null;
    respondidoAt: Date | null;
    datos: Prisma.JsonValue;
    tokenRevokedAt: Date | null;
    enlaceCreadoAt: Date | null;
    respondidoPor: string | null;
    fuenteRespuesta: string | null;
    nombreRespondienteBorrador: string | null;
}>;
//# sourceMappingURL=leypd-ficha.service.d.ts.map