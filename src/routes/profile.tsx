import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/app/Header";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  component: Profile,
});

function Profile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState({
    full_name: "",
    username: "",
    avatar_url: "",
    school: "",
    class_name: "",
    city: "",
    bio: "",
    average_score: 0,
    exam_count: 0,
    violation_count: 0,
  });

  useEffect(() => {
    if (!user) return;

    const loadProfile = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      const { data: attempts, error: attemptsError } = await supabase
        .from("exam_attempts")
        .select("score, max_score, violation_count, status")
        .eq("student_id", user.id)
        .neq("status", "in_progress");

      if (attemptsError) {
        console.error("Attempts stats error:", attemptsError);
      }

      const completedAttempts = attempts || [];
      const examCount = completedAttempts.length;

      const averageScore =
        completedAttempts.length > 0
          ? Math.round(
              completedAttempts.reduce((sum, attempt) => {
                const score = Number(attempt.score || 0);
                const max = Number(attempt.max_score || 0);

                if (!max) return sum;

                return sum + (score / max) * 100;
              }, 0) / completedAttempts.length,
            )
          : 0;

      const violationCount = completedAttempts.reduce(
        (sum, attempt) => sum + Number(attempt.violation_count || 0),
        0,
      );

      setProfile({
        full_name: data.full_name || "",
        username: data.username || "",
        avatar_url: data.avatar_url || "",
        school: data.school || "",
        class_name: data.class_name || "",
        city: data.city || "",
        bio: data.bio || "",
        average_score: averageScore,
        exam_count: examCount,
        violation_count: violationCount,
      });

      setLoading(false);
    };

    void loadProfile();
  }, [user]);

  const save = async () => {
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: profile.full_name,
        username: profile.username,
        school: profile.school,
        class_name: profile.class_name,
        city: profile.city,
        bio: profile.bio,
      })
      .eq("id", user.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Профиль сохранён");
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, {
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      toast.error(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setProfile((current) => ({
      ...current,
      avatar_url: avatarUrl,
    }));

    toast.success("Аватар обновлён");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="p-10 text-center">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8 text-gradient-mint">
          Профиль
        </h1>

        <div className="space-y-6 rounded-xl border border-border p-6 bg-card">
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-full overflow-hidden border border-border bg-muted flex items-center justify-center">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-3xl font-bold">
                  {profile.full_name?.[0] || profile.username?.[0] || "?"}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <Label>Аватар</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadAvatar(file);
                }}
              />
            </div>
          </div>

          <div>
            <Label>Имя</Label>
            <Input
              value={profile.full_name}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  full_name: e.target.value,
                })
              }
            />
          </div>

          <div>
            <Label>Username</Label>
            <Input
              value={profile.username}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  username: e.target.value,
                })
              }
            />
          </div>

          <div>
            <Label>Школа</Label>
            <Input
              value={profile.school}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  school: e.target.value,
                })
              }
            />
          </div>

          <div>
            <Label>Класс</Label>
            <Input
              value={profile.class_name}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  class_name: e.target.value,
                })
              }
            />
          </div>

          <div>
            <Label>Город</Label>
            <Input
              value={profile.city}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  city: e.target.value,
                })
              }
            />
          </div>

          <div>
            <Label>О себе</Label>
            <Textarea
              value={profile.bio}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  bio: e.target.value,
                })
              }
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-border p-4">
              <div className="text-xs text-muted-foreground">Средний балл</div>
              <div className="text-2xl font-bold">
                {profile.average_score}%
              </div>
            </div>

            <div className="rounded-lg border border-border p-4">
              <div className="text-xs text-muted-foreground">Экзаменов</div>
              <div className="text-2xl font-bold">{profile.exam_count}</div>
            </div>

            <div className="rounded-lg border border-border p-4">
              <div className="text-xs text-muted-foreground">Нарушений</div>
              <div className="text-2xl font-bold">
                {profile.violation_count}
              </div>
            </div>
          </div>

          <Button
            onClick={save}
            className="gradient-mint text-primary-foreground"
          >
            Сохранить
          </Button>
        </div>
      </main>
    </div>
  );
}