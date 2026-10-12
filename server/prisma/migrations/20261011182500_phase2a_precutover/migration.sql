-- Phase 2A schema only. Does not import business data or change JSON source of truth.

ALTER TYPE "ItemType" ADD VALUE IF NOT EXISTS 'PACKAGING_MATERIAL';

ALTER TYPE "StockMoveType" ADD VALUE IF NOT EXISTS 'REVERSAL_IN';
ALTER TYPE "StockMoveType" ADD VALUE IF NOT EXISTS 'REVERSAL_OUT';

DO $$ BEGIN
  CREATE TYPE "ProductionStatus" AS ENUM ('DRAFT', 'RELEASED', 'IN_PROGRESS', 'POSTING', 'POSTED', 'CANCELLED', 'REVERSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BomStatus" AS ENUM ('active', 'inactive', 'superseded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "hideFromStore" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "conversionRules" JSONB;

DROP INDEX IF EXISTS "Order_shopifyOrderId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Order_storeCode_shopifyOrderId_key" ON "Order"("storeCode", "shopifyOrderId");

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "mnpCodAmount" DECIMAL(18,4) NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "mnpStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "notifications" JSONB;

ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "sourceKey" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "uom" TEXT NOT NULL DEFAULT '';
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "ref" TEXT NOT NULL DEFAULT '';
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "productionOrderId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "userName" TEXT NOT NULL DEFAULT '';

UPDATE "StockMovement" SET "sourceKey" = 'legacy:' || "id" WHERE "sourceKey" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "StockMovement_sourceKey_key" ON "StockMovement"("sourceKey");
ALTER TABLE "StockMovement" ALTER COLUMN "sourceKey" SET NOT NULL;

-- Placeholder manufacturing tables were unused. Recreate for posting-capable schema.
DROP TABLE IF EXISTS "BomLine";
DROP TABLE IF EXISTS "ProductionOrder";
DROP TABLE IF EXISTS "Bom";

CREATE TABLE "Bom" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "finishedSku" TEXT NOT NULL,
    "finishedProductId" TEXT,
    "outputQty" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "outputUom" TEXT NOT NULL DEFAULT 'pcs',
    "status" "BomStatus" NOT NULL DEFAULT 'active',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3),
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Bom_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Bom_code_revision_key" ON "Bom"("code", "revision");

CREATE TABLE "BomLine" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "componentSku" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'pcs',
    "lineRole" TEXT NOT NULL DEFAULT 'RAW',
    "expectedWastagePct" DECIMAL(9,4) NOT NULL DEFAULT 0,
    CONSTRAINT "BomLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "bomId" TEXT,
    "bomRevision" INTEGER NOT NULL DEFAULT 1,
    "finishedSku" TEXT NOT NULL,
    "finishedProductId" TEXT,
    "plannedOutputQty" DECIMAL(18,6) NOT NULL,
    "actualOutputQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "extraCosts" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "ProductionStatus" NOT NULL DEFAULT 'DRAFT',
    "postingToken" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT,
    "costMaterial" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "costPackaging" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "costWastage" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "costExtra" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "costTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "costPerUnit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "postedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "userName" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionOrder_number_key" ON "ProductionOrder"("number");
CREATE UNIQUE INDEX "ProductionOrder_idempotencyKey_key" ON "ProductionOrder"("idempotencyKey");
CREATE INDEX "ProductionOrder_status_idx" ON "ProductionOrder"("status");
CREATE INDEX "ProductionOrder_finishedSku_idx" ON "ProductionOrder"("finishedSku");

CREATE TABLE "ProductionComponent" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'RAW',
    "uom" TEXT NOT NULL DEFAULT 'pcs',
    "plannedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "consumedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "wastageQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    CONSTRAINT "ProductionComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionPostingLog" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionPostingLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Bom" ADD CONSTRAINT "Bom_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BomLine" ADD CONSTRAINT "BomLine_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionComponent" ADD CONSTRAINT "ProductionComponent_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionPostingLog" ADD CONSTRAINT "ProductionPostingLog_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "StockMovement_productionOrderId_idx" ON "StockMovement"("productionOrderId");
