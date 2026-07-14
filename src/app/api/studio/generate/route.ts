import { NextResponse } from "next/server";
import type {
  AspectRatio,
  DurationSeconds,
  QualityPreset,
  StudioGenerateRequest,
  StudioGenerateResponse,
  StudioJob,
} from "@/lib/studio/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function isMode(v: unknown): v is StudioGenerateRequest["mode"] {
  return v === "t2v" || v === "i2v";
}

function isAspect(v: unknown): v is AspectRatio {
  return v === "16:9" || v === "9:16" || v === "1:1";
}

function isDuration(v: unknown): v is DurationSeconds {
  return v === 5 || v === 10;
}

function isQuality(v: unknown): v is QualityPreset {
  return v === "standard" || v === "pro";
}

function resolutionPreset(
  aspect: AspectRatio,
  quality: QualityPreset
): string {
  if (quality === "pro") {
    if (aspect === "9:16") return "720p_vertical";
    if (aspect === "1:1") return "720p_square";
    return "720p";
  }
  if (aspect === "9:16") return "480p_vertical";
  if (aspect === "1:1") return "480p_square";
  return "480p";
}

function stripDataUrl(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

function makeJob(
  partial: Omit<StudioJob, "id" | "createdAt" | "status"> &
    Partial<Pick<StudioJob, "status" | "videoUrl" | "error" | "mock">>
): StudioJob {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: partial.status ?? "completed",
    mode: partial.mode,
    prompt: partial.prompt,
    aspectRatio: partial.aspectRatio,
    durationSeconds: partial.durationSeconds,
    quality: partial.quality,
    videoUrl: partial.videoUrl ?? null,
    error: partial.error ?? null,
    mock: partial.mock,
  };
}

async function callRunPod(
  body: StudioGenerateRequest
): Promise<StudioGenerateResponse> {
  const endpoint = process.env.RUNPOD_WAN_ENDPOINT_ID?.trim();
  const apiKey = process.env.RUNPOD_API_KEY?.trim();

  if (!endpoint || !apiKey) {
    return {
      ok: false,
      error: "MISSING_RUNPOD_ENV",
      detail:
        "RUNPOD_API_KEY と RUNPOD_WAN_ENDPOINT_ID を .env.local に設定してください。",
    };
  }

  const input: Record<string, unknown> = {
    prompt: body.prompt,
    negative_prompt: body.negativePrompt ?? "",
    resolution_preset: resolutionPreset(body.aspectRatio, body.quality),
    duration_seconds: body.durationSeconds,
    fps: 24,
    guidance_scale: body.quality === "pro" ? 5.5 : 4.5,
    num_inference_steps: body.quality === "pro" ? 40 : 28,
  };

  if (body.mode === "i2v") {
    if (!body.imageDataUrl) {
      return { ok: false, error: "IMAGE_REQUIRED", detail: "I2V には開始フレーム画像が必要です。" };
    }
    input.image = stripDataUrl(body.imageDataUrl);
  }

  const url = `https://api.runpod.ai/v2/${endpoint}/runsync`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });

  const raw = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!res.ok) {
    return {
      ok: false,
      error: "RUNPOD_HTTP_ERROR",
      detail:
        (raw && typeof raw.error === "string" && raw.error) ||
        `RunPod HTTP ${res.status}`,
    };
  }

  const status = typeof raw?.status === "string" ? raw.status : "";
  const output = (raw?.output ?? null) as Record<string, unknown> | string | null;

  let videoUrl: string | null = null;
  if (typeof output === "string" && /^https?:\/\//.test(output)) {
    videoUrl = output;
  } else if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (typeof o.video_url === "string") videoUrl = o.video_url;
    else if (typeof o.video === "string") {
      videoUrl = o.video.startsWith("http")
        ? o.video
        : `data:video/mp4;base64,${o.video}`;
    } else if (typeof o.output === "string") {
      videoUrl = o.output.startsWith("http")
        ? o.output
        : `data:video/mp4;base64,${o.output}`;
    }
  }

  if (status === "FAILED" || (!videoUrl && status !== "COMPLETED" && status !== "IN_PROGRESS")) {
    const err =
      (raw && typeof raw.error === "string" && raw.error) ||
      (output &&
        typeof output === "object" &&
        typeof (output as { error?: unknown }).error === "string" &&
        (output as { error: string }).error) ||
      "RunPod 生成に失敗しました";
    return { ok: false, error: "GENERATION_FAILED", detail: String(err) };
  }

  if (!videoUrl) {
    return {
      ok: false,
      error: "NO_VIDEO",
      detail: "RunPod から動画 URL が返りませんでした。エンドポイントの出力形式を確認してください。",
    };
  }

  return {
    ok: true,
    job: makeJob({
      mode: body.mode,
      prompt: body.prompt,
      aspectRatio: body.aspectRatio,
      durationSeconds: body.durationSeconds,
      quality: body.quality,
      status: "completed",
      videoUrl,
    }),
  };
}

