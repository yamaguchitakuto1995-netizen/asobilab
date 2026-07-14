import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminOnlyPath } from "@/lib/access";

/**
 * 認証なしでアクセス可能なパス。
 * - /apply: 保護者向け 振替申請フォーム
 * - /api/availability: 振替枠の空き状況 API (保護者フォームから直接 fetch)
 * - /studio, /api/studio: Wan 2.2（RunPod）Kling風ビデオスタジオ
 */
const PUBLIC_PATHS = [
  "/login",
  "/auth",
  "/apply",
  "/schedule",
  "/api/availability",
  "/studio",
  "/api/studio",
];

function missingEnvResponse(): NextResponse {
  const jp =
    "【設定不足】Vercel の Environment Variables に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY がないか、保存後に再デプロイされていません。\n" +
    "Vercel → プロジェクト → Settings → Environment Variables で両方を設定し、Production にチェック → Save のあと Deployments から Redeploy してください。";
  return new NextResponse(jp, {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  // Vercel で env 未設定だと createServerClient が throw し MIDDLEWARE_INVOCATION_FAILED になる
  if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
    if (isPublic) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "MISSING_SUPABASE_ENV",
          message:
            "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on Vercel, then Redeploy.",
        },
        { status: 503 }
      );
    }
    return missingEnvResponse();
  }

  let response = NextResponse.next({ request });

  let supabase;
  try {
    supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });
  } catch (e) {
    console.error("[middleware] createServerClient failed", e);
    if (isPublic) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "SUPABASE_CLIENT_ERROR" }, { status: 503 });
    }
    return missingEnvResponse();
  }

  let user;
  try {
    const out = await supabase.auth.getUser();
    user = out.data.user;
  } catch (e) {
    console.error("[middleware] supabase.auth.getUser failed", e);
    if (isPublic) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "AUTH_MIDDLEWARE_ERROR" }, { status: 503 });
    }
    return new NextResponse(
      "サーバーでセッション確認に失敗しました。しばらく待って再読み込みするか、環境変数・Supabase の状態を確認してください。",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && isAdminOnlyPath(pathname)) {
    const { data: profile } = await supabase
      .from("teacher_profiles")
      .select("is_admin, account_role")
      .eq("id", user.id)
      .maybeSingle<{ is_admin: boolean; account_role: string }>();

    if (profile?.account_role === "staff" && !profile.is_admin) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
