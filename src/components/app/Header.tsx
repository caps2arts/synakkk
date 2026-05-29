import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n, type Lang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { GraduationCap, Moon, Sun, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

export function Header() {
  const { user, role, signOut } = useAuth();
  const { t, lang, setLang } = useI18n();
  const nav = useNavigate();
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("theme") || "dark";
    setDark(saved === "dark");
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);
  const toggleTheme = () => {
    const next = !dark; setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <header className="border-b border-border/50 bg-background/80 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to={user ? "/dashboard" : "/auth"} className="flex items-center gap-2 font-bold text-lg">
          <div className="w-9 h-9 rounded-lg gradient-mint flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-gradient-mint">{t("app.name")}</span>
        </Link>
        <div className="flex items-center gap-2">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="bg-transparent border border-border rounded-md px-2 py-1 text-sm"
          >
            <option value="ru">RU</option><option value="en">EN</option><option value="kg">KG</option>
          </select>
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="theme">
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          {user ? (
            <>
              <Link to="/dashboard"><Button variant="ghost" size="sm">{t("nav.dashboard")}</Button></Link>
              <span className="text-xs text-muted-foreground hidden sm:inline">
  {role === "teacher"
    ? t("auth.role.teacher")
    : role === "student"
      ? t("auth.role.student")
      : ""}
</span>
              <Button variant="ghost" size="icon" onClick={async () => { await signOut(); nav({ to: "/" }); }}>
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth"><Button variant="ghost" size="sm">{t("nav.login")}</Button></Link>
              <Link to="/auth" search={{ mode: "signup" }}><Button size="sm" className="gradient-mint text-primary-foreground">{t("nav.signup")}</Button></Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
