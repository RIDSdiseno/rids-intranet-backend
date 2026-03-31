import { AsyncLocalStorage } from "async_hooks";
interface RequestStore {
    userId: number | null;
    requestId: string;
}
export declare const asyncLocalStorage: AsyncLocalStorage<RequestStore>;
export declare function getCurrentUserId(): number | null;
export declare function setRequestContext(requestId: string, userId: number | null): void;
export declare function clearRequestContext(requestId: string): void;
export {};
//# sourceMappingURL=request-context.d.ts.map