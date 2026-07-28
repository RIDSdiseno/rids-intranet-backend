-- Agrega campos específicos de la etapa NEGOCIACION. Puramente aditivo:
-- columnas nullable. fechaEnvioPropuesta/montoPropuesto/objeciones se
-- reutilizan de la sección "Cotización enviada", ya existentes.

-- AlterTable
ALTER TABLE "OportunidadVenta"
  ADD COLUMN "versionPropuesta" TEXT,
  ADD COLUMN "contrapropuestas" TEXT,
  ADD COLUMN "ajustesSolicitados" TEXT;
