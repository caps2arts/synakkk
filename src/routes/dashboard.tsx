import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Header } from "@/components/app/Header";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { BookOpen, Plus, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Dashboard() {
  const { user, role, loading } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();

  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [user, loading]);

  if (loading || !user) return <div className="min-h-screen bg-background"><Header /><div className="p-12 text-center text-muted-foreground">{t("common.loading")}</div></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {role === "teacher" ? <TeacherView /> : <StudentView />}
      </main>
    </div>
  );
}

function TeacherView() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [courses, setCourses] = useState<any[]>([]);
  const [showNewCourse, setShowNewCourse] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const load = async () => {
    const { data } = await supabase.from("courses").select("*").order("created_at", { ascending: false });
    setCourses(data || []);
  };
  useEffect(() => { load(); }, []);

  const createCourse = async (e: React.FormEvent) => {
  e.preventDefault();

  const { data: authData } = await supabase.auth.getUser();

  console.log("AUTH USER:", authData.user);
  console.log("AUTH ID:", authData.user?.id);

  if (!authData.user) {
    toast.error("No authenticated user");
    return;
  }

  const { error } = await supabase.from("courses").insert({
    title,
    description: desc,
    teacher_id: authData.user.id,
  });

  if (error) {
    console.log(error);
    toast.error(error.message);
    return;
  }

  setTitle("");
  setDesc("");
  setShowNewCourse(false);

  load();
};

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gradient-mint">{t("dash.teacher")}</h1>

      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2"><BookOpen className="w-5 h-5" />{t("dash.myCourses")}</h2>
          <Button onClick={() => setShowNewCourse(!showNewCourse)} size="sm" className="gradient-mint text-primary-foreground"><Plus className="w-4 h-4 mr-1" />{t("dash.newCourse")}</Button>
        </div>
        {showNewCourse && (
          <form onSubmit={createCourse} className="bg-card border border-border rounded-xl p-4 mb-4 space-y-3">
            <div><Label>{t("course.title")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} /></div>
            <div><Label>{t("course.desc")}</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={1000} /></div>
            <Button type="submit" className="gradient-mint text-primary-foreground">{t("course.create")}</Button>
          </form>
        )}
        <div className="grid md:grid-cols-3 gap-4">
          {courses.map((c) => (
            <Link key={c.id} to="/courses/$courseId" params={{ courseId: c.id }} className="p-5 rounded-xl bg-card border border-border hover:border-primary transition-colors">
              <h3 className="font-semibold mb-1">{c.title}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>
            </Link>
          ))}
          {courses.length === 0 && <p className="text-muted-foreground text-sm">Курсов пока нет — создайте первый.</p>}
        </div>
      </section>
    </div>
  );
}

function StudentView() {
  const { t } = useI18n();
  const [attempts, setAttempts] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: at } = await supabase.from("exam_attempts").select("*, exams(title)").order("started_at", { ascending: false });
      const attemptsList = at || [];
      const missingIds = Array.from(new Set(attemptsList.filter(a => !a.exams?.title).map(a => a.exam_id)));
      let titleMap: Record<string, string> = {};
      if (missingIds.length) {
        const { data: extra } = await supabase.from("exams").select("id,title").in("id", missingIds);
        titleMap = Object.fromEntries((extra || []).map((e: any) => [e.id, e.title]));
      }
      setAttempts(attemptsList.map(a => ({ ...a, _title: a.exams?.title || titleMap[a.exam_id] || "—" })));
      const { data: cs } = await supabase.from("courses").select("*");
      setCourses(cs || []);
    })();
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gradient-mint">{t("dash.student")}</h1>

      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><BookOpen className="w-5 h-5" />Мои курсы</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {courses.map((c) => (
            <Link key={c.id} to="/courses/$courseId" params={{ courseId: c.id }} className="p-5 rounded-xl bg-card border border-border hover:border-primary transition-colors">
              <h3 className="font-semibold mb-1">{c.title}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>
            </Link>
          ))}
          {courses.length === 0 && <p className="text-muted-foreground text-sm">Вам пока не назначены курсы.</p>}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5" />{t("dash.results")}</h2>
        <div className="space-y-2">
          {attempts.filter(a => a.status !== "in_progress").map((a) => (
            <div key={a.id} className="p-4 rounded-lg bg-card border border-border flex justify-between text-sm">
              <span className="font-medium">{a._title}</span>
              <span className="font-mono">{a.score ?? "–"} / {a.max_score ?? "–"}</span>
              <span className="text-muted-foreground">{a.status}</span>
            </div>
          ))}
          {attempts.filter(a => a.status !== "in_progress").length === 0 && <p className="text-muted-foreground text-sm">Результатов пока нет</p>}
        </div>
      </section>
    </div>
  );
}
