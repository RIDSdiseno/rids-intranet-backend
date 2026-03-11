import http from "http";
import app from "./app.js"; 
import { Server as IOServer } from "socket.io";
import ticketRoutes from "./routes/tickets.routes.js"; // Importado correctamente
import { prisma } from "./lib/prisma.js";

/* ==== Puente de eventos → sockets (tiempo real) ==== */
import { bus } from "./lib/events.js";
import { startEmailReaderJob } from "./jobs/email-reader.job.js";
import { emailSenderService } from "./service/email/email-sender.service.js";

// --- CONFIGURACIÓN DE RUTAS ---
// Esto faltaba para que http://localhost:4000/api/tickets funcione
app.use("/api/tickets", ticketRoutes); 

function parseOrigins(raw?: string) {
  if (!raw || !raw.trim()) return ["http://localhost:5173"];
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => (s.startsWith("http://") || s.startsWith("https://") ? s : `https://${s}`));
}

const ORIGINS = parseOrigins(process.env.CORS_ORIGIN);
const SOCKET_PATH = process.env.SOCKET_IO_PATH || "/socket.io"; 

const server = http.createServer(app);

export const io = new IOServer(server, {
  path: SOCKET_PATH,
  cors: {
    origin: ORIGINS,
    credentials: true,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  socket.on("disconnect", () => {});
});

/* ==== Eventos de Socket.IO ==== */
bus.on("solicitante.created", (payload) => io.emit("solicitante.created", payload));
bus.on("solicitante.updated", (payload) => io.emit("solicitante.updated", payload));

bus.on("ticket.created", async (payload) => {
  io.emit("ticket.created", payload);
  try {
    if (payload.from && payload.aiSummary) {
    await emailSenderService.sendTicketCreatedEmail(payload.from, String(payload.id), payload.aiSummary);
  }
  } catch (error) {
    console.error("Error al enviar email:", error);
  }
  
});

bus.on("ticket.updated", async (data) => {
  if (data.changes && data.changes.status) {
    const nuevoEstado = data.changes.status;
    if (nuevoEstado === "CLOSED" || nuevoEstado === "RESOLVED") {
      const t = await prisma.ticket.findUnique({ where: { id: data.ticketId } });
      if (t?.fromEmail) {
        await emailSenderService.sendStatusEmail(t.id, nuevoEstado, t.fromEmail);
      }
      if (t?.rolAsignado) {
        const tecnicos = await prisma.tecnico.findMany({
          where: { rol: t.rolAsignado, status: true }
        });
        for (const tec of tecnicos) {
          await emailSenderService.sendStatusEmail(t.id, nuevoEstado, tec.email);
        }
      }
    }
  }
});/*  */

bus.on("ticket.message", (payload) => {
  io.emit("ticket.message", payload);
});

// Arranque - Priorizamos el puerto 4000 que muestra tu consola
const PORT = Number(process.env.PORT ?? 4000); 
server.listen(PORT, () => {
  console.log(`🚀 API escuchando en http://localhost:${PORT}`);
  console.log(`[ws] Socket.IO path=${SOCKET_PATH} origins=${ORIGINS.join(", ")}`);

  if (process.env.EMAIL_USER && (process.env.EMAIL_PASSWORD || process.env.EMAIL_SECRET)) {
    startEmailReaderJob();
  } else {
    console.warn('⚠️  Email job NO iniciado. Revisa variables de entorno.');
  }
});

const shutdown = (signal: string) => {
  console.log(`\n${signal} recibido. Cerrando…`);
  io.close(() => {
    server.close((err) => {
      if (err) {
        console.error("Error al cerrar el servidor:", err);
        process.exit(1);
      }
      console.log("✅ Servidor cerrado correctamente");
      process.exit(0);
    });
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));