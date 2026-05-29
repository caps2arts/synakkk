
REVOKE EXECUTE ON FUNCTION public.is_exam_teacher(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_assigned_to_exam(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_course_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_students(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_exam_teacher(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_exam(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_course_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_students(text) TO authenticated;
