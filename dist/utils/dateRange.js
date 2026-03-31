export function monthRange(ym) {
    // ym = "YYYY-MM"
    const [y, m] = ym.split("-").map(Number);
    if (!y || !m)
        throw new Error("month inválido (usa YYYY-MM)");
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 0, 0, 0));
    return { start, end };
}
//# sourceMappingURL=dateRange.js.map