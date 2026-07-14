import { NextResponse } from "next/server";
import {
  buildHeuristicPlan,
  buildLlmPlan,
} from "@/lib/studio/scriptPlan";
import type {
  DurationSeconds,
  ScriptPlanRequest,
  ScriptPlanResponse,
} from "@/lib/studio/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function isDuration(v: unknown): v is DurationSeconds {
  return v === 5 || v === 10;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" } satisfies ScriptPlanResponse,
      { status: 400 }
    );
  }

  const b = body as Partial<ScriptPlanRequest>;
  const script = typeof b.script === "string" ? b.script.trim() : "";
  if (script.length < 20) {
    return NextResponse.json(
      {
        ok: false,
        error: "SCRIPT_TOO_SHORT",
        detail: "脚本は20文字以上入れてください。",
      } satisfies ScriptPlanResponse,
      { status: 400 }
    );
  }

  const style =
    typeof b.style === "string" && b.style.trim()
      ? b.style.trim()
      : "cinematic, film lighting, 35mm look";
  const maxScenes =
    typeof b.maxScenes === "number" && Number.isFinite(b.maxScenes)
      ? Math.min(Math.max(Math.round(b.maxScenes), 2), 12)
      : 6;
  const defaultDurationSeconds = isDuration(b.defaultDurationSeconds)
    ? b.defaultDurationSeconds
    : 5;

  const apiKey = process.env.STUDIO_LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  const baseUrl = process.env.STUDIO_LLM_BASE_URL?.trim();
  const model = process.env.STUDIO_LLM_MODEL?.trim();

  if (apiKey) {
    try {
      const llm = await buildLlmPlan({
        script,
        style,
        maxScenes,
        defaultDurationSeconds,
        apiKey,
        baseUrl,
        model,
      });
      if (llm?.scenes.length) {
        return NextResponse.json({
          ok: true,
          title: llm.title,
          style: llm.style,
          scenes: llm.scenes,
          planner: "llm",
        } satisfies ScriptPlanResponse);
      }
    } catch (e) {
      console.error("[script-plan] LLM failed, falling back", e);
    }
  }

  const plan = buildHeuristicPlan({
    script,
    style,
    maxScenes,
    defaultDurationSeconds,
  });

  if (!plan.scenes.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "NO_SCENES",
        detail: "脚本からシーンを分割できませんでした。改行やシーン見出しを入れてください。",
      } satisfies ScriptPlanResponse,
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    title: plan.title,
    style: plan.style,
    scenes: plan.scenes,
    planner: "heuristic",
  } satisfies ScriptPlanResponse);
}
