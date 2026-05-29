import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { AssessmentAnswers, AssessmentQuestion } from "@/lib/assessments";

interface QuestionAnswerFormProps {
  questions: AssessmentQuestion[];
  answers: AssessmentAnswers;
  onChange: (answers: AssessmentAnswers) => void;
}

export function QuestionAnswerForm({ questions, answers, onChange }: QuestionAnswerFormProps) {
  return (
    <div className="space-y-6">
      {questions.map((question, index) => (
        <div key={question.id} className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex justify-between">
            <span className="text-sm font-semibold text-primary">#{index + 1}</span>
            <span className="text-xs text-muted-foreground">{question.points}</span>
          </div>
          <p className="mb-4 whitespace-pre-wrap font-medium">{question.text}</p>

          {question.type === "single" && (
            <div className="space-y-2">
              {question.options.map((option, optionIndex) => (
                <label key={optionIndex} className="flex items-center gap-2 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/30">
                  <input
                    type="radio"
                    name={question.id}
                    checked={answers[question.id] === optionIndex}
                    onChange={() => onChange({ ...answers, [question.id]: optionIndex })}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          )}

          {question.type === "multiple" && (
            <div className="space-y-2">
              {question.options.map((option, optionIndex) => {
                const current = Array.isArray(answers[question.id]) ? answers[question.id] as number[] : [];
                return (
                  <label key={optionIndex} className="flex items-center gap-2 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/30">
                    <Checkbox
                      checked={current.includes(optionIndex)}
                      onCheckedChange={(checked) => {
                        const next = checked === true
                          ? [...current, optionIndex]
                          : current.filter((value) => value !== optionIndex);
                        onChange({ ...answers, [question.id]: next });
                      }}
                    />
                    <span>{option}</span>
                  </label>
                );
              })}
            </div>
          )}

          {question.type === "text" && (
            <Input
              value={typeof answers[question.id] === "string" ? String(answers[question.id]) : ""}
              onChange={(event) => onChange({ ...answers, [question.id]: event.target.value })}
              maxLength={500}
            />
          )}
        </div>
      ))}
    </div>
  );
}
