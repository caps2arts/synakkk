import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Header } from "@/components/app/Header";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Search = {
  mode: "login" | "signup";
};

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    mode: search.mode === "signup" ? "signup" : "login",
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const nav = useNavigate();

  const [mode, setMode] = useState<"login" | "signup">(search.mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"teacher" | "student">("student");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              full_name: fullName,
              username,
              role,
            },
          },
        });

        if (error) throw error;

        if (data.session) {
          toast.success("Аккаунт создан");
          setTimeout(() => {
            nav({ to: "/dashboard", replace: true });
          }, 150);
        } else {
          toast.success("Аккаунт создан. Проверь почту для подтверждения.");
        }

        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.session) {
        setTimeout(() => {
          nav({ to: "/dashboard", replace: true });
        }, 150);
      } else {
        toast.error("Не удалось войти");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 py-16 max-w-md">
        <div className="rounded-2xl border border-border bg-card p-8">
          <h1 className="mb-6 text-2xl font-bold text-gradient-mint">
            {mode === "login" ? t("auth.title") : t("auth.signupTitle")}
          </h1>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <Label>{t("auth.fullname")}</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    maxLength={100}
                  />
                </div>

                <div>
                  <Label>{t("auth.username")}</Label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    maxLength={40}
                  />
                </div>

                <div>
                  <Label>{t("auth.role")}</Label>
                  <div className="mt-1 flex gap-2">
                    <Button
                      type="button"
                      variant={role === "student" ? "default" : "outline"}
                      className={
                        role === "student"
                          ? "gradient-mint flex-1 text-primary-foreground"
                          : "flex-1"
                      }
                      onClick={() => setRole("student")}
                    >
                      {t("auth.role.student")}
                    </Button>

                    <Button
                      type="button"
                      variant={role === "teacher" ? "default" : "outline"}
                      className={
                        role === "teacher"
                          ? "gradient-mint flex-1 text-primary-foreground"
                          : "flex-1"
                      }
                      onClick={() => setRole("teacher")}
                    >
                      {t("auth.role.teacher")}
                    </Button>
                  </div>
                </div>
              </>
            )}

            <div>
              <Label>{t("auth.email")}</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <Label>{t("auth.password")}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full gradient-mint text-primary-foreground"
            >
              {mode === "login" ? t("auth.submit.login") : t("auth.submit.signup")}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="mt-4 block w-full text-center text-sm text-muted-foreground hover:text-primary"
          >
            {mode === "login" ? t("auth.toSignup") : t("auth.toLogin")}
          </button>
        </div>
      </div>
    </div>
  );
}