-- CreateEnum
CREATE TYPE "FindingKind" AS ENUM ('DIAGNOSIS', 'CARE_PLAN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DraftReviewStatus" ADD VALUE 'APPROVED';
ALTER TYPE "DraftReviewStatus" ADD VALUE 'CORRECTED';
ALTER TYPE "DraftReviewStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "CareReferral" ADD COLUMN     "careType" TEXT;

-- AlterTable
ALTER TABLE "ClinicalSummary" ADD COLUMN     "correctedDraftEnc" TEXT,
ADD COLUMN     "reviewNoteEnc" TEXT;

-- CreateTable
CREATE TABLE "ClinicianFinding" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "kind" "FindingKind" NOT NULL,
    "contentEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicianFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicianFinding_patientId_clinicianId_idx" ON "ClinicianFinding"("patientId", "clinicianId");

-- AddForeignKey
ALTER TABLE "ClinicianFinding" ADD CONSTRAINT "ClinicianFinding_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicianFinding" ADD CONSTRAINT "ClinicianFinding_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "ClinicianProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
