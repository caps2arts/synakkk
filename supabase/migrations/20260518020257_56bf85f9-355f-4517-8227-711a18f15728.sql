
DROP POLICY IF EXISTS "Students view assigned exams" ON public.exams;
CREATE POLICY "Students view assigned exams" ON public.exams
FOR SELECT USING (
  public.is_assigned_to_exam(id, auth.uid())
  OR (course_id IS NOT NULL AND public.has_course_access(course_id, auth.uid()))
);

DROP POLICY IF EXISTS "Students view questions for assigned exams" ON public.questions;
CREATE POLICY "Students view questions for assigned exams" ON public.questions
FOR SELECT USING (
  public.is_assigned_to_exam(exam_id, auth.uid())
  OR EXISTS (SELECT 1 FROM public.exams e WHERE e.id = questions.exam_id AND e.course_id IS NOT NULL AND public.has_course_access(e.course_id, auth.uid()))
);
