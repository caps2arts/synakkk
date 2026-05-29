import type { Json } from "@/integrations/supabase/types";

export type AssessmentQuestionType = "single" | "multiple" | "text";

export interface AssessmentQuestionDraft {
  text: string;
  type: AssessmentQuestionType;
  options: string[];
  correct: number[];
  correctText: string;
  points: number;
}

export interface AssessmentQuestion extends AssessmentQuestionDraft {
  id: string;
}

export type AssessmentAnswers = Record<string, string | number | number[]>;

export type PresentationMode = "link" | "pdf" | "png-pages";

export interface StoredPresentationContent {
  schema: "presentation";
  version: 1;
  description: string;
  mode: PresentationMode;
  externalUrl?: string;
  pdfPath?: string;
  pagePaths?: string[];
}

export interface StoredExerciseContent {
  schema: "exercise";
  version: 1;
  description: string;
  questions: AssessmentQuestionDraft[];
}

export function createEmptyQuestion(): AssessmentQuestionDraft {
  return {
    text: "",
    type: "single",
    options: ["", ""],
    correct: [],
    correctText: "",
    points: 1,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeQuestionType(value: unknown): AssessmentQuestionType {
  if (value === "multiple" || value === "text") return value;
  return "single";
}

export function normalizeQuestions(questions: AssessmentQuestionDraft[]): AssessmentQuestionDraft[] {
  return questions.map((question) => {
    const type = normalizeQuestionType(question.type);
    const options = type === "text"
      ? []
      : question.options.map((option) => option.trim()).filter(Boolean);

    const correct = type === "multiple"
      ? Array.from(new Set(question.correct.filter((index) => index >= 0 && index < options.length))).sort((a, b) => a - b)
      : type === "single"
        ? question.correct.filter((index) => index >= 0 && index < options.length).slice(0, 1)
        : [];

    return {
      text: question.text.trim(),
      type,
      options,
      correct,
      correctText: type === "text" ? question.correctText.trim() : "",
      points: Math.max(1, Number(question.points) || 1),
    };
  });
}

export function validateQuestions(questions: AssessmentQuestionDraft[]): string | null {
  const normalized = normalizeQuestions(questions);

  for (const question of normalized) {
    if (!question.text) return "question_text_required";
    if (question.type === "text") {
      if (!question.correctText) return "question_correct_text_required";
      continue;
    }
    if (question.options.length < 2) return "question_options_required";
    if (question.type === "single" && question.correct.length !== 1) return "question_single_answer_required";
    if (question.type === "multiple" && question.correct.length === 0) return "question_multiple_answer_required";
  }

  return null;
}

export function serializeExerciseContent(description: string, questions: AssessmentQuestionDraft[]): string {
  const payload: StoredExerciseContent = {
    schema: "exercise",
    version: 1,
    description: description.trim(),
    questions: normalizeQuestions(questions),
  };

  return JSON.stringify(payload);
}

export function parseExerciseContent(rawContent: string | null): StoredExerciseContent {
  if (!rawContent) {
    return { schema: "exercise", version: 1, description: "", questions: [] };
  }

  try {
    const parsed = JSON.parse(rawContent) as unknown;
    if (isObject(parsed) && parsed.schema === "exercise") {
      const description = typeof parsed.description === "string" ? parsed.description : "";
      const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
      const questions = rawQuestions.map((item) => {
        const candidate = isObject(item) ? item : {};
        return {
          text: typeof candidate.text === "string" ? candidate.text : "",
          type: normalizeQuestionType(candidate.type),
          options: Array.isArray(candidate.options) ? candidate.options.filter((value): value is string => typeof value === "string") : [],
          correct: Array.isArray(candidate.correct) ? candidate.correct.map((value) => Number(value)).filter((value) => Number.isInteger(value)) : [],
          correctText: typeof candidate.correctText === "string" ? candidate.correctText : "",
          points: Math.max(1, Number(candidate.points) || 1),
        } satisfies AssessmentQuestionDraft;
      });

      return {
        schema: "exercise",
        version: 1,
        description,
        questions: normalizeQuestions(questions),
      };
    }
  } catch {
  }

  return {
    schema: "exercise",
    version: 1,
    description: rawContent,
    questions: [],
  };
}

export function serializePresentationContent(payload: Omit<StoredPresentationContent, "schema" | "version">): string {
  return JSON.stringify({
    schema: "presentation",
    version: 1,
    description: payload.description.trim(),
    mode: payload.mode,
    externalUrl: payload.externalUrl,
    pdfPath: payload.pdfPath,
    pagePaths: payload.pagePaths,
  } satisfies StoredPresentationContent);
}

export function parsePresentationContent(rawContent: string | null, legacyUrl?: string | null): StoredPresentationContent {
  if (rawContent) {
    try {
      const parsed = JSON.parse(rawContent) as unknown;
      if (isObject(parsed) && parsed.schema === "presentation") {
        return {
          schema: "presentation",
          version: 1,
          description: typeof parsed.description === "string" ? parsed.description : "",
          mode: parsed.mode === "pdf" || parsed.mode === "png-pages" ? parsed.mode : "link",
          externalUrl: typeof parsed.externalUrl === "string" ? parsed.externalUrl : undefined,
          pdfPath: typeof parsed.pdfPath === "string" ? parsed.pdfPath : undefined,
          pagePaths: Array.isArray(parsed.pagePaths) ? parsed.pagePaths.filter((value): value is string => typeof value === "string") : undefined,
        };
      }
    } catch {
    }
  }

  return {
    schema: "presentation",
    version: 1,
    description: rawContent ?? "",
    mode: "link",
    externalUrl: legacyUrl ?? undefined,
  };
}

export function extractPresentationAssetPaths(rawContent: string | null): string[] {
  const parsed = parsePresentationContent(rawContent);
  return [parsed.pdfPath, ...(parsed.pagePaths ?? [])].filter((value): value is string => Boolean(value));
}

export function scoreAssessment(questions: Array<AssessmentQuestion | AssessmentQuestionDraft>, answers: AssessmentAnswers) {
  const normalized = normalizeQuestions(questions);
  let score = 0;
  let max = 0;

  normalized.forEach((question, index) => {
    const questionId = "id" in questions[index] ? (questions[index] as AssessmentQuestion).id : String(index);
    const answer = answers[questionId];
    max += question.points;

    if (question.type === "single") {
      if (typeof answer === "number" && answer === question.correct[0]) score += question.points;
      return;
    }

    if (question.type === "multiple") {
      const current = Array.isArray(answer) ? answer.map((value) => Number(value)).sort((a, b) => a - b) : [];
      if (current.length === question.correct.length && current.every((value, currentIndex) => value === question.correct[currentIndex])) {
        score += question.points;
      }
      return;
    }

    if (typeof answer === "string" && answer.trim().toLowerCase() === question.correctText.trim().toLowerCase()) {
      score += question.points;
    }
  });

  return { score, max };
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function orderQuestionsForAttempt<T extends { id: string }>(questions: T[], shouldShuffle: boolean, attemptId: string) {
  if (!shouldShuffle) return questions;
  return [...questions].sort((left, right) => {
    const leftHash = hashString(`${attemptId}:${left.id}`);
    const rightHash = hashString(`${attemptId}:${right.id}`);
    return leftHash - rightHash;
  });
}

export function parseStoredAnswers(value: Json): AssessmentAnswers {
  return isObject(value) ? (value as AssessmentAnswers) : {};
}
