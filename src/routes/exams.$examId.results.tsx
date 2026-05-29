import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/app/Header";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/exams/$examId/results")({
  component: Results,
});

function Results() {
  const { examId } = Route.useParams();
  const { t } = useI18n();
  const { user } = useAuth();

  const [attempts, setAttempts] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [exam, setExam] = useState<any>(null);

  const [reviews, setReviews] = useState<Record<string, any>>({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [reviewScoreDrafts, setReviewScoreDrafts] = useState<Record<string, string>>({});

  const reviewKey = (attemptId: string, questionId: string) =>
    `${attemptId}:${questionId}`;

  useEffect(() => {
    const load = async () => {
      const { data: ex, error: examError } = await supabase
        .from("exams")
        .select("*")
        .eq("id", examId)
        .single();

      if (examError) {
        console.error("Exam load error:", examError);
        return;
      }

      setExam(ex);

      const { data: qs, error: questionsError } = await supabase
        .from("questions")
        .select("*")
        .eq("exam_id", examId)
        .order("position", { ascending: true });

      if (questionsError) {
        console.error("Questions load error:", questionsError);
        setQuestions([]);
      } else {
        setQuestions(qs || []);
      }

      const { data: at, error: attemptsError } = await supabase
        .from("exam_attempts")
        .select("*")
        .eq("exam_id", examId)
        .order("started_at", { ascending: false });

      if (attemptsError) {
        console.error("Attempts load error:", attemptsError);
        setAttempts([]);
        return;
      }

      const attemptsList = at || [];

      const studentIds = [
        ...new Set(attemptsList.map((a) => a.student_id).filter(Boolean)),
      ];

      let profilesMap: Record<string, any> = {};

      if (studentIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", studentIds);

        if (profilesError) {
          console.error("Profiles load error:", profilesError);
        }

        profilesMap = Object.fromEntries(
          (profiles || []).map((p) => [p.id, p]),
        );
      }

      const attemptsWithProfiles = attemptsList.map((a) => ({
        ...a,
        profile: profilesMap[a.student_id],
      }));

      setAttempts(attemptsWithProfiles);

      const attemptIds = attemptsWithProfiles.map((a) => a.id);

      if (attemptIds.length > 0) {
        const { data: loadedReviews, error: reviewsError } = await supabase
          .from("answer_reviews")
          .select("*")
          .in("attempt_id", attemptIds);

        if (reviewsError) {
          console.error("Reviews load error:", reviewsError);
        } else {
          const reviewsMap: Record<string, any> = {};
          const draftsMap: Record<string, string> = {};
          const scoreDraftsMap: Record<string, string> = {};

          for (const review of loadedReviews || []) {
            const key = reviewKey(review.attempt_id, review.question_id);

            reviewsMap[key] = review;
            draftsMap[key] = review.comment || "";
            scoreDraftsMap[key] =
              review.teacher_score === null || review.teacher_score === undefined
                ? ""
                : String(review.teacher_score);
          }

          setReviews(reviewsMap);
          setReviewDrafts(draftsMap);
          setReviewScoreDrafts(scoreDraftsMap);
        }
      }

      const { data: v, error: violationsError } = await supabase
        .from("violations")
        .select("*")
        .eq("exam_id", examId)
        .order("created_at", { ascending: false });

      if (violationsError) {
        console.error("Violations load error:", violationsError);
        setViolations([]);
        return;
      }

      setViolations(v || []);
    };

    void load();
  }, [examId]);

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

  const getAutoScore = (question: any, answers: Record<string, any>) => {
    return isAnswerCorrect(question, answers) ? Number(question.points || 0) : 0;
  };

  const getQuestionScore = (
    question: any,
    attempt: any,
    reviewsSource: Record<string, any> = reviews,
  ) => {
    const key = reviewKey(attempt.id, question.id);
    const review = reviewsSource[key];

    if (
      review &&
      review.teacher_score !== null &&
      review.teacher_score !== undefined &&
      review.teacher_score !== ""
    ) {
      return Number(review.teacher_score || 0);
    }

    return getAutoScore(question, attempt.answers || {});
  };

  const calculateAttemptScore = (
    attempt: any,
    reviewsSource: Record<string, any> = reviews,
  ) => {
    return questions.reduce((sum, question) => {
      return sum + getQuestionScore(question, attempt, reviewsSource);
    }, 0);
  };

  const saveReview = async (attempt: any, question: any) => {
    if (!user) {
      toast.error("Нет пользователя");
      return;
    }

    const key = reviewKey(attempt.id, question.id);
    const comment = reviewDrafts[key] || "";
    const rawScore = reviewScoreDrafts[key];

    let teacherScore: number | null = null;

    if (rawScore !== undefined && rawScore !== "") {
      teacherScore = Number(rawScore);

      if (Number.isNaN(teacherScore)) {
        toast.error("Введите корректный балл");
        return;
      }

      if (teacherScore < 0) {
        toast.error("Балл не может быть меньше 0");
        return;
      }

      if (teacherScore > Number(question.points || 0)) {
        toast.error(`Максимум за вопрос: ${question.points}`);
        return;
      }
    }

    const { data, error } = await supabase
      .from("answer_reviews")
      .upsert(
        {
          attempt_id: attempt.id,
          question_id: question.id,
          teacher_id: user.id,
          comment,
          teacher_score: teacherScore,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "attempt_id,question_id",
        },
      )
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      return;
    }

    const nextReviews = {
      ...reviews,
      [key]: data,
    };

    const nextScore = calculateAttemptScore(attempt, nextReviews);

    const { error: updateAttemptError } = await supabase
      .from("exam_attempts")
      .update({
        score: nextScore,
      })
      .eq("id", attempt.id);

    if (updateAttemptError) {
      toast.error(updateAttemptError.message);
      return;
    }

    setReviews(nextReviews);

    setAttempts((current) =>
      current.map((item) =>
        item.id === attempt.id
          ? {
              ...item,
              score: nextScore,
            }
          : item,
      ),
    );

    toast.success("Оценка и комментарий сохранены");
  };

  const getStatusLabel = (status: string) => {
    if (status === "completed") return t("exam.status.completed");
    if (status === "terminated") return t("exam.status.terminated");
    if (status === "in_progress") return t("exam.status.inProgress");
    return status;
  };

  const getViolationLabel = (v: any) => {
    if (v.type === "visibility_hidden") {
      return "Ученик сменил вкладку / скрыл страницу";
    }

    if (v.type === "window_blur") {
      return "Ученик вышел из окна экзамена";
    }

    if (v.type === "shortcut") {
      return `Ученик нажал запрещённую комбинацию клавиш: ${
        v.meta?.key || "unknown"
      }`;
    }

    if (v.type === "devtools") {
      return "Ученик попытался открыть DevTools";
    }

    if (v.type === "tab_switch") {
      return "Ученик переключил вкладку";
    }

    if (v.type === "inactivity") {
      return "Ученик был неактивен";
    }

    if (v.type === "page_close") {
      return "Ученик попытался закрыть страницу";
    }

    return v.type;
  };

  const getStudentName = (attempt: any) => {
    return (
      attempt.profile?.full_name ||
      attempt.profile?.username ||
      attempt.student_id?.slice(0, 8) ||
      "—"
    );
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

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => window.history.back()}
        >
          ← {t("common.back")}
        </Button>

        <h1 className="text-2xl font-bold text-gradient-mint mb-1">
          {exam?.title}
        </h1>

        <p className="text-muted-foreground mb-6">{t("results.title")}</p>

        <div className="bg-card border border-border rounded-xl overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3">{t("results.student")}</th>
                <th className="text-left p-3">{t("results.score")}</th>
                <th className="text-left p-3">{t("results.violations")}</th>
                <th className="text-left p-3">{t("results.status")}</th>
              </tr>
            </thead>

            <tbody>
              {attempts.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="p-3">{getStudentName(a)}</td>

                  <td className="p-3 font-mono">
                    {a.score ?? "–"} / {a.max_score ?? "–"}
                  </td>

                  <td className="p-3">{a.violation_count ?? 0}</td>

                  <td className="p-3">
                    <span
                      className={
                        a.status === "terminated"
                          ? "text-destructive"
                          : a.status === "completed"
                            ? "text-primary"
                            : ""
                      }
                    >
                      {getStatusLabel(a.status)}
                    </span>
                  </td>
                </tr>
              ))}

              {attempts.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="p-6 text-center text-muted-foreground"
                  >
                    —
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <section className="space-y-6 mb-10">
          <h2 className="text-xl font-semibold">
            Подробные ответы учеников
          </h2>

          {attempts.map((attempt) => {
            const answers = attempt.answers || {};

            return (
              <div
                key={attempt.id}
                className="rounded-2xl border border-border bg-card p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {getStudentName(attempt)}
                    </h3>

                    <p className="text-sm text-muted-foreground">
                      Балл: {attempt.score ?? "–"} / {attempt.max_score ?? "–"} ·{" "}
                      Нарушений: {attempt.violation_count ?? 0} ·{" "}
                      Статус: {getStatusLabel(attempt.status)}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {questions.map((question, index) => {
                    const correct = isAnswerCorrect(question, answers);
                    const studentAnswer = getAnswerLabel(
                      question,
                      answers?.[question.id],
                    );
                    const correctAnswer = getCorrectAnswerLabel(question);
                    const key = reviewKey(attempt.id, question.id);
                    const review = reviews[key];
                    const effectiveScore = getQuestionScore(question, attempt);

                    return (
                      <div
                        key={question.id}
                        className={`rounded-xl border p-4 ${
                          correct
                            ? "border-emerald-500/50 bg-emerald-500/5"
                            : "border-red-500/50 bg-red-500/5"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4 mb-3">
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
                          <div className="rounded-lg border border-border bg-background/60 p-3">
                            <p className="text-xs text-muted-foreground mb-1">
                              Ответ ученика
                            </p>
                            <p className="font-medium whitespace-pre-wrap">
                              {studentAnswer}
                            </p>
                          </div>

                          <div className="rounded-lg border border-border bg-background/60 p-3">
                            <p className="text-xs text-muted-foreground mb-1">
                              Правильный ответ
                            </p>
                            <p className="font-medium whitespace-pre-wrap">
                              {correctAnswer}
                            </p>
                          </div>

                          <div className="rounded-lg border border-border bg-background/60 p-3">
                            <p className="text-xs text-muted-foreground mb-1">
                              Балл за вопрос
                            </p>
                            <p className="font-mono font-semibold">
                              {effectiveScore} / {question.points}
                            </p>
                          </div>
                        </div>

                        {question.explanation && (
                          <div className="mt-3 rounded-lg border border-border bg-background/60 p-3 text-sm">
                            <p className="text-xs text-muted-foreground mb-1">
                              Объяснение вопроса
                            </p>
                            <p className="whitespace-pre-wrap">
                              {question.explanation}
                            </p>
                          </div>
                        )}

                        <div className="mt-3 rounded-lg border border-border bg-background/70 p-3 space-y-3">
                          <div>
                            <p className="text-xs text-muted-foreground mb-2">
                              Оценка учителя
                            </p>

                            <Input
                              type="number"
                              min={0}
                              max={question.points}
                              step="0.5"
                              value={reviewScoreDrafts[key] ?? ""}
                              onChange={(e) =>
                                setReviewScoreDrafts((current) => ({
                                  ...current,
                                  [key]: e.target.value,
                                }))
                              }
                              placeholder={`Авто: ${getAutoScore(
                                question,
                                answers,
                              )} / ${question.points}`}
                              className="max-w-xs"
                            />
                          </div>

                          <div>
                            <p className="text-xs text-muted-foreground mb-2">
                              Комментарий учителя
                            </p>

                            <Textarea
                              value={reviewDrafts[key] ?? ""}
                              onChange={(e) =>
                                setReviewDrafts((current) => ({
                                  ...current,
                                  [key]: e.target.value,
                                }))
                              }
                              placeholder="Например: перепутал формулу, не дописал объяснение, ответ неполный..."
                              className="min-h-20"
                            />
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground">
                              {review?.updated_at
                                ? `Сохранено: ${new Date(
                                    review.updated_at,
                                  ).toLocaleString()}`
                                : "Комментарий ещё не сохранён"}
                            </p>

                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                void saveReview(attempt, question)
                              }
                            >
                              Сохранить оценку
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {questions.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Вопросы не найдены.
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {attempts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ответов учеников пока нет.
            </p>
          )}
        </section>

        <h2 className="text-lg font-semibold mb-3">
          {t("exam.violations")} ({violations.length})
        </h2>

        <div className="space-y-2">
          {violations.map((v) => (
            <div
              key={v.id}
              className="bg-card border border-border rounded-lg p-3 text-sm flex justify-between gap-4"
            >
              <span className="text-destructive">{getViolationLabel(v)}</span>

              <span className="text-muted-foreground whitespace-nowrap">
                {v.created_at
                  ? new Date(v.created_at).toLocaleString()
                  : "—"}
              </span>
            </div>
          ))}

          {violations.length === 0 && (
            <p className="text-sm text-muted-foreground">Нарушений нет</p>
          )}
        </div>
      </main>
    </div>
  );
}