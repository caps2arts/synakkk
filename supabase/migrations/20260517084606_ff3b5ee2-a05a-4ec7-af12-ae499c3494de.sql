
-- Enums
CREATE TYPE public.app_role AS ENUM ('teacher', 'student');
CREATE TYPE public.question_type AS ENUM ('single', 'multiple', 'text');
CREATE TYPE public.violation_type AS ENUM ('tab_switch','window_blur','visibility_hidden','devtools','shortcut','inactivity','page_close');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  username TEXT UNIQUE,
  avatar_url TEXT,
  language TEXT NOT NULL DEFAULT 'ru',
  theme TEXT NOT NULL DEFAULT 'dark',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto-create profile + default student role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1))
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Courses
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Exams
CREATE TABLE public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL DEFAULT 30,
  max_attempts INT NOT NULL DEFAULT 1,
  shuffle_questions BOOLEAN NOT NULL DEFAULT true,
  max_violations INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

-- Questions
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  type public.question_type NOT NULL DEFAULT 'single',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct JSONB NOT NULL DEFAULT '[]'::jsonb,
  points INT NOT NULL DEFAULT 1,
  position INT NOT NULL DEFAULT 0
);
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- Assignments
CREATE TABLE public.exam_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)
);
ALTER TABLE public.exam_assignments ENABLE ROW LEVEL SECURITY;

-- Attempts
CREATE TABLE public.exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC,
  max_score NUMERIC,
  status TEXT NOT NULL DEFAULT 'in_progress',
  violation_count INT NOT NULL DEFAULT 0
);
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;

-- Violations
CREATE TABLE public.violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  type public.violation_type NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES

-- profiles
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Teachers view profiles of their students" ON public.profiles FOR SELECT USING (
  public.has_role(auth.uid(),'teacher') AND EXISTS (
    SELECT 1 FROM public.exam_assignments ea JOIN public.exams e ON e.id = ea.exam_id
    WHERE ea.student_id = profiles.id AND e.teacher_id = auth.uid()
  )
);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- user_roles
CREATE POLICY "View own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- courses
CREATE POLICY "Teachers manage own courses" ON public.courses FOR ALL USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Students view assigned courses" ON public.courses FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.exams e JOIN public.exam_assignments ea ON ea.exam_id = e.id
          WHERE e.course_id = courses.id AND ea.student_id = auth.uid())
);

-- exams
CREATE POLICY "Teachers manage own exams" ON public.exams FOR ALL USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Students view assigned exams" ON public.exams FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.exam_assignments ea WHERE ea.exam_id = exams.id AND ea.student_id = auth.uid())
);

-- questions
CREATE POLICY "Teachers manage own questions" ON public.questions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.exams e WHERE e.id = questions.exam_id AND e.teacher_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.exams e WHERE e.id = questions.exam_id AND e.teacher_id = auth.uid())
);
CREATE POLICY "Students view questions for assigned exams" ON public.questions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.exam_assignments ea WHERE ea.exam_id = questions.exam_id AND ea.student_id = auth.uid())
);

-- assignments
CREATE POLICY "Teachers manage assignments" ON public.exam_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_assignments.exam_id AND e.teacher_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_assignments.exam_id AND e.teacher_id = auth.uid())
);
CREATE POLICY "Students view own assignments" ON public.exam_assignments FOR SELECT USING (auth.uid() = student_id);

-- attempts
CREATE POLICY "Students manage own attempts" ON public.exam_attempts FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Teachers view attempts for own exams" ON public.exam_attempts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_attempts.exam_id AND e.teacher_id = auth.uid())
);

-- violations
CREATE POLICY "Students insert own violations" ON public.violations FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Students view own violations" ON public.violations FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Teachers view violations for own exams" ON public.violations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.exams e WHERE e.id = violations.exam_id AND e.teacher_id = auth.uid())
);
