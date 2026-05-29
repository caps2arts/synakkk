import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Header } from "@/components/app/Header";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, X, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/courses/$courseId/exams/new")({
  component: NewCourseExam,
});

interface Q {
  text: string;
  type: "single" | "multiple" | "text";
  options: string[];
  correct: number[];
  correctText: string;
  points: number;
  explanation: string;
}

const createEmptyQuestion = (): Q => ({
  text: "",
  type: "single",
  options: ["", ""],
  correct: [],
  correctText: "",
  points: 1,
  explanation: "",
});

function NewCourseExam() {
  const { courseId } = Route.useParams();
  const { t } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();

  const [course, setCourse] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [duration, setDuration] = useState(30);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [maxViolations, setMaxViolations] = useState(3);
  const [shuffle, setShuffle] = useState(true);
  const [qs, setQs] = useState<Q[]>([createEmptyQuestion()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("courses")
      .select("id,title,teacher_id")
      .eq("id", courseId)
      .maybeSingle()
      .then(({ data }) => setCourse(data));
  }, [courseId]);

  const updateQ = (i: number, p: Partial<Q>) => {
    setQs((current) =>
      current.map((q, idx) => (idx === i ? { ...q, ...p } : q)),
    );
  };

  const addQ = () => {
    setQs((current) => [...current, createEmptyQuestion()]);
  };

  const removeQ = (i: number) => {
    setQs((current) => current.filter((_, idx) => idx !== i));
  };

  const updateOpt = (qi: number, oi: number, v: string) => {
    const q = qs[qi];
    const opts = [...q.options];

    opts[oi] = v;

    updateQ(qi, { options: opts });
  };

  const addOpt = (qi: number) => {
    updateQ(qi, {
      options: [...qs[qi].options, ""],
    });
  };

  const removeOpt = (qi: number, oi: number) => {
    const q = qs[qi];

    updateQ(qi, {
      options: q.options.filter((_, x) => x !== oi),
      correct: q.correct
        .filter((c) => c !== oi)
        .map((c) => (c > oi ? c - 1 : c)),
    });
  };

  const toggleCorrect = (qi: number, oi: number) => {
    const q = qs[qi];

    if (q.type === "single") {
      updateQ(qi, { correct: [oi] });
      return;
    }

    updateQ(qi, {
      correct: q.correct.includes(oi)
        ? q.correct.filter((c) => c !== oi)
        : [...q.correct, oi],
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();

    if (saving) return;

    if (!user) {
      toast.error("Войдите в систему");
      return;
    }

    if (!title.trim()) {
      toast.error("Введите название");
      return;
    }

    if (!qs.length) {
      toast.error("Добавьте хотя бы один вопрос");
      return;
    }

    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];

      if (!q.text.trim()) {
        toast.error(`Вопрос #${i + 1}: введите текст`);
        return;
      }

      if (q.type === "text") {
        if (!q.correctText.trim()) {
          toast.error(`Вопрос #${i + 1}: укажите правильный ответ`);
          return;
        }
      } else {
        const opts = q.options.map((s) => s.trim()).filter(Boolean);

        if (opts.length < 2) {
          toast.error(`Вопрос #${i + 1}: добавьте минимум 2 варианта`);
          return;
        }

        if (q.correct.length === 0) {
          toast.error(`Вопрос #${i + 1}: отметьте правильный ответ`);
          return;
        }
      }
    }

    setSaving(true);

    try {
      const { data: exam, error } = await supabase
        .from("exams")
        .insert({
          teacher_id: user.id,
          title: title.trim(),
          description: desc.trim() || null,
          duration_minutes: duration,
          max_attempts: maxAttempts,
          max_violations: maxViolations,
          shuffle_questions: shuffle,
          course_id: courseId,
        })
        .select()
        .single();

      if (error || !exam) {
        toast.error(error?.message || "Не удалось создать экзамен");
        return;
      }

      const questions = qs.map((q, i) => ({
        exam_id: exam.id,
        text: q.text.trim(),
        type: q.type,
        points: q.points,
        position: i,
        options:
          q.type === "text"
            ? []
            : q.options.map((s) => s.trim()).filter(Boolean),
        correct:
          q.type === "text"
            ? [q.correctText.trim()]
            : q.correct,
        explanation: q.explanation.trim() || null,
      }));

      const { error: qErr } = await supabase
        .from("questions")
        .insert(questions);

      if (qErr) {
        await supabase.from("exams").delete().eq("id", exam.id);
        toast.error(qErr.message);
        return;
      }

      toast.success("Экзамен создан");

      nav({
        to: "/courses/$courseId",
        params: { courseId },
      });
    } catch (err: any) {
      toast.error(err?.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="p-12 text-center text-muted-foreground">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <Link
          to="/courses/$courseId"
          params={{ courseId }}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          К курсу
        </Link>

        <h1 className="text-2xl font-bold mb-1 text-gradient-mint">
          {t("dash.newExam")}
        </h1>

        {course && (
          <p className="text-sm text-muted-foreground mb-6">
            Курс:{" "}
            <span className="font-medium text-foreground">
              {course.title}
            </span>
          </p>
        )}

        <form onSubmit={save} className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div>
              <Label>{t("course.title")}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={200}
              />
            </div>

            <div>
              <Label>{t("course.desc")}</Label>
              <Textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                maxLength={1000}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>{t("exam.duration")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={300}
                  value={duration}
                  onChange={(e) => setDuration(+e.target.value)}
                />
              </div>

              <div>
                <Label>{t("exam.maxAttempts")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(+e.target.value)}
                />
              </div>

              <div>
                <Label>{t("exam.maxViolations")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={maxViolations}
                  onChange={(e) => setMaxViolations(+e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={shuffle}
                onCheckedChange={setShuffle}
              />
              <Label>{t("exam.shuffle")}</Label>
            </div>

            <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2">
              Экзамен будет доступен всем ученикам, назначенным на этот курс.
              Управляйте списком учеников в настройках курса.
            </p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold">
                {t("exam.questions")}
              </h2>

              <Button
                type="button"
                onClick={addQ}
                size="sm"
                variant="outline"
              >
                <Plus className="w-4 h-4 mr-1" />
                {t("exam.addQuestion")}
              </Button>
            </div>

            <div className="space-y-4">
              {qs.map((q, i) => (
                <div
                  key={i}
                  className="bg-card border border-border rounded-xl p-4 space-y-4"
                >
                  <div className="flex justify-between">
                    <span className="text-sm font-semibold text-primary">
                      #{i + 1}
                    </span>

                    {qs.length > 1 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeQ(i)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div>
                    <Label>{t("exam.question")}</Label>
                    <Textarea
                      value={q.text}
                      onChange={(e) =>
                        updateQ(i, { text: e.target.value })
                      }
                      required
                      maxLength={500}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t("exam.type")}</Label>
                      <select
                        value={q.type}
                        onChange={(e) =>
                          updateQ(i, {
                            type: e.target.value as Q["type"],
                            correct: [],
                            correctText: "",
                          })
                        }
                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="single">
                          {t("exam.type.single")}
                        </option>
                        <option value="multiple">
                          {t("exam.type.multiple")}
                        </option>
                        <option value="text">
                          {t("exam.type.text")}
                        </option>
                      </select>
                    </div>

                    <div>
                      <Label>{t("exam.points")}</Label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={q.points}
                        onChange={(e) =>
                          updateQ(i, { points: +e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {q.type !== "text" ? (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Варианты ответа</Label>

                        {q.options.map((opt, oi) => (
                          <div
                            key={oi}
                            className="flex gap-2 items-center"
                          >
                            <span className="text-xs text-muted-foreground w-6 text-center">
                              {oi + 1}.
                            </span>

                            <Input
                              value={opt}
                              onChange={(e) =>
                                updateOpt(i, oi, e.target.value)
                              }
                              placeholder={`Вариант ${oi + 1}`}
                              required
                            />

                            {q.options.length > 2 && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => removeOpt(i, oi)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        ))}

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addOpt(i)}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Вариант
                        </Button>
                      </div>

                      <div>
                        <Label>Правильный ответ</Label>

                        {q.type === "single" ? (
                          <select
                            value={q.correct[0] ?? ""}
                            onChange={(e) =>
                              updateQ(i, {
                                correct:
                                  e.target.value === ""
                                    ? []
                                    : [+e.target.value],
                              })
                            }
                            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                          >
                            <option value="">
                              — Выберите вариант —
                            </option>

                            {q.options.map((opt, oi) => (
                              <option
                                key={oi}
                                value={oi}
                                disabled={!opt.trim()}
                              >
                                {oi + 1}.{" "}
                                {opt.trim() || "(пустой вариант)"}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="space-y-1 border border-input rounded-md p-2">
                            {q.options.map((opt, oi) => (
                              <label
                                key={oi}
                                className="flex items-center gap-2 text-sm py-1 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={q.correct.includes(oi)}
                                  onChange={() => toggleCorrect(i, oi)}
                                  className="w-4 h-4 accent-primary"
                                  disabled={!opt.trim()}
                                />

                                <span>
                                  {oi + 1}.{" "}
                                  {opt.trim() || "(пустой вариант)"}
                                </span>
                              </label>
                            ))}

                            {q.correct.length === 0 && (
                              <p className="text-xs text-destructive pt-1">
                                Отметьте хотя бы один правильный ответ
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label>Правильный текст</Label>
                      <Input
                        value={q.correctText}
                        onChange={(e) =>
                          updateQ(i, { correctText: e.target.value })
                        }
                        required
                      />
                    </div>
                  )}

                  <div>
                    <Label>Объяснение после проверки</Label>
                    <Textarea
                      value={q.explanation}
                      maxLength={2000}
                      onChange={(e) =>
                        updateQ(i, { explanation: e.target.value })
                      }
                      placeholder="Почему ответ правильный, типичные ошибки, комментарий..."
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="w-full gradient-mint text-primary-foreground"
          >
            {saving ? t("common.loading") : t("exam.save")}
          </Button>
        </form>
      </main>
    </div>
  );
}