// lib/request-context.ts
import { AsyncLocalStorage } from "async_hooks";

interface RequestStore {
    userId: number | null;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestStore>();

export function getCurrentUserId(): number | null {
    return asyncLocalStorage.getStore()?.userId ?? null;
}

// Add this
export function setCurrentUserId(id: number | null): void {
    const store = asyncLocalStorage.getStore();
    if (store) store.userId = id;
}