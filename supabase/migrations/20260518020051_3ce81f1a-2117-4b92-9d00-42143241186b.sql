
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.course_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  student_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id)
);

ALTER TABLE public.course_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_course_teacher(_course_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.courses WHERE id=_course_id AND teacher_id=_user_id)
$$;

CREATE POLICY "Teachers manage course assignments" ON public.course_assignments
FOR ALL USING (public.is_course_teacher(course_id, auth.uid()))
WITH CHECK (public.is_course_teacher(course_id, auth.uid()));

CREATE POLICY "Students view own course assignments" ON public.course_assignments
FOR SELECT USING (auth.uid() = student_id);

CREATE OR REPLACE FUNCTION public.has_course_access(_course_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.courses WHERE id=_course_id AND (is_public OR teacher_id=_user_id))
  OR EXISTS(SELECT 1 FROM public.course_assignments WHERE course_id=_course_id AND student_id=_user_id)
  OR EXISTS(SELECT 1 FROM public.exams e JOIN public.exam_assignments ea ON ea.exam_id=e.id WHERE e.course_id=_course_id AND ea.student_id=_user_id)
$$;
