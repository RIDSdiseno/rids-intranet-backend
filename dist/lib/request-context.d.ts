import { AsyncLocalStorage } from "async_hooks";
interface RequestStore {
    userId: number | null;
}
export declare const asyncLocalStorage: AsyncLocalStorage<RequestStore>;
export declare function getCurrentUserId(): number | null;
export declare function setCurrentUserId(id: number | null): void;
export {};
//# sourceMappingURL=request-context.d.ts.map