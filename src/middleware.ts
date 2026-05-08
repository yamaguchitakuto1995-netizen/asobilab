import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * _next 配下（静的チャンク・CSS・HMR など）はミドルウェアを通さない。
     * ここを狭すぎると開発中にチャンク読み込みが壊れ、スタイルが当たらないことがある。
     */
    "/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
