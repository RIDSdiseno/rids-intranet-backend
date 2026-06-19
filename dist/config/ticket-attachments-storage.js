// src/config/ticket-attachments-storage.ts
import crypto from "crypto";
import { supabaseAdmin, TICKET_ATTACHMENTS_BUCKET, } from "../lib/supabase/supabase.js";
function sanitizeFilename(filename) {
    return filename
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w.\-]+/g, "_");
}
export async function uploadTicketAttachmentBuffer(params) {
    const safeName = sanitizeFilename(params.filename);
    const uniqueName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const storagePath = `tickets/${params.ticketId}/messages/${params.messageId}/${uniqueName}`;
    const { error } = await supabaseAdmin
        .storage
        .from(TICKET_ATTACHMENTS_BUCKET)
        .upload(storagePath, params.buffer, {
        contentType: params.mimeType || "application/octet-stream",
        upsert: false,
    });
    if (error) {
        console.error("❌ Error subiendo adjunto a Supabase:", {
            ticketId: params.ticketId,
            messageId: params.messageId,
            filename: safeName,
            storagePath,
            error,
        });
        throw error;
    }
    return {
        filename: safeName,
        mimeType: params.mimeType || "application/octet-stream",
        url: storagePath,
        bytes: params.buffer.length,
    };
}
//# sourceMappingURL=ticket-attachments-storage.js.map