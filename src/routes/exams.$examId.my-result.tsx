import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/app/Header";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/exams/$examId/my-result")({
  component: MyExamResult,
});

function MyExamResult() {
  const { examId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();

  const [exam, setExam] = useState<any>(null);
  const [attempt, setAttempt] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [reviews, setReviews] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoading(true);

      const { data: ex, error: examError } = await supabase
        .from("exams")
        .select("*")
        .eq("id", examId)
        .single();

      if (examError) {
        setError(examError.message);
        setLoading(false);
        return;
      }

      setExam(ex);

      const { data: at, error: attemptError } = await supabase
        .from("exam_attempts")
        .select("*")
        .eq("exam_id", examId)
        .eq("student_id", user.id)
        .neq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (attemptError) {
        setError(attemptError.message);
        setLoading(false);
        return;
      }

      if (!at) {
        setError("Вы ещё не завершили этот экзамен");
        setLoading(false);
        return;
      }

      setAttempt(at);

      const { data: qs, error: questionsError } = await supabase
        .from("questions")
        .select("*")
        .eq("exam_id", examId)
        .order("position", { ascending: true });

      if (questionsError) {
        setError(questionsError.message);
        setLoading(false);
        return;
      }

      setQuestions(qs || []);

      const { data: loadedReviews, error: reviewsError } = await supabase
        .from("answer_reviews")
        .select("*")
        .eq("attempt_id", at.id);

      if (reviewsError) {
        console.error("Reviews load error:", reviewsError);
      }

      const reviewsMap: Record<string, any> = {};

      for (const review of loadedReviews || []) {
        reviewsMap[review.question_id] = review;
      }

      setReviews(reviewsMap);
      setLoading(false);
    };

    void load();
  }, [examId, user]);

  const normalizeCorrect = (correct: any) => {
    if (Array.isArray(correct)) return correct;
    return [];
  };

  const isAnswerCorrect = (question: any, answers: Record<string, any>) => {
    const value = answers?.[question.id];
    const correct = normalizeCorrect(question.correct);

    if (question.type === "single") {
      return (
        value !== undefined &&
        value !== null &&
        Number(value) === Number(correct[0])
      );
    }

    if (question.type === "multiple") {
      const student = (Array.isArray(value) ? value : [])
        .map(Number)
        .sort((a, b) => a - b);

      const expected = correct.map(Number).sort((a, b) => a - b);

      return (
        student.length === expected.length &&
        student.every((item, index) => item === expected[index])
      );
    }

    if (question.type === "text") {
      const studentText = String(value ?? "").trim().toLowerCase();
      const expectedText = String(correct[0] ?? "").trim().toLowerCase();

      return Boolean(expectedText && studentText === expectedText);
    }

    return false;
  };

  const getAnswerLabel = (question: any, value: any) => {
    const options = Array.isArray(question.options) ? question.options : [];

    if (question.type === "single") {
      if (value === undefined || value === null || value === "") return "—";

      const index = Number(value);
      return options[index] ?? `Вариант ${index + 1}`;
    }

    if (question.type === "multiple") {
      const arr = Array.isArray(value) ? value : [];

      if (!arr.length) return "—";

      return arr
        .map((item) => {
          const index = Number(item);
          return options[index] ?? `Вариант ${index + 1}`;
        })
        .join(", ");
    }

    if (question.type === "text") {
      if (typeof value !== "string" || !value.trim()) return "—";
      return value;
    }

    return String(value ?? "—");
  };

  const getCorrectAnswerLabel = (question: any) => {
    const correct = normalizeCorrect(question.correct);
    const options = Array.isArray(question.options) ? question.options : [];

    if (question.type === "single") {
      const index = Number(correct[0]);
      return options[index] ?? `Вариант ${index + 1}`;
    }

    if (question.type === "multiple") {
      return correct
        .map((item: any) => {
          const index = Number(item);
          return options[index] ?? `Вариант ${index + 1}`;
        })
        .join(", ");
    }

    if (question.type === "text") {
      return String(correct[0] ?? "—");
    }

    return "—";
  };

  const getAutoScore = (question: any, answers: Record<string, any>) => {
    return isAnswerCorrect(question, answers) ? Number(question.points || 0) : 0;
  };

  const getQuestionScore = (question: any, answers: Record<string, any>) => {
    const review = reviews[question.id];

    if (
      review &&
      review.teacher_score !== null &&
      review.teacher_score !== undefined &&
      review.teacher_score !== ""
    ) {
      return Number(review.teacher_score || 0);
    }

    return getAutoScore(question, answers);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="p-12 text-center text-muted-foreground">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto max-w-xl px-4 py-12">
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <p className="mb-4 text-muted-foreground">{error}</p>

            <Button onClick={() => window.history.back()}>
              ← {t("common.back")}
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const answers = attempt?.answers || {};
  const score = attempt?.score ?? 0;
  const maxScore = attempt?.max_score ?? 0;
  const percent = maxScore ? Math.round((Number(score) / Number(maxScore)) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto max-w-5xl px-4 py-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => window.history.back()}
        >
          ← {t("common.back")}
        </Button>

        <div className="mb-8 rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground mb-1">
            Разбор экзамена
          </p>

          <h1 className="text-3xl font-bold text-gradient-mint mb-4">
            {exam?.title}
          </h1>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <p className="text-xs text-muted-foreground mb-1">
                Итоговый балл
              </p>

              <p className="text-2xl font-bold">
                {score} / {maxScore}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-background/60 p-4">
              <p className="text-xs text-muted-foreground mb-1">
                Процент
              </p>

              <p className="text-2xl font-bold">
                {percent}%
              </p>
            </div>

            <div className="rounded-xl border border-border bg-background/60 p-4">
              <p className="text-xs text-muted-foreground mb-1">
                Нарушений
              </p>

              <p className="text-2xl font-bold">
                {attempt?.violation_count ?? 0}
              </p>
            </div>
          </div>
        </div>

        <section className="space-y-4">
          {questions.map((question, index) => {
            const correct = isAnswerCorrect(question, answers);
            const studentAnswer = getAnswerLabel(question, answers?.[question.id]);
            const correctAnswer = getCorrectAnswerLabel(question);
            const review = reviews[question.id];
            const questionScore = getQuestionScore(question, answers);

            return (
              <div
                key={question.id}
                className={`rounded-2xl border p-5 ${
                  correct
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-red-500/50 bg-red-500/5"
                }`}
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">
                      Вопрос {index + 1}
                    </p>

                    <p className="font-medium whitespace-pre-wrap">
                      {question.text}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                      correct
                        ? "bg-emerald-500/15 text-emerald-600"
                        : "bg-red-500/15 text-red-600"
                    }`}
                  >
                    {correct ? "Правильно" : "Неправильно"}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-3 text-sm">
                  <div className="rounded-lg border border-border bg-background/70 p-3">
                    <p className="text-xs text-muted-foreground mb-1">
                      Ваш ответ
                    </p>

                    <p className="font-medium whitespace-pre-wrap">
                      {studentAnswer}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-background/70 p-3">
                    <p className="text-xs text-muted-foreground mb-1">
                      Правильный ответ
                    </p>

                    <p className="font-medium whitespace-pre-wrap">
                      {correctAnswer}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-background/70 p-3">
                    <p className="text-xs text-muted-foreground mb-1">
                      Балл за вопрос
                    </p>

                    <p className="font-mono font-semibold">
                      {questionScore} / {question.points}
                    </p>
                  </div>
                </div>

                {question.explanation && (
                  <div className="mt-3 rounded-lg border border-border bg-background/70 p-3 text-sm">
                    <p className="text-xs text-muted-foreground mb-1">
                      Объяснение
                    </p>

                    <p className="whitespace-pre-wrap">
                      {question.explanation}
                    </p>
                  </div>
                )}

                {review?.comment && (
                  <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                    <p className="text-xs text-muted-foreground mb-1">
                      Комментарий учителя
                    </p>

                    <p className="whitespace-pre-wrap">
                      {review.comment}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {questions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Вопросы не найдены.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}