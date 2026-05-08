import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidDate } from "@/lib/date";
import type { SlotAvailability } from "@/lib/types";

/**
 * 公開 API: GET /api/availability?date=YYYY-MM-DD
 * 指定日の振替枠の空き状況を返す。Realtime とポーリングの両方から呼ばれる。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");

  if (!isValidDate(date)) {
    return NextResponse.json(
      { error: "date は YYYY-MM-DD 形式で指定してください。" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_makeup_availability", {
    target_date: date,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    date,
    slots: (data ?? []) as SlotAvailability[],
  });
}
