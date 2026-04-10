// lib/request-context.ts
import { AsyncLocalStorage } from "async_hooks";

interface RequestStore {
    userId: number | null;
    requestId: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestStore>();

// Fallback Map — sobrevive los await internos de Prisma
const contextMap = new Map<string, number | null>();

export function getCurrentUserId(): number | null {
    const store = asyncLocalStorage.getStore();
    if (store?.requestId) {
        const fromMap = contextMap.get(store.requestId);
        if (fromMap !== undefined) return fromMap;
    }
    return store?.userId ?? null;
}

export function setRequestContext(requestId: string, userId: number | null) {
    contextMap.set(requestId, userId);
}

export function clearRequestContext(requestId: string) {
    contextMap.delete(requestId);
}