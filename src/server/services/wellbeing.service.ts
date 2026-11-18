import { prisma } from "@/lib/db/prisma";
import { decryptOptional, encrypt, encryptOptional, decrypt } from "@/lib/crypto";
import { AppError, notFound } from "@/lib/errors";
import { describeWho5, scoreWho5 } from "@/features/assessments/who5";
import { computeWho5Trend, summariseCheckIns } from "@/features/assessments/trends";

export async function submitWho5(patientId: string, answers: (number | null)[]) {
  const result = scoreWho5(answers);
  if (!result.ok) {
    throw new AppError("VALIDATION", "Please answer all five questions", {
      missingItems: result.missingItems,
      invalidItems: result.invalidItems,
    });
  }
  const saved = await prisma.wellbeingAssessment.create({
    data: {
      patientId,
      instrument: "WHO5",
      answers: result.answers,
      rawScore: result.rawScore,
      percentScore: result.percentScore,
    },
  });
  const history = await listAssessments(patientId);
  return {
    assessment: saved,
    interpretation: describeWho5(result.percentScore),
    trend: computeWho5Trend(history),
  };
}

export function listAssessments(patientId: string) {
  return prisma.wellbeingAssessment.findMany({
    where: { patientId },
    orderBy: { completedAt: "asc" },
    select: { id: true, rawScore: true, percentScore: true, completedAt: true, answers: true },
  });
}

export async function addCheckIn(
  patientId: string,
  input: { mood: number; stress?: number | null; sleepQuality?: number | null; functioning?: number | null; note?: string | null },
) {
  return prisma.wellbeingCheckIn.create({
    data: {
      patientId,
      mood: input.mood,
      stress: input.stress ?? null,
      sleepQuality: input.sleepQuality ?? null,
      functioning: input.functioning ?? null,
      noteEnc: encryptOptional(input.note),
    },
    select: { id: true, createdAt: true },
  });
}

export async function listCheckIns(patientId: string, days = 60) {
  const rows = await prisma.wellbeingCheckIn.findMany({
    where: { patientId, createdAt: { gte: new Date(Date.now() - days * 86_400_000) } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    mood: r.mood,
    stress: r.stress,
    sleepQuality: r.sleepQuality,
    functioning: r.functioning,
    note: decryptOptional(r.noteEnc),
    createdAt: r.createdAt,
  }));
}

export async function getWellbeingOverview(patientId: string) {
  const [assessments, checkIns, goals] = await Promise.all([
    listAssessments(patientId),
    listCheckIns(patientId, 60),
    prisma.wellbeingGoal.findMany({ where: { patientId, status: { not: "ARCHIVED" } }, orderBy: { createdAt: "desc" } }),
  ]);
  const trend = computeWho5Trend(assessments);
  return {
    assessments,
    checkIns,
    goals,
    trend,
    latestInterpretation: trend.latest ? describeWho5(trend.latest.percentScore) : null,
    checkInSummary: summariseCheckIns(checkIns),
  };
}

// ───────────── Goals ─────────────

export function addGoal(patientId: string, title: string) {
  return prisma.wellbeingGoal.create({ data: { patientId, title } });
}

export async function updateGoal(patientId: string, goalId: string, status: "ACTIVE" | "ACHIEVED" | "ARCHIVED") {
  const res = await prisma.wellbeingGoal.updateMany({ where: { id: goalId, patientId }, data: { status } });
  if (!res.count) throw notFound("Goal not found");
}

// ───────────── Personal wellbeing memory (consent-controlled) ─────────────

export async function listMemories(patientId: string) {
  const rows = await prisma.wellbeingMemory.findMany({ where: { patientId }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({ id: r.id, content: decrypt(r.contentEnc), createdAt: r.createdAt }));
}

export async function addMemory(patientId: string, content: string) {
  const profile = await prisma.patientProfile.findUniqueOrThrow({ where: { id: patientId } });
  const consent = await prisma.consentRecord.findFirst({
    where: { patientId, scope: "WELLBEING_MEMORY", revokedAt: null },
  });
  if (!profile.memoryEnabled || !consent) {
    throw new AppError("CONSENT_REQUIRED", "Turn on personal wellbeing memory in Privacy settings first");
  }
  const count = await prisma.wellbeingMemory.count({ where: { patientId } });
  if (count >= 30) throw new AppError("CONFLICT", "You can save up to 30 memories. Remove one to add another.");
  return prisma.wellbeingMemory.create({ data: { patientId, contentEnc: encrypt(content) }, select: { id: true } });
}

export async function deleteMemory(patientId: string, memoryId: string) {
  const res = await prisma.wellbeingMemory.deleteMany({ where: { id: memoryId, patientId } });
  if (!res.count) throw notFound("Memory not found");
}
