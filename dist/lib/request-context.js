// lib/request-context.ts
import { AsyncLocalStorage } from "async_hooks";
export const asyncLocalStorage = new AsyncLocalStorage();
// ✅ Fallback Map — sobrevive los await internos de Prisma
const contextMap = new Map();
export function getCurrentUserId() {
    const store = asyncLocalStorage.getStore();
    if (store?.requestId) {
        const fromMap = contextMap.get(store.requestId);
        if (fromMap !== undefined)
            return fromMap;
    }
    return store?.userId ?? null;
}
export function setRequestContext(requestId, userId) {
    contextMap.set(requestId, userId);
}
export function clearRequestContext(requestId) {
    contextMap.delete(requestId);
}
//# sourceMappingURL=request-context.js.map