import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createEmptyQuestion, type AssessmentQuestionDraft, type AssessmentQuestionType } from "@/lib/assessments";
import { Plus, Trash2, X } from "lucide-react";

interface QuestionBuilderLabels {
  addQuestion: string;
  question: string;
  type: string;
  single: string;
  multiple: string;
  text: string;
  points: string;
  options: string;
  addOption: string;
  correctAnswer: string;
  correctText: string;
  selectOption: string;
  emptyOption: string;
  markOneAnswer: string;
}

interface QuestionBuilderProps {
  questions: AssessmentQuestionDraft[];
  onChange: (questions: AssessmentQuestionDraft[]) => void;
  labels: QuestionBuilderLabels;
}

export function QuestionBuilder({ questions, onChange, labels }: QuestionBuilderProps) {
  const updateQuestion = (index: number, patch: Partial<AssessmentQuestionDraft>) => {
    onChange(questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question));
  };

  const addQuestion = () => onChange([...questions, createEmptyQuestion()]);
  const removeQuestion = (index: number) => onChange(questions.filter((_, questionIndex) => questionIndex !== index));

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const nextOptions = [...questions[questionIndex].options];
    nextOptions[optionIndex] = value;
    updateQuestion(questionIndex, { options: nextOptions });
  };

  const addOption = (questionIndex: number) => {
    updateQuestion(questionIndex, { options: [...questions[questionIndex].options, ""] });
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const question = questions[questionIndex];
    updateQuestion(questionIndex, {
      options: question.options.filter((_, currentIndex) => currentIndex !== optionIndex),
      correct: question.correct
        .filter((value) => value !== optionIndex)
        .map((value) => value > optionIndex ? value - 1 : value),
    });
  };

  const setQuestionType = (questionIndex: number, type: AssessmentQuestionType) => {
    updateQuestion(questionIndex, {
      type,
      options: type === "text" ? [] : questions[questionIndex].options.length ? questions[questionIndex].options : ["", ""],
      correct: [],
      correctText: "",
    });
  };

  const toggleCorrect = (questionIndex: number, optionIndex: number, checked: boolean) => {
    const question = questions[questionIndex];
    if (question.type === "single") {
      updateQuestion(questionIndex, { correct: checked ? [optionIndex] : [] });
      return;
    }

    const correct = checked
      ? [...question.correct, optionIndex]
      : question.correct.filter((value) => value !== optionIndex);

    updateQuestion(questionIndex, { correct: Array.from(new Set(correct)).sort((left, right) => left - right) });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">{labels.addQuestion}</h3>
        <Button type="button" onClick={addQuestion} size="sm" variant="outline">
          <Plus className="w-4 h-4 mr-1" />
          {labels.addQuestion}
        </Button>
      </div>

      {questions.map((question, questionIndex) => (
        <div key={`${questionIndex}-${question.type}`} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-primary">#{questionIndex + 1}</span>
            {questions.length > 1 && (
              <Button type="button" size="icon" variant="ghost" onClick={() => removeQuestion(questionIndex)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>

          <div>
            <Label>{labels.question}</Label>
            <Textarea
              value={question.text}
              onChange={(event) => updateQuestion(questionIndex, { text: event.target.value })}
              maxLength={500}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>{labels.type}</Label>
              <Select value={question.type} onValueChange={(value) => setQuestionType(questionIndex, value as AssessmentQuestionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">{labels.single}</SelectItem>
                  <SelectItem value="multiple">{labels.multiple}</SelectItem>
                  <SelectItem value="text">{labels.text}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{labels.points}</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={question.points}
                onChange={(event) => updateQuestion(questionIndex, { points: Number(event.target.value) || 1 })}
              />
            </div>
          </div>

          {question.type === "text" ? (
            <div>
              <Label>{labels.correctText}</Label>
              <Input
                value={question.correctText}
                onChange={(event) => updateQuestion(questionIndex, { correctText: event.target.value })}
                maxLength={500}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{labels.options}</Label>
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-2">
                    <span className="w-6 text-center text-xs text-muted-foreground">{optionIndex + 1}.</span>
                    <Input
                      value={option}
                      onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)}
                      placeholder={`${labels.options} ${optionIndex + 1}`}
                    />
                    {question.options.length > 2 && (
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeOption(questionIndex, optionIndex)}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => addOption(questionIndex)}>
                  <Plus className="w-3 h-3 mr-1" />
                  {labels.addOption}
                </Button>
              </div>

              <div className="space-y-2">
                <Label>{labels.correctAnswer}</Label>
                {question.type === "single" ? (
                  <Select
                    value={question.correct[0] !== undefined ? String(question.correct[0]) : "placeholder"}
                    onValueChange={(value) => updateQuestion(questionIndex, { correct: value === "placeholder" ? [] : [Number(value)] })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={labels.selectOption} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="placeholder">{labels.selectOption}</SelectItem>
                      {question.options.map((option, optionIndex) => (
                        <SelectItem key={optionIndex} value={String(optionIndex)} disabled={!option.trim()}>
                          {option.trim() ? `${optionIndex + 1}. ${option.trim()}` : `${optionIndex + 1}. ${labels.emptyOption}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded-md border border-input p-3 space-y-2">
                    {question.options.map((option, optionIndex) => (
                      <label key={optionIndex} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={question.correct.includes(optionIndex)}
                          onCheckedChange={(checked) => toggleCorrect(questionIndex, optionIndex, checked === true)}
                          disabled={!option.trim()}
                        />
                        <span>{option.trim() ? `${optionIndex + 1}. ${option.trim()}` : `${optionIndex + 1}. ${labels.emptyOption}`}</span>
                      </label>
                    ))}
                    {question.correct.length === 0 && <p className="text-xs text-destructive">{labels.markOneAnswer}</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