function mockJob(body: StudioGenerateRequest): StudioGenerateResponse {
  // デモ用: 公開サンプル動画で UI を確認できるようにする
  const sampleByAspect: Record<AspectRatio, string> = {
    "16:9": "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    "9:16": "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    "1:1": "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  };

  return {
    ok: true,
    job: makeJob({
      mode: body.mode,
      prompt: body.prompt,
      aspectRatio: body.aspectRatio,
      durationSeconds: body.durationSeconds,
      quality: body.quality,
      status: "completed",
      videoUrl: sampleByAspect[body.aspectRatio],
      mock: true,
    }),
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" } satisfies StudioGenerateResponse,
      { status: 400 }
    );
  }

  const b = body as Partial<StudioGenerateRequest>;
  if (!isMode(b.mode) || typeof b.prompt !== "string" || !b.prompt.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error: "INVALID_INPUT",
        detail: "mode と prompt は必須です。",
      } satisfies StudioGenerateResponse,
      { status: 400 }
    );
  }
  if (!isAspect(b.aspectRatio) || !isDuration(b.durationSeconds) || !isQuality(b.quality)) {
    return NextResponse.json(
      {
        ok: false,
        error: "INVALID_SETTINGS",
        detail: "aspectRatio / durationSeconds / quality が不正です。",
      } satisfies StudioGenerateResponse,
      { status: 400 }
    );
  }

  const payload: StudioGenerateRequest = {
    mode: b.mode,
    prompt: b.prompt.trim(),
    negativePrompt: typeof b.negativePrompt === "string" ? b.negativePrompt : "",
    aspectRatio: b.aspectRatio,
    durationSeconds: b.durationSeconds,
    quality: b.quality,
    imageDataUrl: typeof b.imageDataUrl === "string" ? b.imageDataUrl : null,
  };

  if (payload.mode === "i2v" && !payload.imageDataUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "IMAGE_REQUIRED",
        detail: "Image to Video では開始フレームをアップロードしてください。",
      } satisfies StudioGenerateResponse,
      { status: 400 }
    );
  }

  const allowMock = process.env.STUDIO_ALLOW_MOCK !== "false";
  const hasRunPod =
    Boolean(process.env.RUNPOD_API_KEY?.trim()) &&
    Boolean(process.env.RUNPOD_WAN_ENDPOINT_ID?.trim());

  try {
    if (!hasRunPod) {
      if (!allowMock) {
        return NextResponse.json(
          {
            ok: false,
            error: "MISSING_RUNPOD_ENV",
            detail:
              "RUNPOD_API_KEY と RUNPOD_WAN_ENDPOINT_ID を設定するか、STUDIO_ALLOW_MOCK=true にしてください。",
          } satisfies StudioGenerateResponse,
          { status: 503 }
        );
      }
      // 擬似レイテンシで生成感を出す
      await new Promise((r) => setTimeout(r, 1600));
      return NextResponse.json(mockJob(payload));
    }

    const result = await callRunPod(payload);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      {
        ok: false,
        error: "SERVER_ERROR",
        detail: message,
      } satisfies StudioGenerateResponse,
      { status: 500 }
    );
  }
}
