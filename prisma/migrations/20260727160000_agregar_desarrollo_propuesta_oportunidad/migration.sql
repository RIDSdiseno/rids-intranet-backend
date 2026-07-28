-- Agrega campos de "Desarrollo de propuesta" a OportunidadVenta, relevantes en las
-- etapas COTIZACION_PREPARACION / COTIZACION_ENVIADA. Puramente aditivo: nuevos
-- enums y columnas nullable, sin backfill ni alteración de datos existentes.
--
-- NOTA: se excluyó deliberadamente del diff automático un `ALTER TABLE "Entrega"
-- DROP COLUMN "origen", DROP COLUMN "tipo"` que apareció por un drift preexistente
-- entre la base real y schema.prisma, no relacionado con este cambio. No se toca
-- la tabla Entrega en esta migración.

-- CreateEnum
CREATE TYPE "EstadoDesarrolloPropuesta" AS ENUM ('PENDIENTE', 'EN_PREPARACION', 'ESPERANDO_ANTECEDENTES', 'REVISION_INTERNA', 'LISTA_PARA_COTIZAR');

-- CreateEnum
CREATE TYPE "TipoServicioOportunidad" AS ENUM ('SOPORTE_TI', 'DESARROLLO_WEB', 'VENTA_PRODUCTOS');

-- CreateEnum
CREATE TYPE "RiesgoTecnicoOportunidad" AS ENUM ('BAJO', 'MEDIO', 'ALTO');

-- AlterTable
ALTER TABLE "OportunidadVenta"
  ADD COLUMN "comentariosInternos" TEXT,
  ADD COLUMN "condicionesEspeciales" TEXT,
  ADD COLUMN "estadoDesarrolloPropuesta" "EstadoDesarrolloPropuesta",
  ADD COLUMN "fechaComprometidaEnvio" DATE,
  ADD COLUMN "informacionPendiente" TEXT,
  ADD COLUMN "riesgoTecnico" "RiesgoTecnicoOportunidad",
  ADD COLUMN "tipoServicio" "TipoServicioOportunidad";
