// lib/request-context.ts
import { AsyncLocalStorage } from "async_hooks";
export const asyncLocalStorage = new AsyncLocalStorage();
export function runWithRequestContext(userId, fn) {
    asyncLocalStorage.run({ userId }, fn);
}
export function getCurrentUserId() {
    return asyncLocalStorage.getStore()?.userId ?? null;
}
export function setCurrentUserId(id) {
    const store = asyncLocalStorage.getStore();
    if (store)
        store.userId = id;
}
//# sourceMappingURL=request-context.js.map