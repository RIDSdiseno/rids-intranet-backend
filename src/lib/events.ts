// src/lib/events.ts
import { EventEmitter } from "node:events";
export const bus = new EventEmitter();

// Tipos de eventos
export type SolicitanteEvent =
  | { type: "solicitante.created"; payload: any }
  | { type: "solicitante.updated"; payload: any };

export function emitSolicitanteCreated(payload: any) {
  bus.emit("solicitante.created", { type: "solicitante.created", payload } as SolicitanteEvent);
}
export function emitSolicitanteUpdated(payload: any) {
  bus.emit("solicitante.updated", { type: "solicitante.updated", payload } as SolicitanteEvent);
}
