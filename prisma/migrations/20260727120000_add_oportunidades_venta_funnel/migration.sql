-- CreateEnum
CREATE TYPE "EtapaOportunidadVenta" AS ENUM ('NUEVA', 'CONTACTADO', 'LEVANTAMIENTO', 'COTIZACION_PREPARACION_ENVIO', 'NEGOCIACION', 'GANADA', 'PERDIDA');

-- CreateEnum
CREATE TYPE "PrioridadOportunidadVenta" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'URGENTE');

-- AlterTable
ALTER TABLE "CotizacionGestioo" ADD COLUMN     "oportunidadVentaId" INTEGER;

-- CreateTable
CREATE TABLE "OportunidadVenta" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "entidadId" INTEGER,
    "proyecto" TEXT,
    "contactoNombre" TEXT,
    "contactoEmail" TEXT,
    "contactoTelefono" TEXT,
    "responsableId" INTEGER NOT NULL,
    "etapa" "EtapaOportunidadVenta" NOT NULL DEFAULT 'NUEVA',
    "prioridad" "PrioridadOportunidadVenta" NOT NULL DEFAULT 'MEDIA',
    "montoEstimado" DECIMAL(14,2),
    "moneda" "MonedaGestioo" NOT NULL DEFAULT 'CLP',
    "probabilidadCierre" INTEGER,
    "proximaAccion" TEXT,
    "fechaProximaAccion" TIMESTAMP(3),
    "fechaUltimoContacto" TIMESTAMP(3),
    "observaciones" TEXT,
    "motivoPerdida" TEXT,
    "fechaCierre" TIMESTAMP(3),
    "montoFinal" DECIMAL(14,2),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "desactivadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OportunidadVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialEtapaOportunidadVenta" (
    "id" SERIAL NOT NULL,
    "oportunidadId" INTEGER NOT NULL,
    "etapaAnterior" "EtapaOportunidadVenta",
    "etapaNueva" "EtapaOportunidadVenta" NOT NULL,
    "actorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistorialEtapaOportunidadVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeguimientoOportunidadVenta" (
    "id" SERIAL NOT NULL,
    "oportunidadId" INTEGER NOT NULL,
    "autorId" INTEGER NOT NULL,
    "comentario" TEXT NOT NULL,
    "fechaContacto" TIMESTAMP(3),
    "proximaAccion" TEXT,
    "fechaProximaAccion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeguimientoOportunidadVenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OportunidadVenta_codigo_key" ON "OportunidadVenta"("codigo");

-- CreateIndex
CREATE INDEX "OportunidadVenta_etapa_idx" ON "OportunidadVenta"("etapa");

-- CreateIndex
CREATE INDEX "OportunidadVenta_responsableId_idx" ON "OportunidadVenta"("responsableId");

-- CreateIndex
CREATE INDEX "OportunidadVenta_entidadId_idx" ON "OportunidadVenta"("entidadId");

-- CreateIndex
CREATE INDEX "OportunidadVenta_prioridad_idx" ON "OportunidadVenta"("prioridad");

-- CreateIndex
CREATE INDEX "OportunidadVenta_activo_idx" ON "OportunidadVenta"("activo");

-- CreateIndex
CREATE INDEX "OportunidadVenta_etapa_orden_idx" ON "OportunidadVenta"("etapa", "orden");

-- CreateIndex
CREATE INDEX "HistorialEtapaOportunidadVenta_oportunidadId_idx" ON "HistorialEtapaOportunidadVenta"("oportunidadId");

-- CreateIndex
CREATE INDEX "HistorialEtapaOportunidadVenta_createdAt_idx" ON "HistorialEtapaOportunidadVenta"("createdAt");

-- CreateIndex
CREATE INDEX "SeguimientoOportunidadVenta_oportunidadId_idx" ON "SeguimientoOportunidadVenta"("oportunidadId");

-- CreateIndex
CREATE INDEX "SeguimientoOportunidadVenta_createdAt_idx" ON "SeguimientoOportunidadVenta"("createdAt");

-- CreateIndex
CREATE INDEX "CotizacionGestioo_oportunidadVentaId_idx" ON "CotizacionGestioo"("oportunidadVentaId");

