import cron from "node-cron";
import { runTicketSlaAlertsJob } from "./ticket-sla-alerts.job.js";

export function startTicketSlaAlertsCron() {
    console.log("🕒 Ticket SLA alerts cron inicializado");

    cron.schedule("*/3 * * * *", async () => {
        console.log("⏰ Ejecutando revisión de alertas SLA...");
        await runTicketSlaAlertsJob();
    });
}