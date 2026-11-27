// src/service/equipos/estado-agente.service.ts
//
// Estado del agente de inventario que se muestra al usuario (ficha del equipo,
// listado de Equipos). Usa el mismo criterio que el dashboard de agentes:
//   - DESINSTALADO: el desinstalador avisó al CRM (estadoAgente guardado).
//   - SIN_AGENTE:   nunca envió inventario (sin lastSeenAt).
//   - SIN_CONEXION: no reporta hace más de AGENT_OFFLINE_AFTER_HOURS (504 h).
//   - ACTIVO (o ADVERTENCIA / CRITICO si así está guardado).
// El receptor vuelve a guardar ACTIVO en cada envío, así que un agente
// reinstalado deja de verse como desinstalado sin hacer nada más.

export type EstadoAgenteEfectivo =
    | "ACTIVO"
    | "SIN_CONEXION"
    | "SIN_AGENTE"
    | "DESINSTALADO"
    | "ADVERTENCIA"
    | "CRITICO";

/* Mismo umbral y misma validación que el dashboard de agentes. */
export function horasSinConexionAgente(): number {
    const valor = Number(process.env.AGENT_OFFLINE_AFTER_HOURS);

    return Number.isFinite(valor) && valor > 0
        ? valor
        : 504; // 21 días: el agente envía cada 14 días + 1 semana de margen
}

export function estadoAgenteEfectivo(
    estadoGuardado: string | null | undefined,
    lastSeenAt: Date | string | null | undefined,
    horasSinConexion: number = horasSinConexionAgente()
): EstadoAgenteEfectivo {
    if (estadoGuardado === "DESINSTALADO") {
        return "DESINSTALADO";
    }

    if (!lastSeenAt) {
        return "SIN_AGENTE";
    }

    const ultimaConexion = new Date(lastSeenAt).getTime();

    if (
        !Number.isFinite(ultimaConexion) ||
        Date.now() - ultimaConexion > horasSinConexion * 60 * 60 * 1000
    ) {
        return "SIN_CONEXION";
    }

    if (estadoGuardado === "ADVERTENCIA" || estadoGuardado === "CRITICO") {
        return estadoGuardado;
    }

    return "ACTIVO";
}