// lib/request-context.ts
import { AsyncLocalStorage } from "async_hooks";
export const asyncLocalStorage = new AsyncLocalStorage();
export function getCurrentUserId() {
    return asyncLocalStorage.getStore()?.userId ?? null;
}
// Add this
export function setCurrentUserId(id) {
    const store = asyncLocalStorage.getStore();
    if (store)
        store.userId = id;
}
//# sourceMappingURL=request-context.js.map