-- Phase 2B domain tables. Does not change JSON source of truth.

CREATE TABLE "MerchantProfile" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL DEFAULT '',
    "wordmark" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "ntn" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MerchantProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentSequence" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentSequence_prefix_year_key" ON "DocumentSequence"("prefix", "year");

CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "issueDate" TEXT NOT NULL DEFAULT '',
    "dueDate" TEXT NOT NULL DEFAULT '',
    "orderId" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT NOT NULL DEFAULT '',
    "sourceId" TEXT NOT NULL DEFAULT '',
    "originalDocumentId" TEXT NOT NULL DEFAULT '',
    "originalDocumentNo" TEXT NOT NULL DEFAULT '',
    "customerName" TEXT NOT NULL DEFAULT '',
    "supplierName" TEXT NOT NULL DEFAULT '',
    "store" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Document_number_key" ON "Document"("number");

CREATE TABLE "DocumentLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "qty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    CONSTRAINT "DocumentLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentEvent" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL DEFAULT '',
    "toStatus" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "at" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "DocumentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "CashAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CashAccount_code_key" ON "CashAccount"("code");

CREATE TABLE "CashbookEntry" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "accountId" TEXT,
    "category" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(18,4) NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "CashbookEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourierSettings" (
    "id" TEXT NOT NULL,
    "returnOverdueDays" INTEGER NOT NULL DEFAULT 7,
    "staleTrackingDays" INTEGER NOT NULL DEFAULT 5,
    "settlementOverdueDays" INTEGER NOT NULL DEFAULT 14,
    "payload" JSONB,
    CONSTRAINT "CourierSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourierEvent" (
    "sourceKey" TEXT NOT NULL,
    "orderId" TEXT NOT NULL DEFAULT '',
    "tracking" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "at" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "payload" JSONB,
    CONSTRAINT "CourierEvent_pkey" PRIMARY KEY ("sourceKey")
);

CREATE TABLE "CourierReceipt" (
    "sourceKey" TEXT NOT NULL,
    "orderId" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    CONSTRAINT "CourierReceipt_pkey" PRIMARY KEY ("sourceKey")
);

CREATE TABLE "AdSpendDay" (
    "date" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    CONSTRAINT "AdSpendDay_pkey" PRIMARY KEY ("date")
);

CREATE TABLE "JsonSnapshot" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    CONSTRAINT "JsonSnapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DocumentLine" ADD CONSTRAINT "DocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentEvent" ADD CONSTRAINT "DocumentEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashbookEntry" ADD CONSTRAINT "CashbookEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CashAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
