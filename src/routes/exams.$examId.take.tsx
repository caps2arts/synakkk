import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle, Clock, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/exams/$examId/take")({ component: TakeExam });

type Q = {
  id: string;
  text: string;
  type: "single" | "multiple" | "text";
  options: string[];
  correct: unknown;
  points: number;
};

function TakeExam() {
  const { examId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();

  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [violations, setViolations] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [finished, setFinished] = useState<{ score: number; max: number; reason?: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const attemptRef = useRef<string | null>(null);
  const examRef = useRef<any>(null);
  const violationsRef = useRef(0);
  const initRef = useRef(false);
  const isFinishingRef = useRef(false);
  const answersRef = useRef<Record<string, any>>({});

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    if (!user || initRef.current) return;
    initRef.current = true;

    (async () => {
      const { data: ex, error: exErr } = await supabase
        .from("exams")
        .select("*")
        .eq("id", examId)
        .maybeSingle();

      if (exErr || !ex) {
        setLoadError(exErr?.message || "Экзамен не найден или нет доступа");
        return;
      }

      examRef.current = ex;
      setExam(ex);

      const { data: qs, error: qErr } = await supabase
        .from("questions")
        .select("*")
        .eq("exam_id", examId)
        .order("position");

      if (qErr) {
        setLoadError(qErr.message);
        return;
      }

      let arr = ((qs ?? []) as unknown as Q[]).map((q) => ({
        ...q,
        options: Array.isArray(q.options) ? (q.options as string[]) : [],
      }));

      if (!arr.length) {
        setLoadError("В этом экзамене ещё нет вопросов");
        return;
      }

      if (ex.shuffle_questions) {
        arr = [...arr].sort(() => Math.random() - 0.5);
      }

      setQuestions(arr);

      const maxScore = arr.reduce((s, q) => s + (q.points || 0), 0);

      const { data: existing } = await supabase
        .from("exam_attempts")
        .select("*")
        .eq("exam_id", examId)
        .eq("student_id", user.id)
        .order("started_at", { ascending: false });

      const inProgress = (existing ?? []).find((a: any) => a.status === "in_progress");
      const completedCount = (existing ?? []).filter((a: any) => a.status !== "in_progress").length;

      if (inProgress) {
        attemptRef.current = inProgress.id;
        setAttemptId(inProgress.id);

        if (inProgress.answers && typeof inProgress.answers === "object") {
          setAnswers(inProgress.answers as any);
        }

        violationsRef.current = inProgress.violation_count || 0;
        setViolations(inProgress.violation_count || 0);

        const elapsed = Math.floor((Date.now() - new Date(inProgress.started_at).getTime()) / 1000);
        setTimeLeft(Math.max(0, ex.duration_minutes * 60 - elapsed));
        return;
      }

      if (completedCount >= ex.max_attempts) {
        setLoadError(t("exam.attemptLimit"));
        return;
      }

      const { data: at, error } = await supabase
        .from("exam_attempts")
        .insert({ exam_id: examId, student_id: user.id, max_score: maxScore })
        .select()
        .single();

      if (error || !at) {
        setLoadError(error?.message || "Не удалось создать попытку");
        return;
      }

      attemptRef.current = at.id;
      setAttemptId(at.id);
      setTimeLeft(ex.duration_minutes * 60);
    })();
  }, [user, examId, t]);

  useEffect(() => {
    if (!attemptId || finished) return;

    const tick = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          void finishExam("timeout");
          return 0;
        }

        return s - 1;
      });
    }, 1000);

    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, finished]);

  useEffect(() => {
    if (!attemptId || finished) return;

    const id = setInterval(() => {
      supabase
        .from("exam_attempts")
        .update({ answers: answersRef.current })
        .eq("id", attemptId);
    }, 5000);

    return () => clearInterval(id);
  }, [attemptId, finished]);

  useEffect(() => {
    if (!attemptId || finished) return;

    const log = async (type: string, meta: any = {}) => {
      if (isFinishingRef.current) return;

      const next = violationsRef.current + 1;
      violationsRef.current = next;
      setViolations(next);

      toast.warning(t("exam.warning"));

      const { error: violationError } = await supabase.from("violations").insert({
        attempt_id: attemptRef.current!,
        student_id: user!.id,
        exam_id: examId,
        type: type as any,
        meta,
      });

      if (violationError) {
        console.error("Violation insert error:", violationError);
      }

      await supabase
        .from("exam_attempts")
        .update({ violation_count: next })
        .eq("id", attemptRef.current!);

      if (examRef.current && next >= examRef.current.max_violations) {
        void finishExam("violations");
      }
    };

    let lastViolationTime = 0;

    const registerViolation = async (type: string, meta: any = {}) => {
      const now = Date.now();

      if (now - lastViolationTime < 1500) return;

      lastViolationTime = now;
      await log(type, meta);
    };

    const onVis = () => {
      if (document.hidden) {
        void registerViolation("visibility_hidden");
      }
    };

    const onBlur = () => {
      if (!document.hidden) {
        void registerViolation("window_blur");
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && ["c", "v", "u", "p", "s"].includes(k)) {
        e.preventDefault();
        void registerViolation("shortcut", { key: k });
      }

      if (k === "f12") {
        e.preventDefault();
        void registerViolation("devtools");
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(k)) {
        e.preventDefault();
        void registerViolation("devtools");
      }
    };

    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("keydown", onKey);
    document.addEventListener("contextmenu", onCtx);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("contextmenu", onCtx);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, finished]);

  const maxScore = useMemo(
    () => questions.reduce((s, q) => s + (q.points || 0), 0),
    [questions],
  );

  const currentQuestion = questions[currentIndex];

  const isAnswered = (q: Q) => {
    const value = answers[q.id];

    if (q.type === "multiple") {
      return Array.isArray(value) && value.length > 0;
    }

    if (q.type === "text") {
      return typeof value === "string" && value.trim().length > 0;
    }

    return value !== undefined && value !== null && value !== "";
  };

  const finishExam = async (reason?: string) => {
    if (!attemptRef.current || isFinishingRef.current) return;

    isFinishingRef.current = true;

    let score = 0;
    let max = 0;
    const current = answersRef.current;

    for (const q of questions) {
      max += q.points || 0;

      const a = current[q.id];
      const correct = Array.isArray(q.correct) ? q.correct : [];

      if (q.type === "single") {
        if (a !== undefined && a !== null && Number(a) === Number(correct[0])) {
          score += q.points;
        }
      } else if (q.type === "multiple") {
        const aa = (Array.isArray(a) ? a : []).map(Number).sort((x, y) => x - y);
        const cc = (correct as any[]).map(Number).sort((x, y) => x - y);

        if (aa.length === cc.length && aa.every((x, i) => x === cc[i])) {
          score += q.points;
        }
      } else if (q.type === "text") {
        const expected = String(correct[0] ?? "").trim().toLowerCase();

        if (expected && typeof a === "string" && a.trim().toLowerCase() === expected) {
          score += q.points;
        }
      }
    }

    await supabase
      .from("exam_attempts")
      .update({
        finished_at: new Date().toISOString(),
        answers: current,
        score,
        max_score: max,
        status: reason === "violations" ? "terminated" : "completed",
      })
      .eq("id", attemptRef.current);

    setFinished({ score, max, reason });
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center">
          <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="mb-4">{loadError}</p>
          <Button onClick={() => nav({ to: "/dashboard" })}>
            {t("common.back")}
          </Button>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center">
          {finished.reason === "violations" && (
            <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
          )}

          <h1 className="text-2xl font-bold mb-2">
            {t("exam.score")}
          </h1>

          <p className="text-4xl font-bold text-gradient-mint mb-4">
            {finished.score} / {finished.max}
          </p>

          {finished.reason === "violations" && (
            <p className="text-sm text-destructive mb-4">
              {t("exam.terminated")}
            </p>
          )}

          <Button
            onClick={() => nav({ to: "/dashboard" })}
            className="gradient-mint text-primary-foreground"
          >
            {t("common.back")}
          </Button>
        </div>
      </div>
    );
  }

  if (authLoading || !user) {
    return <div className="p-12 text-center">{t("common.loading")}</div>;
  }

  if (!exam || !attemptId || !currentQuestion) {
    return <div className="p-12 text-center">{t("common.loading")}</div>;
  }

  const mm = Math.floor(timeLeft / 60);
  const ss = timeLeft % 60;
  const answeredCount = questions.filter(isAnswered).length;
  const progress = Math.round((answeredCount / questions.length) * 100);

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-semibold truncate">
              {exam.title}
            </h1>
            <p className="text-xs text-muted-foreground">
              Вопрос {currentIndex + 1} из {questions.length}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-1 font-mono ${timeLeft < 60 ? "text-destructive" : ""}`}>
              <Clock className="w-4 h-4" />
              {mm}:{String(ss).padStart(2, "0")}
            </div>

            <div className={`flex items-center gap-1 text-sm ${violations > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              <AlertTriangle className="w-4 h-4" />
              {violations}/{exam.max_violations}
            </div>

            <Button
              size="sm"
              variant="destructive"
              onClick={() => void finishExam()}
            >
              {t("exam.finish")}
            </Button>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">
              Прогресс: {answeredCount}/{questions.length}
            </span>
            <span className="font-medium">{progress}%</span>
          </div>

          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full gradient-mint transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <section className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <span className="text-sm font-semibold text-primary">
              #{currentIndex + 1}
            </span>

            <span className="text-xs text-muted-foreground">
              {currentQuestion.points} б.
            </span>
          </div>

          <p className="text-xl font-semibold leading-relaxed whitespace-pre-wrap mb-8">
            {currentQuestion.text}
          </p>

          {currentQuestion.type === "single" && (
            <div className="space-y-3">
              {currentQuestion.options.map((opt, oi) => (
                <button
                  key={oi}
                  type="button"
                  onClick={() =>
                    setAnswers({
                      ...answers,
                      [currentQuestion.id]: oi,
                    })
                  }
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    Number(answers[currentQuestion.id]) === oi
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-accent/40"
                  }`}
                >
                  <span className="font-medium mr-2">
                    {oi + 1}.
                  </span>
                  {opt}
                </button>
              ))}
            </div>
          )}

          {currentQuestion.type === "multiple" && (
            <div className="space-y-3">
              {currentQuestion.options.map((opt, oi) => {
                const arr = (Array.isArray(answers[currentQuestion.id])
                  ? answers[currentQuestion.id]
                  : []) as number[];

                const checked = arr.includes(oi);

                return (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => {
                      const next = checked
                        ? arr.filter((x) => x !== oi)
                        : [...arr, oi];

                      setAnswers({
                        ...answers,
                        [currentQuestion.id]: next,
                      });
                    }}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      checked
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent/40"
                    }`}
                  >
                    <span className="font-medium mr-2">
                      {oi + 1}.
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {currentQuestion.type === "text" && (
            <textarea
              className="w-full min-h-40 p-4 rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
              value={answers[currentQuestion.id] || ""}
              onChange={(e) =>
                setAnswers({
                  ...answers,
                  [currentQuestion.id]: e.target.value,
                })
              }
              maxLength={5000}
              placeholder="Введите ответ..."
            />
          )}

          <div className="flex items-center justify-between mt-8">
            <Button
              type="button"
              variant="outline"
              disabled={currentIndex === 0}
              onClick={() =>
                setCurrentIndex((i) => Math.max(0, i - 1))
              }
            >
              Назад
            </Button>

            {currentIndex === questions.length - 1 ? (
              <Button
                type="button"
                className="gradient-mint text-primary-foreground"
                onClick={() => void finishExam()}
              >
                Завершить
              </Button>
            ) : (
              <Button
                type="button"
                className="gradient-mint text-primary-foreground"
                onClick={() =>
                  setCurrentIndex((i) =>
                    Math.min(questions.length - 1, i + 1),
                  )
                }
              >
                Дальше
              </Button>
            )}
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-40 group">
        <div className="mx-auto w-fit rounded-t-xl border border-border border-b-0 bg-card px-5 py-2 text-xs text-muted-foreground shadow-lg">
          ▲ Вопросы
        </div>

        <div className="max-h-0 overflow-hidden border-t border-border bg-background/95 backdrop-blur transition-all duration-300 group-hover:max-h-64">
          <div className="container mx-auto max-w-4xl px-4 py-4">
            <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-2">
              {questions.map((q, index) => {
                const answered = isAnswered(q);
                const active = index === currentIndex;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={`h-10 rounded-lg border text-sm font-medium transition-all ${
                      active
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border"
                    } ${
                      answered
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span>Серый — не отвечен</span>
              <span>Зелёный — отвечен</span>
              <span>Рамка — текущий вопрос</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
