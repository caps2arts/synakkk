
-- Security definer helpers to break RLS recursion
CREATE OR REPLACE FUNCTION public.is_exam_teacher(_exam_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.exams WHERE id=_exam_id AND teacher_id=_user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_to_exam(_exam_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.exam_assignments WHERE exam_id=_exam_id AND student_id=_user_id)
$$;

CREATE OR REPLACE FUNCTION public.has_course_access(_course_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.exams e
    JOIN public.exam_assignments ea ON ea.exam_id=e.id
    WHERE e.course_id=_course_id AND ea.student_id=_user_id
  )
$$;

-- Replace recursive policies on exams
DROP POLICY IF EXISTS "Students view assigned exams" ON public.exams;
CREATE POLICY "Students view assigned exams" ON public.exams FOR SELECT
  USING (public.is_assigned_to_exam(id, auth.uid()));

-- Replace recursive policies on exam_assignments
DROP POLICY IF EXISTS "Teachers manage assignments" ON public.exam_assignments;
CREATE POLICY "Teachers manage assignments" ON public.exam_assignments FOR ALL
  USING (public.is_exam_teacher(exam_id, auth.uid()))
  WITH CHECK (public.is_exam_teacher(exam_id, auth.uid()));

-- Replace recursive policies on questions
DROP POLICY IF EXISTS "Students view questions for assigned exams" ON public.questions;
CREATE POLICY "Students view questions for assigned exams" ON public.questions FOR SELECT
  USING (public.is_assigned_to_exam(exam_id, auth.uid()));

DROP POLICY IF EXISTS "Teachers manage own questions" ON public.questions;
CREATE POLICY "Teachers manage own questions" ON public.questions FOR ALL
  USING (public.is_exam_teacher(exam_id, auth.uid()))
  WITH CHECK (public.is_exam_teacher(exam_id, auth.uid()));

-- Replace recursive policy on courses
DROP POLICY IF EXISTS "Students view assigned courses" ON public.courses;
CREATE POLICY "Students view assigned courses" ON public.courses FOR SELECT
  USING (public.has_course_access(id, auth.uid()));

-- Replace recursive policy on exam_attempts for teachers
DROP POLICY IF EXISTS "Teachers view attempts for own exams" ON public.exam_attempts;
CREATE POLICY "Teachers view attempts for own exams" ON public.exam_attempts FOR SELECT
  USING (public.is_exam_teacher(exam_id, auth.uid()));

-- Replace recursive policy on violations for teachers
DROP POLICY IF EXISTS "Teachers view violations for own exams" ON public.violations;
CREATE POLICY "Teachers view violations for own exams" ON public.violations FOR SELECT
  USING (public.is_exam_teacher(exam_id, auth.uid()));

-- Function to search students by name/username (teachers only)
CREATE OR REPLACE FUNCTION public.search_students(_query text)
RETURNS TABLE(id uuid, full_name text, username text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id, p.full_name, p.username
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role='student'
  WHERE public.has_role(auth.uid(), 'teacher')
    AND (
      coalesce(p.full_name,'') ILIKE '%'||_query||'%'
      OR coalesce(p.username,'') ILIKE '%'||_query||'%'
    )
  ORDER BY p.full_name NULLS LAST
  LIMIT 20
$$;
