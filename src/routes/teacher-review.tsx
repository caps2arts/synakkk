import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/teacher-review")({
  component: TeacherReview,
});

function TeacherReview() {
  const [submissions, setSubmissions] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("submissions")
        .select("*")
        .eq("status", "pending");

      setSubmissions(data || []);
    };

    load();
  }, []);

  const approve = async (item: any) => {
    await supabase
      .from("submissions")
      .update({
        status: "approved",
        teacher_score: item.ai_score,
      })
      .eq("id", item.id);

    setSubmissions((prev) => prev.filter((x) => x.id !== item.id));
  };

  const reject = async (item: any) => {
    const score = prompt("Enter score");

    if (!score) return;

    await supabase
      .from("submissions")
      .update({
        status: "corrected",
        teacher_score: Number(score),
      })
      .eq("id", item.id);

    setSubmissions((prev) => prev.filter((x) => x.id !== item.id));
  };

  return (
    <div className="p-6 space-y-4">
      {submissions.map((s) => (
        <div key={s.id} className="border p-4 rounded">
          <div>Answer: {s.answer}</div>
          <div>AI score: {s.ai_score}</div>

          <div className="flex gap-2 mt-2">
            <Button onClick={() => approve(s)}>✔</Button>
            <Button variant="outline" onClick={() => reject(s)}>
              ✖
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}