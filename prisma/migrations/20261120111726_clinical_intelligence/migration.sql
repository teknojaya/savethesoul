-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConsentScope" ADD VALUE 'CLINICAL_INTELLIGENCE';
ALTER TYPE "ConsentScope" ADD VALUE 'CARE_PLAN_SUPPORT';

-- AlterTable
ALTER TABLE "WellbeingGoal" ADD COLUMN     "authorName" TEXT,
ADD COLUMN     "clinicianId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'PATIENT';

-- CreateTable
CREATE TABLE "ClinicalInsight" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "contentEnc" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "processingVersion" TEXT NOT NULL,
    "patientStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "removedItemIds" TEXT[],
    "patientNoteEnc" TEXT,
    "approvedAt" TIMESTAMP(3),
    "clinicianStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "clinicianNoteEnc" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalInsight_patientId_createdAt_idx" ON "ClinicalInsight"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalInsight_patientId_inputHash_key" ON "ClinicalInsight"("patientId", "inputHash");

-- AddForeignKey
ALTER TABLE "ClinicalInsight" ADD CONSTRAINT "ClinicalInsight_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
