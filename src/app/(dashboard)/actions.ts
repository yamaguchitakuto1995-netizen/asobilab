"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/requireRole";
import { createClient } from "@/lib/supabase/server";

export async function acknowledgeMakeupExpiryReminder(formData: FormData) {
  const auth = await requireAdminUser();
  if (!auth.ok) {
    redirect(`/?error=${encodeURIComponent(auth.error)}`);
  }

  const lessonId = String(formData.get("lesson_id") ?? "").trim();
  const returnDate = String(formData.get("return_date") ?? "").trim();

  if (!lessonId) redirect("/");

  const supabase = await createClient();
  const { error } = await supabase.from("makeup_expiry_acknowledgments").upsert(
    {
      lesson_id: lessonId,
      acknowledged_by: auth.user.id,
      acknowledged_at: new Date().toISOString(),
    },
    { onConflict: "lesson_id" }
  );

  if (error) {
    const qs = new URLSearchParams({ error: error.message });
    if (returnDate) qs.set("date", returnDate);
    redirect(`/?${qs.toString()}`);
  }

  revalidatePath("/");
  redirect(returnDate ? `/?date=${encodeURIComponent(returnDate)}` : "/");
}
