import { z } from "zod";
export declare const empresaIdSchema: z.ZodNumber;
export declare const numeroElementoSchema: z.ZodNumber;
export declare const actualizacionIdSchema: z.ZodNumber;
/** Body de POST /leypd/actualizaciones. Sin empresaId = todas. */
export declare const crearActualizacionLeypdSchema: z.ZodObject<{
    empresaId: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    empresaId?: number | undefined;
}, {
    empresaId?: number | undefined;
}>;
export declare const tokenLeypdSchema: z.ZodString;
export declare const estadoLeypdSchema: z.ZodEnum<["NO_INICIADO", "EN_PROGRESO", "IMPLEMENTADO", "NO_APLICA"]>;
export declare const actualizarElementoLeypdSchema: z.ZodObject<{
    estado: z.ZodEnum<["NO_INICIADO", "EN_PROGRESO", "IMPLEMENTADO", "NO_APLICA"]>;
    responsable: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    fechaCompromiso: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    evidencia: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    observaciones: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    estado: "NO_APLICA" | "NO_INICIADO" | "EN_PROGRESO" | "IMPLEMENTADO";
    observaciones?: string | null | undefined;
    responsable?: string | null | undefined;
    fechaCompromiso?: string | null | undefined;
    evidencia?: string | null | undefined;
}, {
    estado: "NO_APLICA" | "NO_INICIADO" | "EN_PROGRESO" | "IMPLEMENTADO";
    observaciones?: string | null | undefined;
    responsable?: string | null | undefined;
    fechaCompromiso?: string | null | undefined;
    evidencia?: string | null | undefined;
}>;
export declare const guardarFichaLeypdSchema: z.ZodObject<{
    datos: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    datos: Record<string, unknown>;
}, {
    datos: Record<string, unknown>;
}>;
export declare const guardarFichaPublicaLeypdSchema: z.ZodObject<{
    nombre: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    datos: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    datos: Record<string, unknown>;
    nombre?: string | null | undefined;
}, {
    datos: Record<string, unknown>;
    nombre?: string | null | undefined;
}>;
export declare const enviarFichaPublicaLeypdSchema: z.ZodObject<{
    nombre: z.ZodString;
    datos: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    nombre: string;
    datos: Record<string, unknown>;
}, {
    nombre: string;
    datos: Record<string, unknown>;
}>;
export declare const vincularSharepointLeypdSchema: z.ZodObject<{
    url: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    url: string;
}, {
    url: string;
}>;
//# sourceMappingURL=leypd.schemas.d.ts.map