-- CreateEnum
CREATE TYPE "EmergencyStatus" AS ENUM ('DETECTED', 'REVIEW_REQUESTED', 'ACKNOWLEDGED', 'CONTACT_ATTEMPTED', 'ASSISTANCE_ARRANGED', 'RESOLVED', 'FAILED', 'CANCELLED', 'UNABLE_TO_CONTACT');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'HOSPITAL_COORDINATOR';

-- CreateTable
CREATE TABLE "HospitalProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyCase" (
    "id" TEXT NOT NULL,
    "caseRef" TEXT NOT NULL,
    "patientId" TEXT,
    "safetyEventId" TEXT,
    "hospitalOrg" TEXT NOT NULL,
    "status" "EmergencyStatus" NOT NULL DEFAULT 'DETECTED',
    "concernType" TEXT NOT NULL,
    "contextEnc" TEXT NOT NULL,
    "locationEnc" TEXT,
    "authorizationStatus" TEXT NOT NULL,
    "assignedResponder" TEXT,
    "isSimulated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyCaseEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TRANSITION',
    "fromStatus" "EmergencyStatus",
    "toStatus" "EmergencyStatus",
    "actorUserId" TEXT,
    "actorRole" TEXT NOT NULL,
    "noteEnc" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyCaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HospitalProfile_userId_key" ON "HospitalProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyCase_caseRef_key" ON "EmergencyCase"("caseRef");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyCase_safetyEventId_key" ON "EmergencyCase"("safetyEventId");

-- CreateIndex
CREATE INDEX "EmergencyCase_hospitalOrg_status_idx" ON "EmergencyCase"("hospitalOrg", "status");

-- CreateIndex
CREATE INDEX "EmergencyCaseEvent_caseId_createdAt_idx" ON "EmergencyCaseEvent"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "HospitalProfile" ADD CONSTRAINT "HospitalProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyCase" ADD CONSTRAINT "EmergencyCase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyCase" ADD CONSTRAINT "EmergencyCase_safetyEventId_fkey" FOREIGN KEY ("safetyEventId") REFERENCES "SafetyEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyCaseEvent" ADD CONSTRAINT "EmergencyCaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "EmergencyCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
