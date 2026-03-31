import { EventEmitter } from "node:events";
export declare const bus: EventEmitter<[never]>;
export type SolicitanteEvent = {
    type: "solicitante.created";
    payload: any;
} | {
    type: "solicitante.updated";
    payload: any;
};
export declare function emitSolicitanteCreated(payload: any): void;
export declare function emitSolicitanteUpdated(payload: any): void;
//# sourceMappingURL=events.d.ts.map