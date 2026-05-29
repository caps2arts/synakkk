import { createFileRoute, Link, useNavigate, Outlet } from "@tanstack/react-router";
import { Header } from "@/components/app/Header";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  BookOpen,
  Presentation,
  Dumbbell,
  Plus,
  Trash2,
  ExternalLink,
  ArrowLeft,
  FileCheck2,
  Play,
  Search,
  X,
  Globe,
  Lock,
  BarChart3,
  Settings,
  FileText,
} from "lucide-react";
import { QuestionBuilder } from "@/components/assessment/QuestionBuilder";
import { QuestionAnswerForm } from "@/components/assessment/QuestionAnswerForm";
import {
  createEmptyQuestion,
  extractPresentationAssetPaths,
  parseExerciseContent,
  parsePresentationContent,
  scoreAssessment,
  serializeExerciseContent,
  serializePresentationContent,
  validateQuestions,
  type AssessmentAnswers,
  type AssessmentQuestion,
  type AssessmentQuestionDraft,
  type PresentationMode,
} from "@/lib/assessments";
import { getSignedCourseAssetUrls, removeCourseAssets, uploadCourseAsset } from "@/lib/course-assets";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/courses/$courseId")({ component: CoursePage });

type CourseRow = Database["public"]["Tables"]["courses"]["Row"];
type MaterialRow = Database["public"]["Tables"]["course_materials"]["Row"];
type ExamRow = Database["public"]["Tables"]["exams"]["Row"];
type AttemptRow = Database["public"]["Tables"]["exam_attempts"]["Row"];
type AssignmentRow = Database["public"]["Tables"]["course_assignments"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

type CourseMaterialKind = "lecture" | "presentation" | "exercise";

interface SearchStudentResult {
  id: string;
  full_name: string;
  username: string;
}

interface StudentAssignment extends AssignmentRow {
  profile?: Pick<ProfileRow, "full_name" | "username"> | null;
}

interface PresentationCardData {
  description: string;
  mode: PresentationMode;
  externalUrl?: string;
  previewUrls: string[];
}

function isEmbeddableUrl(url: string) {
  return /youtube\.com|youtu\.be|docs\.google\.com|slideshare|vimeo/i.test(url) || /\.pdf$/i.test(url);
}

function toEmbedUrl(url: string) {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  return url;
}

function CoursePage() {
  const { courseId } = Route.useParams();
  const { user, role, loading } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();

  const [course, setCourse] = useState<CourseRow | null>(null);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [studentAssigns, setStudentAssigns] = useState<StudentAssignment[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchStudentResult[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [kind, setKind] = useState<CourseMaterialKind>("lecture");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [presentationMode, setPresentationMode] = useState<PresentationMode>("link");
  const [presentationPdf, setPresentationPdf] = useState<File | null>(null);
  const [presentationPngs, setPresentationPngs] = useState<File[]>([]);
  const [exerciseQuestions, setExerciseQuestions] = useState<AssessmentQuestionDraft[]>([createEmptyQuestion()]);
  const [exerciseAnswers, setExerciseAnswers] = useState<Record<string, AssessmentAnswers>>({});
  const [exerciseScores, setExerciseScores] = useState<Record<string, { score: number; max: number }>>({});
  const [presentationAssets, setPresentationAssets] = useState<Record<string, PresentationCardData>>({});
  const [isSavingMaterial, setIsSavingMaterial] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      nav({ to: "/auth" });
    }
  }, [user, loading, nav]);

  const load = async () => {
    const [courseResponse, materialsResponse, examsResponse, attemptsResponse] = await Promise.all([
      supabase.from("courses").select("*").eq("id", courseId).maybeSingle(),
      supabase.from("course_materials").select("*").eq("course_id", courseId).order("position").order("created_at"),
      supabase.from("exams").select("*").eq("course_id", courseId).order("created_at", { ascending: false }),
      supabase.from("exam_attempts").select("*").order("started_at", { ascending: false }),
    ]);

    if (courseResponse.error) toast.error(courseResponse.error.message);
    if (materialsResponse.error) toast.error(materialsResponse.error.message);
    if (examsResponse.error) toast.error(examsResponse.error.message);
    if (attemptsResponse.error) toast.error(attemptsResponse.error.message);

    setCourse(courseResponse.data ?? null);
    setMaterials(materialsResponse.data ?? []);
    setExams(examsResponse.data ?? []);
    setAttempts(attemptsResponse.data ?? []);
  };

  useEffect(() => {
    if (user) {
      void load();
    }
  }, [user, courseId]);

  const isTeacher = role === "teacher" && Boolean(course && user && course.teacher_id === user.id);

  useEffect(() => {
    if (!isTeacher) return;

    (async () => {
      const { data: assignments, error } = await supabase
        .from("course_assignments")
        .select("id, student_id, course_id, assigned_at")
        .eq("course_id", courseId);

      if (error) {
        toast.error(error.message);
        return;
      }

      const assignmentRows = assignments ?? [];
      const studentIds = assignmentRows.map((assignment) => assignment.student_id);
      let profilesMap = new Map<string, Pick<ProfileRow, "full_name" | "username">>();

      if (studentIds.length) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .in("id", studentIds);

        if (profilesError) {
          toast.error(profilesError.message);
        } else {
          profilesMap = new Map((profiles ?? []).map((profile) => [profile.id, { full_name: profile.full_name, username: profile.username }]));
        }
      }

      setStudentAssigns(
        assignmentRows.map((assignment) => ({
          ...assignment,
          profile: profilesMap.get(assignment.student_id) ?? null,
        })),
      );
    })();
  }, [isTeacher, courseId]);

  useEffect(() => {
    const loadPresentationAssets = async () => {
      const presentationMaterials = materials.filter((material) => material.kind === "presentation");
      if (!presentationMaterials.length) {
        setPresentationAssets({});
        return;
      }

      const entries = await Promise.all(
        presentationMaterials.map(async (material) => {
          const parsed = parsePresentationContent(material.content, material.url);
          const paths = extractPresentationAssetPaths(material.content);
          const previewUrls = paths.length ? await getSignedCourseAssetUrls(paths) : [];
          return [material.id, {
            description: parsed.description,
            mode: parsed.mode,
            externalUrl: parsed.externalUrl,
            previewUrls,
          } satisfies PresentationCardData] as const;
        }),
      );

      setPresentationAssets(Object.fromEntries(entries));
    };

    void loadPresentationAssets();
  }, [materials]);

  const grouped = useMemo(() => ({
    lecture: materials.filter((material) => material.kind === "lecture"),
    presentation: materials.filter((material) => material.kind === "presentation"),
    exercise: materials.filter((material) => material.kind === "exercise"),
  }), [materials]);

  const resetMaterialForm = () => {
    setTitle("");
    setContent("");
    setUrl("");
    setPresentationMode("link");
    setPresentationPdf(null);
    setPresentationPngs([]);
    setExerciseQuestions([createEmptyQuestion()]);
    setShowAddMaterial(false);
  };

  const onSelectPresentationPdf = (event: ChangeEvent<HTMLInputElement>) => {
    setPresentationPdf(event.target.files?.[0] ?? null);
  };

  const onSelectPresentationPngs = (event: ChangeEvent<HTMLInputElement>) => {
    setPresentationPngs(Array.from(event.target.files ?? []));
  };

  const addMaterial = async (event: FormEvent) => {
    event.preventDefault();
    setIsSavingMaterial(true);

    try {
      let nextContent = content.trim();
      let nextUrl = url.trim() || null;

      if (kind === "presentation") {
        if (presentationMode === "pdf") {
          if (!presentationPdf) {
            toast.error(t("error.presentation.file_required"));
            return;
          }

          const pdfPath = await uploadCourseAsset(courseId, "presentations", presentationPdf);
          nextContent = serializePresentationContent({
            description: content,
            mode: "pdf",
            pdfPath,
          });
          nextUrl = null;
        } else if (presentationMode === "png-pages") {
          if (!presentationPngs.length) {
            toast.error(t("error.presentation.pages_required"));
            return;
          }

          const orderedPages = [...presentationPngs].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
          const pagePaths = await Promise.all(orderedPages.map((file) => uploadCourseAsset(courseId, "presentations", file)));
          nextContent = serializePresentationContent({
            description: content,
            mode: "png-pages",
            pagePaths,
          });
          nextUrl = null;
        } else {
          nextContent = serializePresentationContent({
            description: content,
            mode: "link",
            externalUrl: url.trim(),
          });
          nextUrl = url.trim() || null;
        }
      }

      if (kind === "exercise") {
        const validationError = validateQuestions(exerciseQuestions);
        if (validationError) {
          toast.error(t(validationError as Parameters<typeof t>[0]));
          return;
        }

        nextContent = serializeExerciseContent(content, exerciseQuestions);
        nextUrl = null;
      }

      const { error } = await supabase.from("course_materials").insert({
        course_id: courseId,
        kind,
        title,
        content: nextContent || null,
        url: nextUrl,
        position: materials.length,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(kind === "exercise" ? t("course.exercise.saved") : t("common.saved"));
      resetMaterialForm();
      await load();
    } finally {
      setIsSavingMaterial(false);
    }
  };

  const del = async (material: MaterialRow) => {
    if (!confirm(t("course.material.delete"))) return;

    const assetPaths = material.kind === "presentation" ? extractPresentationAssetPaths(material.content) : [];
    const { error } = await supabase.from("course_materials").delete().eq("id", material.id);
    if (error) {
      toast.error(error.message);
      return;
    }

    if (assetPaths.length) {
      await removeCourseAssets(assetPaths);
    }

    await load();
  };

  const delExam = async (id: string) => {
    if (!confirm(t("exam.deleted"))) return;
    const { error } = await supabase.from("exams").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await load();
  };

  const togglePublic = async () => {
    if (!course) return;
    const { error } = await supabase.from("courses").update({ is_public: !course.is_public }).eq("id", courseId);
    if (error) {
      toast.error(error.message);
      return;
    }
    await load();
  };

  const doSearch = async () => {
    if (!search.trim()) return;
    const { data, error } = await supabase.rpc("search_students", { _query: search.trim() });
    if (error) {
      toast.error(error.message);
      return;
    }

    setSearchResults((data ?? []).filter((student) => !studentAssigns.some((assignment) => assignment.student_id === student.id)));
  };

  const assignStudent = async (student: SearchStudentResult) => {
    const { error } = await supabase.from("course_assignments").insert({ course_id: courseId, student_id: student.id });
    if (error) {
      toast.error(error.message);
      return;
    }

    setSearchResults((current) => current.filter((entry) => entry.id !== student.id));
    setStudentAssigns((current) => [...current, { course_id: courseId, student_id: student.id, id: crypto.randomUUID(), assigned_at: new Date().toISOString(), profile: { full_name: student.full_name, username: student.username } }]);
  };

  const unassignStudent = async (assignmentId: string) => {
    const { error } = await supabase.from("course_assignments").delete().eq("id", assignmentId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStudentAssigns((current) => current.filter((assignment) => assignment.id !== assignmentId));
  };

  const openExercise = (material: MaterialRow) => {
    setExerciseScores((current) => {
      const next = { ...current };
      delete next[material.id];
      return next;
    });
    const parsed = parseExerciseContent(material.content);
    const answers = Object.fromEntries(parsed.questions.map((_, index) => [String(index), parsed.questions[index].type === "multiple" ? [] : ""])) as AssessmentAnswers;
    setExerciseAnswers((current) => ({ ...current, [material.id]: answers }));
  };

  const submitExercise = (material: MaterialRow) => {
    const parsed = parseExerciseContent(material.content);
    const questions: AssessmentQuestion[] = parsed.questions.map((question, index) => ({ ...question, id: String(index) }));
    const result = scoreAssessment(questions, exerciseAnswers[material.id] ?? {});
    setExerciseScores((current) => ({ ...current, [material.id]: result }));
  };

  if (loading || !user || !course) {
    return <div className="min-h-screen bg-background"><Header /><div className="p-12 text-center text-muted-foreground">{t("common.loading")}</div></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-5xl px-4 py-8">
        <Link to="/dashboard" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </Link>

        <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gradient-mint">{course.title}</h1>
            {course.description && <p className="mt-2 max-w-2xl text-muted-foreground">{course.description}</p>}
          </div>
          {isTeacher && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={course.is_public ? "default" : "outline"}
                onClick={togglePublic}
                className={course.is_public ? "gradient-mint text-primary-foreground" : ""}
              >
                {course.is_public ? (
                  <><Globe className="w-4 h-4 mr-1" />{t("course.visibility.public")}</>
                ) : (
                  <><Lock className="w-4 h-4 mr-1" />{t("course.visibility.private")}</>
                )}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowSettings((current) => !current)}>
                <Settings className="w-4 h-4 mr-1" />
                {t("course.settings")}
              </Button>
            </div>
          )}
        </div>

        {isTeacher && showSettings && (
          <section className="mb-6 rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><BookOpen className="w-4 h-4" />{t("course.students")}</h2>
            <p className="mb-3 text-xs text-muted-foreground">{t("course.students.help")}</p>
            <div className="mb-2 flex gap-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void doSearch();
                  }
                }}
                placeholder={t("course.searchStudents")}
              />
              <Button type="button" variant="outline" onClick={() => void doSearch()}><Search className="w-4 h-4" /></Button>
            </div>
            {searchResults.length > 0 && (
              <div className="mb-2 divide-y divide-border rounded-md border border-border">
                {searchResults.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => void assignStudent(student)}
                    className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>{student.full_name || "—"} <span className="text-muted-foreground">@{student.username}</span></span>
                    <Plus className="w-4 h-4 text-primary" />
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {studentAssigns.map((assignment) => (
                <span key={assignment.id} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
                  {assignment.profile?.full_name || assignment.profile?.username || assignment.student_id.slice(0, 8)}
                  <button type="button" onClick={() => void unassignStudent(assignment.id)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {studentAssigns.length === 0 && <span className="text-xs text-muted-foreground">{t("course.noStudents")}</span>}
            </div>
          </section>
        )}

        <Tabs defaultValue="lectures" className="w-full">
          <TabsList className="grid w-full grid-cols-4 md:w-fit">
            <TabsTrigger value="lectures"><BookOpen className="w-4 h-4 mr-1" />{t("course.tabs.lectures")}</TabsTrigger>
            <TabsTrigger value="presentations"><Presentation className="w-4 h-4 mr-1" />{t("course.tabs.presentations")}</TabsTrigger>
            <TabsTrigger value="exercises"><Dumbbell className="w-4 h-4 mr-1" />{t("course.tabs.exercises")}</TabsTrigger>
            <TabsTrigger value="exams"><FileCheck2 className="w-4 h-4 mr-1" />{t("course.tabs.exams")}</TabsTrigger>
          </TabsList>

          {(["lecture", "presentation", "exercise"] as const).map((materialKind) => {
            const tabValue = materialKind === "lecture" ? "lectures" : materialKind === "presentation" ? "presentations" : "exercises";
            const labelKey = materialKind === "lecture"
              ? "course.material.addLecture"
              : materialKind === "presentation"
                ? "course.material.addPresentation"
                : "course.material.addExercise";

            return (
              <TabsContent key={materialKind} value={tabValue} className="mt-6">
                {isTeacher && (
                  <div className="mb-3 flex justify-end">
                    <Button
                      size="sm"
                      className="gradient-mint text-primary-foreground"
                      onClick={() => {
                        setKind(materialKind);
                        setShowAddMaterial(true);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      {t(labelKey)}
                    </Button>
                  </div>
                )}

                {isTeacher && showAddMaterial && kind === materialKind && (
                  <form onSubmit={(event) => void addMaterial(event)} className="mb-4 space-y-4 rounded-xl border border-border bg-card p-4">
                    <div>
                      <Label>{t("course.material.title")}</Label>
                      <Input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} />
                    </div>

                    <div>
                      <Label>{materialKind === "lecture" ? t("course.material.lectureText") : materialKind === "exercise" ? t("course.material.exerciseDescription") : t("course.material.description")}</Label>
                      <Textarea
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        rows={materialKind === "lecture" ? 8 : 4}
                        placeholder={materialKind === "exercise" ? t("course.exercise.description.placeholder") : undefined}
                      />
                    </div>

                    {materialKind === "presentation" && (
                      <>
                        <div>
                          <Label>{t("course.presentation.source")}</Label>
                          <Select value={presentationMode} onValueChange={(value) => setPresentationMode(value as PresentationMode)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="link">{t("course.presentation.source.link")}</SelectItem>
                              <SelectItem value="pdf">{t("course.presentation.source.pdf")}</SelectItem>
                              <SelectItem value="png-pages">{t("course.presentation.source.png")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {presentationMode === "link" && (
                          <div>
                            <Label>{t("course.presentation.link")}</Label>
                            <Input
                              value={url}
                              onChange={(event) => setUrl(event.target.value)}
                              placeholder={t("course.presentation.link.placeholder")}
                            />
                            <p className="mt-1 text-xs text-muted-foreground">{t("course.presentation.link.help")}</p>
                          </div>
                        )}

                        {presentationMode === "pdf" && (
                          <div>
                            <Label>{t("course.presentation.pdf")}</Label>
                            <Input type="file" accept="application/pdf" onChange={onSelectPresentationPdf} />
                          </div>
                        )}

                        {presentationMode === "png-pages" && (
                          <div>
                            <Label>{t("course.presentation.png")}</Label>
                            <Input type="file" accept="image/png" multiple onChange={onSelectPresentationPngs} />
                            {presentationPngs.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                {presentationPngs.map((file) => <span key={file.name} className="rounded-md bg-muted px-2 py-1">{file.name}</span>)}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {materialKind === "exercise" && (
                      <QuestionBuilder
                        questions={exerciseQuestions}
                        onChange={setExerciseQuestions}
                        labels={{
                          addQuestion: t("exam.addQuestion"),
                          question: t("exam.question"),
                          type: t("exam.type"),
                          single: t("exam.type.single"),
                          multiple: t("exam.type.multiple"),
                          text: t("exam.type.text"),
                          points: t("exam.points"),
                          options: t("exam.options"),
                          addOption: t("exam.addOption"),
                          correctAnswer: t("exam.correct"),
                          correctText: t("exam.correctText"),
                          selectOption: t("exam.selectOption"),
                          emptyOption: t("exam.emptyOption"),
                          markOneAnswer: t("exam.markOne"),
                        }}
                      />
                    )}

                    <div className="flex gap-2">
                      <Button type="submit" className="gradient-mint text-primary-foreground" disabled={isSavingMaterial}>{t("course.material.save")}</Button>
                      <Button type="button" variant="ghost" onClick={resetMaterialForm}>{t("course.material.cancel")}</Button>
                    </div>
                  </form>
                )}

                {materialKind === "presentation" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {grouped.presentation.map((material) => {
                      const parsedPresentation = parsePresentationContent(material.content, material.url);
                      const presentation = presentationAssets[material.id] ?? {
                        description: parsedPresentation.description,
                        mode: parsedPresentation.mode,
                        externalUrl: parsedPresentation.externalUrl,
                        previewUrls: [],
                      };
                      const firstPreview = presentation.previewUrls?.[0];
                      return (
                        <div key={material.id} className="overflow-hidden rounded-xl border border-border bg-card">
                          {presentation.mode === "link" && presentation.externalUrl && isEmbeddableUrl(presentation.externalUrl) ? (
                            <iframe src={toEmbedUrl(presentation.externalUrl)} className="aspect-video w-full bg-background" allow="fullscreen" title={material.title} />
                          ) : firstPreview ? (
                            presentation.mode === "pdf" ? (
                              <iframe src={firstPreview} className="aspect-video w-full bg-background" title={material.title} />
                            ) : (
                              <img src={firstPreview} alt={material.title} className="aspect-video w-full object-cover" loading="lazy" />
                            )
                          ) : (
                            <div className="flex aspect-video items-center justify-center bg-muted text-muted-foreground">
                              <Presentation className="w-10 h-10" />
                            </div>
                          )}
                          <div className="space-y-3 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="font-semibold">{material.title}</h3>
                              {isTeacher && <Button size="icon" variant="ghost" onClick={() => void del(material)}><Trash2 className="w-4 h-4" /></Button>}
                            </div>
                            {presentation.description && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{presentation.description}</p>}
                            {presentation.mode === "png-pages" && presentation.previewUrls.length > 1 && (
                              <div className="grid grid-cols-3 gap-2">
                                {presentation.previewUrls.slice(0, 6).map((previewUrl, index) => (
                                  <img key={previewUrl} src={previewUrl} alt={`${material.title} ${index + 1}`} className="aspect-[4/3] w-full rounded-md border border-border object-cover" loading="lazy" />
                                ))}
                              </div>
                            )}
                            {presentation.mode === "pdf" && firstPreview && (
                              <a href={firstPreview} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                                <FileText className="w-3 h-3" />
                                {t("course.material.openNewTab")}
                              </a>
                            )}
                            {presentation.mode === "link" && presentation.externalUrl && (
                              <a href={presentation.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                                <ExternalLink className="w-3 h-3" />
                                {t("course.material.openNewTab")}
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {grouped.presentation.length === 0 && <p className="text-sm text-muted-foreground">{t("course.material.nonePresentations")}</p>}
                  </div>
                ) : materialKind === "exercise" ? (
                  <div className="space-y-4">
                    {grouped.exercise.map((material) => {
                      const exercise = parseExerciseContent(material.content);
                      const questions: AssessmentQuestion[] = exercise.questions.map((question, index) => ({ ...question, id: String(index) }));
                      const hasOpened = Boolean(exerciseAnswers[material.id]);
                      return (
                        <div key={material.id} className="rounded-xl border border-border border-l-4 border-l-primary bg-card p-5">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Dumbbell className="w-5 h-5 text-primary" />
                              <div>
                                <h3 className="font-semibold">{material.title}</h3>
                                {exercise.description && <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{exercise.description}</p>}
                              </div>
                            </div>
                            {isTeacher && <Button size="icon" variant="ghost" onClick={() => void del(material)}><Trash2 className="w-4 h-4" /></Button>}
                          </div>

                          {questions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t("course.exercise.empty")}</p>
                          ) : (
                            <div className="space-y-4">
                              {!hasOpened ? (
                                <Button type="button" variant="outline" onClick={() => openExercise(material)}>
                                  <Play className="w-4 h-4 mr-1" />
                                  {t("course.exercise.start")}
                                </Button>
                              ) : (
                                <>
                                  <QuestionAnswerForm
                                    questions={questions}
                                    answers={exerciseAnswers[material.id] ?? {}}
                                    onChange={(answers) => setExerciseAnswers((current) => ({ ...current, [material.id]: answers }))}
                                  />
                                  <div className="flex flex-wrap items-center gap-3">
                                    <Button type="button" className="gradient-mint text-primary-foreground" onClick={() => submitExercise(material)}>
                                      {t("course.exercise.submit")}
                                    </Button>
                                    {exerciseScores[material.id] && (
                                      <span className="text-sm font-medium text-primary">
                                        {t("course.exercise.score")}: {exerciseScores[material.id].score}/{exerciseScores[material.id].max}
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {grouped.exercise.length === 0 && <p className="text-sm text-muted-foreground">{t("course.material.noneExercises")}</p>}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {grouped.lecture.map((material) => (
                      <article key={material.id} className="rounded-xl border border-border bg-card p-6">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-primary" />
                            <h3 className="text-lg font-semibold">{material.title}</h3>
                          </div>
                          {isTeacher && <Button size="icon" variant="ghost" onClick={() => void del(material)}><Trash2 className="w-4 h-4" /></Button>}
                        </div>
                        {material.content && <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{material.content}</p>}
                        {material.url && (
                          <div className="mt-3">
                            {isEmbeddableUrl(material.url) && <iframe src={toEmbedUrl(material.url)} className="aspect-video w-full rounded-lg border border-border bg-background" allow="fullscreen" />}
                            <a href={material.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                              <ExternalLink className="w-3 h-3" />
                              {t("course.material.open")}
                            </a>
                          </div>
                        )}
                      </article>
                    ))}
                    {grouped.lecture.length === 0 && <p className="text-sm text-muted-foreground">{t("course.material.noneLectures")}</p>}
                  </div>
                )}
              </TabsContent>
            );
          })}

          <TabsContent value="exams" className="mt-6">
            {isTeacher && (
              <div className="mb-3 flex justify-end">
                <Link to="/courses/$courseId/exams/new" params={{ courseId }}>
                  <Button size="sm" className="gradient-mint text-primary-foreground"><Plus className="w-4 h-4 mr-1" />{t("dash.newExam")}</Button>
                </Link>
              </div>
            )}
            <div className="space-y-3">
              {exams.map((exam) => {
                const usedAttempts = attempts.filter((attempt) => attempt.exam_id === exam.id && attempt.student_id === user.id);
                const completedAttempts = usedAttempts.filter((attempt) => attempt.status !== "in_progress");
                const bestAttempt = completedAttempts.sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0))[0];
                const activeAttempt = usedAttempts.find((attempt) => attempt.status === "in_progress");
                const canTake = !isTeacher && completedAttempts.length < exam.max_attempts;

                return (
                  <div key={exam.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-2 font-semibold"><FileCheck2 className="w-4 h-4 text-primary" />{exam.title}</h3>
                      {exam.description && <p className="mt-1 text-sm text-muted-foreground">{exam.description}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {exam.duration_minutes} {t("common.minutes")} · {t("exam.maxAttempts")}: {completedAttempts.length}/{exam.max_attempts}
                        {bestAttempt ? ` · ${t("exam.best")}: ${bestAttempt.score}/${bestAttempt.max_score}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {isTeacher ? (
                        <>
                          <Link to="/exams/$examId/results" params={{ examId: exam.id }}><Button size="sm" variant="outline"><BarChart3 className="w-4 h-4 mr-1" />{t("results.title")}</Button></Link>
                          <Button size="icon" variant="ghost" onClick={() => void delExam(exam.id)}><Trash2 className="w-4 h-4" /></Button>
                        </>
                      ) : activeAttempt ? (
                        <Link to="/exams/$examId/take" params={{ examId: exam.id }}><Button size="sm" className="gradient-mint text-primary-foreground"><Play className="w-4 h-4 mr-1" />{t("exam.start")}</Button></Link>
                      ) : canTake ? (
                        <Link to="/exams/$examId/take" params={{ examId: exam.id }}><Button size="sm" className="gradient-mint text-primary-foreground"><Play className="w-4 h-4 mr-1" />{t("exam.start")}</Button></Link>
                      ) : <span className="text-xs text-muted-foreground">{t("exam.attemptLimit")}</span>}
                    </div>
                  </div>
                );
              })}
              {exams.length === 0 && <p className="text-sm text-muted-foreground">{t(isTeacher ? "exam.noneTeacher" : "exam.noneStudent")}</p>}
            </div>
          </TabsContent>
        </Tabs>
        <Outlet />
      </main>
    </div>
  );
}
