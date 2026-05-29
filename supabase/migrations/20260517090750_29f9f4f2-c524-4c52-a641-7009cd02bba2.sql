
CREATE TABLE public.course_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('lecture','presentation','exercise')),
  title text NOT NULL,
  content text,
  url text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own course materials" ON public.course_materials
  FOR ALL USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id=course_id AND c.teacher_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.courses c WHERE c.id=course_id AND c.teacher_id=auth.uid()));

CREATE POLICY "Students view materials of assigned courses" ON public.course_materials
  FOR SELECT USING (public.has_course_access(course_id, auth.uid()));
