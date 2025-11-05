import { prisma } from "../lib/prisma.js";
/* ========= Helpers ========= */
const getEmailDomain = (email) => {
    if (!email)
        return null;
    const at = email.indexOf("@");
    if (at < 0 || at === email.length - 1)
        return null;
    return email.slice(at + 1).trim().toLowerCase();
};
const toBigInt = (v) => {
    if (v === null || v === undefined)
        return null;
    if (typeof v === "bigint")
        return v;
    if (typeof v === "number")
        return BigInt(v);
    const s = String(v).trim();
    return s ? BigInt(s) : null;
};
const localPart = (email) => {
    if (!email)
        return null;
    const at = email.indexOf("@");
    return at > 0 ? email.slice(0, at) : null;
};
/** Resuelve TicketOrgId usando FdSourceMap (domain/companyId).  */
async function resolveTicketOrgId(params) {
    const cid = toBigInt(params.companyId ?? null);
    if (cid && cid > 0n) {
        const byCompany = await prisma.fdSourceMap.findUnique({
            where: { companyId: cid },
            select: { ticketOrgId: true },
        });
        if (byCompany)
            return byCompany.ticketOrgId;
    }
    const dom = (params.domain ?? "").trim().toLowerCase();
    if (dom) {
        const byDomain = await prisma.fdSourceMap.findUnique({
            where: { domain: dom },
            select: { ticketOrgId: true },
        });
        if (byDomain)
            return byDomain.ticketOrgId;
    }
    return null;
}
/** Crea / actualiza solicitante específico para tickets (TicketRequester). */
async function upsertTicketRequesterByAny(params) {
    const { ticketOrgId, fdRequesterId, email, phone, nameFallback } = params;
    const rid = toBigInt(fdRequesterId);
    const emailNorm = (email ?? "").trim().toLowerCase() || null;
    const name = (nameFallback?.trim() || localPart(emailNorm) || "Solicitante");
    // 1) Si viene fdRequesterId (único)
    if (rid) {
        const foundByRid = await prisma.ticketRequester.findUnique({
            where: { fdRequesterId: rid },
        });
        if (foundByRid) {
            const updateData = {};
            if (emailNorm && !foundByRid.email)
                updateData.email = emailNorm;
            if (phone && !foundByRid.phone)
                updateData.phone = phone;
            if (name && name !== foundByRid.name)
                updateData.name = name;
            if (ticketOrgId && !foundByRid.ticketOrgId)
                updateData.ticketOrgId = ticketOrgId;
            if (Object.keys(updateData).length > 0) {
                updateData.updatedAt = new Date(); // 👈 AÑADIDO
                const upd = await prisma.ticketRequester.update({
                    where: { fdRequesterId: rid },
                    data: updateData,
                });
                return upd.id;
            }
            return foundByRid.id;
        }
        // No existe por rid → probamos por email
        if (emailNorm) {
            const byEmail = await prisma.ticketRequester.findUnique({
                where: { email: emailNorm },
            });
            if (byEmail) {
                const upd = await prisma.ticketRequester.update({
                    where: { email: emailNorm },
                    data: {
                        fdRequesterId: rid,
                        phone: phone ?? byEmail.phone,
                        name: name || byEmail.name,
                        ...(ticketOrgId ? { ticketOrgId } : {}),
                        updatedAt: new Date(), // 👈 AÑADIDO
                    },
                });
                return upd.id;
            }
        }
        // Crear nuevo
        const created = await prisma.ticketRequester.create({
            data: {
                name,
                email: emailNorm,
                phone: phone ?? null,
                fdRequesterId: rid,
                ticketOrgId: ticketOrgId ?? null,
                updatedAt: new Date(), // 👈 AÑADIDO (obligatorio)
            },
        });
        return created.id;
    }
    // 2) Sin rid → deduplicación por email
    if (emailNorm) {
        const byEmail = await prisma.ticketRequester.findUnique({
            where: { email: emailNorm },
        });
        if (byEmail) {
            const updateData = {};
            if (phone && !byEmail.phone)
                updateData.phone = phone;
            if (name && name !== byEmail.name)
                updateData.name = name;
            if (ticketOrgId && !byEmail.ticketOrgId)
                updateData.ticketOrgId = ticketOrgId;
            if (Object.keys(updateData).length > 0) {
                updateData.updatedAt = new Date(); // 👈 AÑADIDO
                const upd = await prisma.ticketRequester.update({
                    where: { email: emailNorm },
                    data: updateData,
                });
                return upd.id;
            }
            return byEmail.id;
        }
        const created = await prisma.ticketRequester.create({
            data: {
                name,
                email: emailNorm,
                phone: phone ?? null,
                ticketOrgId: ticketOrgId ?? null,
                updatedAt: new Date(), // 👈 AÑADIDO
            },
        });
        return created.id;
    }
    // 3) Sin rid y sin email → genérico
    const created = await prisma.ticketRequester.create({
        data: {
            name,
            email: null,
            phone: phone ?? null,
            ticketOrgId: ticketOrgId ?? null,
            updatedAt: new Date(), // 👈 AÑADIDO
        },
    });
    return created.id;
}
/* ========= Upsert de tickets ========= */
export async function upsertTicketBatch(tickets) {
    for (const t of tickets) {
        // Solo cerrados (status = 5). Si quieres incluir abiertos, comenta la siguiente línea.
        if (Number(t.status) !== 5)
            continue;
        const requesterEmailRaw = String((t.email ?? t.requester?.email) ?? "").toLowerCase();
        const requesterEmail = requesterEmailRaw || null;
        const requesterName = (t.requester?.name ?? "Solicitante");
        const requesterId = toBigInt(t.requester_id ?? t.requester?.id ?? null);
        const telefonoRaw = t.requester?.phone ?? null;
        const telefono = telefonoRaw ? String(telefonoRaw).replace(/[^\d+]/g, "") : null;
        const domain = getEmailDomain(requesterEmail);
        const ticketOrgId = await resolveTicketOrgId({
            domain,
            companyId: t.requester?.company_id ?? t.company_id ?? null,
        });
        const ticketRequesterId = await upsertTicketRequesterByAny({
            ticketOrgId,
            fdRequesterId: requesterId,
            email: requesterEmail,
            phone: telefono,
            nameFallback: requesterName,
        });
        const ticketId = toBigInt(t.id);
        if (typeof ticketId !== "bigint")
            continue;
        await prisma.freshdeskTicket.upsert({
            where: { id: ticketId },
            update: {
                subject: t.subject,
                status: 5,
                priority: t.priority ?? 1,
                type: t.type ?? null,
                requesterEmail,
                createdAt: new Date(t.created_at),
                updatedAt: new Date(t.updated_at),
                source: t.source?.toString() ?? null,
                ticketOrgId,
                ticketRequesterId,
                capturedAt: new Date(),
            },
            create: {
                id: ticketId,
                subject: t.subject,
                status: 5,
                priority: t.priority ?? 1,
                type: t.type ?? null,
                requesterEmail,
                createdAt: new Date(t.created_at),
                updatedAt: new Date(t.updated_at),
                source: t.source?.toString() ?? null,
                ticketOrgId,
                ticketRequesterId,
                capturedAt: new Date(),
            },
        });
    }
}
//# sourceMappingURL=upsert.js.map