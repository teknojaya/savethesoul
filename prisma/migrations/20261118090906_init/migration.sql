-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'CLINICIAN', 'ADMIN');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SAFETY');

-- CreateEnum
CREATE TYPE "AssessmentInstrument" AS ENUM ('WHO5');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('AI_PROCESSING', 'WELLBEING_MEMORY', 'SHARE_SUMMARY_WITH_CLINICIAN', 'TRUSTED_CONTACT_SHARING', 'AGGREGATE_ANALYTICS');

-- CreateEnum
CREATE TYPE "GranteeType" AS ENUM ('NONE', 'CLINICIAN', 'TRUSTED_CONTACT');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('ORDINARY_UPDATE', 'SAFETY_ALERT');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SIMULATED_SENT', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ResourceCategory" AS ENUM ('EMERGENCY', 'CRISIS_LINE', 'SELF_HELP', 'COMMUNITY', 'PRIMARY_CARE', 'MENTAL_HEALTH_CONSULTATION', 'TELE_MENTAL_HEALTH', 'PSYCHIATRIC_SPECIALIST');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED_OFFICIAL', 'VERIFIED_SECONDARY', 'NEEDS_VERIFICATION');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('REQUESTED', 'ACKNOWLEDGED', 'SCHEDULED', 'COMPLETED', 'DECLINED', 'CANCELLED', 'UNABLE_TO_CONTACT');

