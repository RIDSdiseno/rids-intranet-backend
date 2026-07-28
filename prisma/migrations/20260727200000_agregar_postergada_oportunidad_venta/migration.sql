ALTER TYPE "EtapaOportunidadVenta" ADD VALUE IF NOT EXISTS 'POSTERGADA';

ALTER TABLE "OportunidadVenta"
  ADD COLUMN "motivoPostergacion" TEXT,
  ADD COLUMN "fechaReactivacion" DATE;
