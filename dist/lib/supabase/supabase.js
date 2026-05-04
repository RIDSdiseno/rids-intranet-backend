// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
}
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        persistSession: false,
    },
});
export const TICKET_ATTACHMENTS_BUCKET = process.env.SUPABASE_TICKET_ATTACHMENTS_BUCKET || "ticket-attachments";
//# sourceMappingURL=supabase.js.map