import { supabase } from "@/integrations/supabase/client";

export const COURSE_ASSETS_BUCKET = "course-assets";

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export async function uploadCourseAsset(courseId: string, folder: string, file: File) {
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const safeName = sanitizeFileName(file.name.replace(/\.[^.]+$/, "")) || "asset";
  const path = `${courseId}/${folder}/${crypto.randomUUID()}-${safeName}.${extension}`;

  const { error } = await supabase.storage.from(COURSE_ASSETS_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });

  if (error) throw error;
  return path;
}

export async function getSignedCourseAssetUrl(path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(COURSE_ASSETS_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function getSignedCourseAssetUrls(paths: string[], expiresIn = 3600) {
  return Promise.all(paths.map((path) => getSignedCourseAssetUrl(path, expiresIn)));
}

export async function removeCourseAssets(paths: string[]) {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(COURSE_ASSETS_BUCKET).remove(paths);
  if (error) throw error;
}
