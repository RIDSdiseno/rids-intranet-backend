// src/lib/events.ts
import { EventEmitter } from "node:events";
export const bus = new EventEmitter();
export function emitSolicitanteCreated(payload) {
    bus.emit("solicitante.created", { type: "solicitante.created", payload });
}
export function emitSolicitanteUpdated(payload) {
    bus.emit("solicitante.updated", { type: "solicitante.updated", payload });
}
//# sourceMappingURL=events.js.map