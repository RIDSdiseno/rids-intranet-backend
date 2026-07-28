-- Agrega campos de seguimiento post-envío de la cotización, relevantes en la
-- etapa COTIZACION_ENVIADA (distintos de los de "desarrollo de propuesta" de
-- COTIZACION_PREPARACION). Puramente aditivo: columnas nullable.

-- AlterTable
ALTER TABLE "OportunidadVenta"
  ADD COLUMN "montoPropuesto" DECIMAL(14,2),
  ADD COLUMN "fechaEnvioPropuesta" DATE,
  ADD COLUMN "fechaVencimientoPropuesta" DATE,
  ADD COLUMN "comentariosCliente" TEXT,
  ADD COLUMN "objeciones" TEXT;