-- CreateEnum
CREATE TYPE "ReferralUrgency" AS ENUM ('ROUTINE', 'SOON', 'URGENT');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PLANNED', 'COMPLETED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SummaryStatus" AS ENUM ('SHARED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DraftReviewStatus" AS ENUM ('UNVERIFIED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "SafetyLevel" AS ENUM ('IMMEDIATE_DANGER', 'ELEVATED_CONCERN');

-- CreateEnum
CREATE TYPE "SafetySource" AS ENUM ('CHAT_INPUT', 'CHAT_OUTPUT', 'HELP_BUTTON', 'CHECK_IN');

-- CreateEnum
CREATE TYPE "SafetyWorkflowStatus" AS ENUM ('OPEN', 'SIMULATED_ALERT_SENT', 'SIMULATED_ACKNOWLEDGED', 'CLOSED', 'HANDOFF_FAILED');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('ALLOWED', 'DENIED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'PATIENT',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredName" TEXT NOT NULL,
    "ageBand" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "region" TEXT NOT NULL DEFAULT 'Abu Dhabi',
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "chatHistoryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "memoryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "physicalHealthEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicianProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicianProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareAssignment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "ephemeral" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "contentEnc" TEXT NOT NULL,
    "provider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellbeingMemory" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "contentEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellbeingMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellbeingCheckIn" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "mood" INTEGER NOT NULL,
    "stress" INTEGER,
    "sleepQuality" INTEGER,
    "functioning" INTEGER,
    "noteEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellbeingCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellbeingAssessment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "instrument" "AssessmentInstrument" NOT NULL DEFAULT 'WHO5',
    "answers" INTEGER[],
    "rawScore" INTEGER NOT NULL,
    "percentScore" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellbeingAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellbeingGoal" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellbeingGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "scope" "ConsentScope" NOT NULL,
    "granteeType" "GranteeType" NOT NULL DEFAULT 'NONE',
    "granteeId" TEXT,
    "categories" TEXT[],
    "policyVersion" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustedContact" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phoneEnc" TEXT,
    "emailEnc" TEXT,
    "canReceiveUpdates" BOOLEAN NOT NULL DEFAULT false,
    "canReceiveSafetyAlerts" BOOLEAN NOT NULL DEFAULT false,
    "sharedCategories" TEXT[],
    "isSafetyPlanContact" BOOLEAN NOT NULL DEFAULT false,
    "recipientVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TrustedContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactNotification" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "trustedContactId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "messageEnc" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "blockedReason" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportResource" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ResourceCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "hours" TEXT,
    "languages" TEXT,
    "eligibility" TEXT,
    "nextSteps" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'Abu Dhabi',
    "verificationStatus" "VerificationStatus" NOT NULL,
    "verificationNote" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "sourceUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "SupportResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareReferral" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT,
    "resourceId" TEXT,
    "urgency" "ReferralUrgency" NOT NULL DEFAULT 'ROUTINE',
    "status" "ReferralStatus" NOT NULL DEFAULT 'REQUESTED',
    "reasonEnc" TEXT,
    "isSimulated" BOOLEAN NOT NULL DEFAULT true,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstContactAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralEvent" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "fromStatus" "ReferralStatus",
    "toStatus" "ReferralStatus" NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT NOT NULL,
    "note" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "referralId" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PLANNED',
    "functioningChange" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalSummary" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "contentEnc" TEXT NOT NULL,
    "aiDraftEnc" TEXT,
    "aiDraftStatus" "DraftReviewStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "status" "SummaryStatus" NOT NULL DEFAULT 'SHARED',
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ClinicalSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicianNote" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "contentEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicianNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyEvent" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "conversationId" TEXT,
    "level" "SafetyLevel" NOT NULL,
    "source" "SafetySource" NOT NULL,
    "detector" TEXT NOT NULL,
    "categories" TEXT[],
    "workflowStatus" "SafetyWorkflowStatus" NOT NULL DEFAULT 'OPEN',
    "simulatedAlertAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyPlan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "contentEnc" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "subjectPatientId" TEXT,
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'ALLOWED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicianProfile_userId_key" ON "ClinicianProfile"("userId");

-- CreateIndex
CREATE INDEX "CareAssignment_clinicianId_status_idx" ON "CareAssignment"("clinicianId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CareAssignment_patientId_clinicianId_key" ON "CareAssignment"("patientId", "clinicianId");

-- CreateIndex
CREATE INDEX "Conversation_patientId_updatedAt_idx" ON "Conversation"("patientId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "WellbeingMemory_patientId_idx" ON "WellbeingMemory"("patientId");

-- CreateIndex
CREATE INDEX "WellbeingCheckIn_patientId_createdAt_idx" ON "WellbeingCheckIn"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "WellbeingAssessment_patientId_completedAt_idx" ON "WellbeingAssessment"("patientId", "completedAt");

-- CreateIndex
CREATE INDEX "WellbeingGoal_patientId_idx" ON "WellbeingGoal"("patientId");

-- CreateIndex
CREATE INDEX "ConsentRecord_patientId_scope_idx" ON "ConsentRecord"("patientId", "scope");

-- CreateIndex
CREATE INDEX "ConsentRecord_granteeType_granteeId_idx" ON "ConsentRecord"("granteeType", "granteeId");

-- CreateIndex
CREATE INDEX "TrustedContact_patientId_idx" ON "TrustedContact"("patientId");

-- CreateIndex
CREATE INDEX "ContactNotification_patientId_createdAt_idx" ON "ContactNotification"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportResource_slug_key" ON "SupportResource"("slug");

-- CreateIndex
CREATE INDEX "SupportResource_category_idx" ON "SupportResource"("category");

-- CreateIndex
CREATE INDEX "CareReferral_patientId_idx" ON "CareReferral"("patientId");

-- CreateIndex
CREATE INDEX "CareReferral_clinicianId_status_idx" ON "CareReferral"("clinicianId", "status");

-- CreateIndex
CREATE INDEX "ReferralEvent_referralId_createdAt_idx" ON "ReferralEvent"("referralId", "createdAt");

-- CreateIndex
CREATE INDEX "FollowUp_clinicianId_status_idx" ON "FollowUp"("clinicianId", "status");

-- CreateIndex
CREATE INDEX "FollowUp_patientId_idx" ON "FollowUp"("patientId");

-- CreateIndex
CREATE INDEX "ClinicalSummary_clinicianId_status_idx" ON "ClinicalSummary"("clinicianId", "status");

-- CreateIndex
CREATE INDEX "ClinicalSummary_patientId_idx" ON "ClinicalSummary"("patientId");

-- CreateIndex
CREATE INDEX "ClinicianNote_patientId_clinicianId_idx" ON "ClinicianNote"("patientId", "clinicianId");

-- CreateIndex
CREATE INDEX "SafetyEvent_patientId_createdAt_idx" ON "SafetyEvent"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "SafetyEvent_workflowStatus_idx" ON "SafetyEvent"("workflowStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyPlan_patientId_key" ON "SafetyPlan"("patientId");

-- CreateIndex
CREATE INDEX "AuditLog_subjectPatientId_createdAt_idx" ON "AuditLog"("subjectPatientId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "SystemEvent_kind_createdAt_idx" ON "SystemEvent"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicianProfile" ADD CONSTRAINT "ClinicianProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareAssignment" ADD CONSTRAINT "CareAssignment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareAssignment" ADD CONSTRAINT "CareAssignment_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "ClinicianProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellbeingMemory" ADD CONSTRAINT "WellbeingMemory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellbeingCheckIn" ADD CONSTRAINT "WellbeingCheckIn_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellbeingAssessment" ADD CONSTRAINT "WellbeingAssessment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellbeingGoal" ADD CONSTRAINT "WellbeingGoal_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustedContact" ADD CONSTRAINT "TrustedContact_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactNotification" ADD CONSTRAINT "ContactNotification_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactNotification" ADD CONSTRAINT "ContactNotification_trustedContactId_fkey" FOREIGN KEY ("trustedContactId") REFERENCES "TrustedContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareReferral" ADD CONSTRAINT "CareReferral_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareReferral" ADD CONSTRAINT "CareReferral_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "ClinicianProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareReferral" ADD CONSTRAINT "CareReferral_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "SupportResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEvent" ADD CONSTRAINT "ReferralEvent_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "CareReferral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "ClinicianProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "CareReferral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalSummary" ADD CONSTRAINT "ClinicalSummary_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalSummary" ADD CONSTRAINT "ClinicalSummary_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "ClinicianProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicianNote" ADD CONSTRAINT "ClinicianNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicianNote" ADD CONSTRAINT "ClinicianNote_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "ClinicianProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyEvent" ADD CONSTRAINT "SafetyEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyEvent" ADD CONSTRAINT "SafetyEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyPlan" ADD CONSTRAINT "SafetyPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
