// src/server.ts
import http from "http";
import app from "./app.js"; // 👈 default import (sin llaves)
import { Server as IOServer } from "socket.io";

/* ==== Carga tareas programadas (cron) al arrancar ==== */

/* ==== Puente de eventos → sockets (tiempo real) ==== */
import { bus } from "./lib/events.js";

function parseOrigins(raw?: string) {
  if (!raw || !raw.trim()) return ["http://localhost:5173"];
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    // normaliza si te pasan solo dominio
    .map(s => (s.startsWith("http://") || s.startsWith("https://") ? s : `https://${s}`));
}

const ORIGINS = parseOrigins(process.env.CORS_ORIGIN);
const SOCKET_PATH = process.env.SOCKET_IO_PATH || "/socket.io"; // opcional, por si usas proxy que reescribe paths

// Crea server HTTP sobre tu app Express
const server = http.createServer(app);

// Monta Socket.IO (para actualizaciones en vivo desde sync Google → Front)
export const io = new IOServer(server, {
  path: SOCKET_PATH,
  cors: {
    origin: ORIGINS,
    credentials: true,
    methods: ["GET", "POST"],
  },
  // Ajustes opcionales si hay proxies agresivos / latencia
  // pingInterval: 25000,
  // pingTimeout: 60000,
});

// Conexiones (puedes agregar auth/join a rooms por empresaId, etc.)
io.on("connection", (socket) => {
  // console.log("[socket] connected:", socket.id);

  // Ejemplo: permitir que el cliente se una a una sala por empresaId
  // socket.on("join:empresa", (empresaId: number) => {
  //   if (Number.isFinite(empresaId)) socket.join(`empresa:${empresaId}`);
  // });

  socket.on("disconnect", () => {
    // console.log("[socket] disconnected:", socket.id);
  });
});

/* ==== Reenvía eventos de tu app hacia los clientes conectados ====
   Si usas rooms por empresaId, podrías hacer:
   io.to(`empresa:${payload.empresaId}`).emit("solicitante.updated", payload)
*/
bus.on("solicitante.created", (payload) => io.emit("solicitante.created", payload));
bus.on("solicitante.updated", (payload) => io.emit("solicitante.updated", payload));

// Arranque
const PORT = Number(process.env.PORT ?? 3000);
server.listen(PORT, () => {
  console.log(`🚀 API escuchando en http://localhost:${PORT}`);
  console.log(`[ws] Socket.IO path=${SOCKET_PATH} origins=${ORIGINS.join(", ")}`);
});

// Graceful shutdown (Ctrl+C / plataforma)
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

// (Opcional) para loguear problemas no capturados:
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));
