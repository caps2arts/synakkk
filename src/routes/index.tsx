import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/app/Header";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { BookOpen, FileCheck2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Сынак — Платформа онлайн-обучения и экзаменов" }, { name: "description", content: "Сынак — современная система онлайн-обучения и безопасного проведения экзаменов." }] }),
  component: Index,
});

function Index() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="container mx-auto px-4 py-24 md:py-32 text-center">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            <span className="text-gradient-mint">{t("app.name")}</span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10">
            {t("app.tagline")}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link to="/auth" search={{ mode: "signup" }}>
              <Button size="lg" className="gradient-mint text-primary-foreground font-semibold px-8">
                {t("hero.cta")}
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" variant="outline">{t("hero.secondary")}</Button>
            </Link>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">{t("features.title")}</h2>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {[
              { icon: BookOpen, k: "f.courses" },
              { icon: FileCheck2, k: "f.exams" },
            ].map(({ icon: Icon, k }) => (
              <div key={k} className="p-8 rounded-2xl bg-card border border-border hover:border-primary/40 transition">
                <div className="w-12 h-12 rounded-xl gradient-mint flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{t(k as any)}</h3>
                <p className="text-muted-foreground">{t((k + ".d") as any)}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-border/50 mt-20 py-8 text-center text-sm text-muted-foreground">
          © 2026 {t("app.name")}
        </footer>
      </main>
    </div>
  );
}
