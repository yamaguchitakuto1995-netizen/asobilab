"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AspectRatio,
  DurationSeconds,
  QualityPreset,
  ScriptPlanResponse,
  ScriptScene,
  StudioGenerateResponse,
  StudioJob,
  StudioMode,
} from "@/lib/studio/types";

const ASPECTS: { id: AspectRatio; label: string }[] = [
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "1:1", label: "1:1" },
];

const DURATIONS: DurationSeconds[] = [5, 10];

const SAMPLE_SCRIPT = `タイトル: 朝の港

夜明けの港。霧が薄く立ち込め、漁船の灯りが揺れている。

若い女性が岸壁を歩き、カメラに向かって振り返る。風で髪が揺れる。

彼女はマグカップを両手で持ち、湯気を見つめる。遠くでカモメが飛ぶ。

最後に太陽が雲の隙間から差し込み、港全体が金色に染まる。`;

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

async function generateClip(input: {
  prompt: string;
  negativePrompt: string;
  aspectRatio: AspectRatio;
  durationSeconds: DurationSeconds;
  quality: QualityPreset;
  mode?: "t2v" | "i2v";
  imageDataUrl?: string | null;
}): Promise<StudioGenerateResponse> {
  const res = await fetch("/api/studio/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: input.mode ?? "t2v",
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      aspectRatio: input.aspectRatio,
      durationSeconds: input.durationSeconds,
      quality: input.quality,
      imageDataUrl: input.imageDataUrl ?? null,
    }),
  });
  return (await res.json()) as StudioGenerateResponse;
}

export default function StudioApp() {
  const [mode, setMode] = useState<StudioMode>("script");
  const [script, setScript] = useState(SAMPLE_SCRIPT);
  const [style, setStyle] = useState(
    "cinematic photorealistic, soft dawn light, film grain"
  );
  const [projectTitle, setProjectTitle] = useState("");
  const [scenes, setScenes] = useState<ScriptScene[]>([]);
  const [planner, setPlanner] = useState<"heuristic" | "llm" | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState(
    "blurry, low quality, distorted, watermark, text overlay, subtitles"
  );
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [durationSeconds, setDurationSeconds] = useState<DurationSeconds>(5);
  const [quality, setQuality] = useState<QualityPreset>("standard");
  const [maxScenes, setMaxScenes] = useState(6);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);

  const [planning, setPlanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  const activeScene = useMemo(
    () => scenes.find((s) => s.id === activeSceneId) ?? scenes[0] ?? null,
    [scenes, activeSceneId]
  );

  const activeJob = useMemo(
    () => jobs.find((j) => j.id === activeJobId) ?? jobs[0] ?? null,
    [jobs, activeJobId]
  );

  const previewVideoUrl =
    mode === "script" ? activeScene?.videoUrl : activeJob?.videoUrl;

  useEffect(() => {
    try {
      const raw = localStorage.getItem("wan-studio-script-v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        script?: string;
        style?: string;
        scenes?: ScriptScene[];
        projectTitle?: string;
      };
      if (parsed.script) setScript(parsed.script);
      if (parsed.style) setStyle(parsed.style);
      if (parsed.projectTitle) setProjectTitle(parsed.projectTitle);
      if (Array.isArray(parsed.scenes)) {
        setScenes(parsed.scenes);
        setActiveSceneId(parsed.scenes[0]?.id ?? null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "wan-studio-script-v1",
        JSON.stringify({ script, style, scenes, projectTitle })
      );
    } catch {
      /* ignore */
    }
  }, [script, style, scenes, projectTitle]);

  async function onPickImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選択してください");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setImageDataUrl(dataUrl);
    setImageName(file.name);
    setError(null);
  }

  async function onPlanScript() {
    setPlanning(true);
    setError(null);
    setProgress(null);
    try {
      const res = await fetch("/api/studio/script-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          style,
          maxScenes,
          defaultDurationSeconds: durationSeconds,
        }),
      });
      const data = (await res.json()) as ScriptPlanResponse;
      if (!data.ok) {
        setError(data.detail || data.error);
        return;
      }
      setProjectTitle(data.title);
      setScenes(data.scenes);
      setPlanner(data.planner);
      setActiveSceneId(data.scenes[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "シーン分割に失敗しました");
    } finally {
      setPlanning(false);
    }
  }

  function updateScene(id: string, patch: Partial<ScriptScene>) {
    setScenes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  async function generateOneScene(scene: ScriptScene) {
    updateScene(scene.id, { status: "running", error: null });
    const data = await generateClip({
      prompt: scene.visualPrompt,
      negativePrompt,
      aspectRatio,
      durationSeconds: scene.durationSeconds,
      quality,
      mode: "t2v",
    });
    if (!data.ok) {
      updateScene(scene.id, {
        status: "failed",
        error: data.detail || data.error,
      });
      return false;
    }
    updateScene(scene.id, {
      status: "completed",
      videoUrl: data.job.videoUrl,
      jobId: data.job.id,
      error: null,
    });
    const scriptJob: StudioJob = {
      ...data.job,
      mode: "script-scene",
      sceneIndex: scene.index,
    };
    setJobs((prev) => [scriptJob, ...prev].slice(0, 40));
    setActiveSceneId(scene.id);
    return true;
  }

  async function onGenerateAllScenes() {
    if (!scenes.length) {
      setError("先に「シーン分割」を実行してください");
      return;
    }
    abortRef.current = false;
    setGenerating(true);
    setError(null);

    for (let i = 0; i < scenes.length; i++) {
      if (abortRef.current) break;
      const scene = scenes[i];
      setProgress(`Scene ${i + 1}/${scenes.length}: ${scene.title}`);
      setActiveSceneId(scene.id);
      // re-read latest prompt from state via functional update path
      const latest =
        (await new Promise<ScriptScene | undefined>((resolve) => {
          setScenes((prev) => {
            resolve(prev.find((s) => s.id === scene.id));
            return prev;
          });
        })) ?? scene;
      await generateOneScene(latest);
    }

    setProgress(null);
    setGenerating(false);
  }

  async function onGenerateSingle() {
    if (!prompt.trim()) {
      setError("プロンプトを入力してください");
      return;
    }
    if (mode === "i2v" && !imageDataUrl) {
      setError("Image to Video では開始フレームをアップロードしてください");
      return;
    }

    setGenerating(true);
    setError(null);
    setProgress("Generating…");
    try {
      const data = await generateClip({
        mode: mode === "i2v" ? "i2v" : "t2v",
        prompt: prompt.trim(),
        negativePrompt,
        aspectRatio,
        durationSeconds,
        quality,
        imageDataUrl: mode === "i2v" ? imageDataUrl : null,
      });
      if (!data.ok) {
        setError(data.detail || data.error);
        return;
      }
      setJobs((prev) => [data.job, ...prev].slice(0, 40));
      setActiveJobId(data.job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラー");
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  }

  const completedCount = scenes.filter((s) => s.status === "completed").length;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <div className="studio-display flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--studio-accent)] to-[var(--studio-accent-2)] text-sm font-bold text-black">
            W
          </div>
          <div>
            <p className="studio-display text-lg font-semibold leading-none">
              Wan Studio
            </p>
            <p className="mt-1 text-xs text-[var(--studio-muted)]">
              Script → Scenes → Wan 2.2 on RunPod
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-xs text-[var(--studio-muted)] sm:flex">
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
            Vidu-style script pipeline
          </span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1500px] flex-1 gap-4 p-3 md:grid-cols-[minmax(340px,460px)_1fr] md:gap-5 md:p-5">
        <section className="studio-rise flex flex-col rounded-2xl border border-white/10 bg-[var(--studio-panel)]/90 backdrop-blur-sm">
          <div className="grid grid-cols-3 gap-1 border-b border-white/10 p-2">
            {(
              [
                ["script", "Script"],
                ["t2v", "Text"],
                ["i2v", "Image"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cx(
                  "rounded-xl px-2 py-2.5 text-sm font-medium transition",
                  mode === id
                    ? "bg-white text-black"
                    : "text-[var(--studio-muted)] hover:bg-white/5 hover:text-white"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="studio-scroll flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            {mode === "script" ? (
              <>
                <div>
                  <div className="mb-2 flex items-end justify-between">
                    <label className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--studio-muted)]">
                      Script
                    </label>
                    <button
                      type="button"
                      className="text-[11px] text-[var(--studio-accent)] hover:underline"
                      onClick={() => setScript(SAMPLE_SCRIPT)}
                    >
                      Load sample
                    </button>
                  </div>
                  <textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    className="min-h-[200px] w-full resize-y rounded-2xl border border-white/10 bg-[var(--studio-panel-2)] px-3.5 py-3 text-sm leading-relaxed text-white outline-none ring-[var(--studio-accent)] placeholder:text-white/30 focus:ring-1"
                    placeholder="脚本を貼り付けてください。空行や「シーン1」でカットが分かれます。"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-[var(--studio-muted)]">
                    Visual style
                  </label>
                  <input
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[var(--studio-panel-2)] px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-[var(--studio-accent)]"
                    placeholder="cinematic, anime, documentary…"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--studio-muted)]">
                      Max scenes
                    </p>
                    <input
                      type="number"
                      min={2}
                      max={12}
                      value={maxScenes}
                      onChange={(e) =>
                        setMaxScenes(
                          Math.min(12, Math.max(2, Number(e.target.value) || 6))
                        )
                      }
                      className="w-full rounded-xl border border-white/10 bg-[var(--studio-panel-2)] px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-[var(--studio-accent)]"
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--studio-muted)]">
                      Shot length
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {DURATIONS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDurationSeconds(d)}
                          className={cx(
                            "rounded-xl border px-2 py-2 text-sm transition",
                            durationSeconds === d
                              ? "border-[var(--studio-accent)] bg-[var(--studio-accent)]/15 text-white"
                              : "border-white/10 text-[var(--studio-muted)]"
                          )}
                        >
                          {d}s
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <SettingsBlock
                  aspectRatio={aspectRatio}
                  setAspectRatio={setAspectRatio}
                  quality={quality}
                  setQuality={setQuality}
                />

                {scenes.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--studio-muted)]">
                        Storyboard · {completedCount}/{scenes.length}
                        {planner ? ` · ${planner}` : ""}
                      </p>
                      {projectTitle && (
                        <span className="max-w-[50%] truncate text-[11px] text-white/50">
                          {projectTitle}
                        </span>
                      )}
                    </div>
                    {scenes.map((scene) => (
                      <article
                        key={scene.id}
                        className={cx(
                          "rounded-2xl border p-3 transition",
                          activeSceneId === scene.id
                            ? "border-[var(--studio-accent)] bg-[var(--studio-accent)]/5"
                            : "border-white/10 bg-[var(--studio-panel-2)]"
                        )}
                      >
                        <button
                          type="button"
                          className="mb-2 flex w-full items-center justify-between text-left"
                          onClick={() => setActiveSceneId(scene.id)}
                        >
                          <span className="studio-display text-sm font-semibold">
                            {scene.index + 1}. {scene.title}
                          </span>
                          <StatusPill status={scene.status} />
                        </button>
                        <textarea
                          value={scene.visualPrompt}
                          onChange={(e) =>
                            updateScene(scene.id, {
                              visualPrompt: e.target.value,
                            })
                          }
                          className="min-h-[72px] w-full resize-y rounded-xl border border-white/10 bg-black/20 px-2.5 py-2 text-xs leading-relaxed text-white/90 outline-none focus:ring-1 focus:ring-[var(--studio-accent)]"
                        />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-[var(--studio-muted)]">
                            {scene.camera}
                          </span>
                          <button
                            type="button"
                            disabled={generating}
                            onClick={async () => {
                              setGenerating(true);
                              setProgress(`Scene ${scene.index + 1}`);
                              await generateOneScene(scene);
                              setGenerating(false);
                              setProgress(null);
                            }}
                            className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-white/80 hover:bg-white/5 disabled:opacity-40"
                          >
                            Regen
                          </button>
                        </div>
                        {scene.error && (
                          <p className="mt-2 text-[11px] text-[#ffb3bb]">
                            {scene.error}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {mode === "i2v" && (
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-[var(--studio-muted)]">
                      Start Frame
                    </label>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className={cx(
                        "flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/15 bg-[var(--studio-panel-2)] transition hover:border-[var(--studio-accent)]/60",
                        imageDataUrl ? "aspect-video p-0" : "min-h-[140px] p-6"
                      )}
                    >
                      {imageDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imageDataUrl}
                          alt="Start frame"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <>
                          <span className="studio-display text-base font-semibold">
                            Upload start image
                          </span>
                          <span className="mt-1 text-xs text-[var(--studio-muted)]">
                            PNG / JPG
                          </span>
                        </>
                      )}
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        onPickImage(e.target.files?.[0] ?? null)
                      }
                    />
                    {imageName && (
                      <button
                        type="button"
                        className="mt-2 text-xs text-[var(--studio-accent)]"
                        onClick={() => {
                          setImageDataUrl(null);
                          setImageName(null);
                        }}
                      >
                        Clear · {imageName}
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-[var(--studio-muted)]">
                    Prompt
                  </label>
                  <textarea
                    value={prompt}
                    maxLength={2500}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="min-h-[140px] w-full resize-y rounded-2xl border border-white/10 bg-[var(--studio-panel-2)] px-3.5 py-3 text-sm leading-relaxed text-white outline-none focus:ring-1 focus:ring-[var(--studio-accent)]"
                    placeholder="1カット分の映像を具体的に書いてください"
                  />
                </div>

                <SettingsBlock
                  aspectRatio={aspectRatio}
                  setAspectRatio={setAspectRatio}
                  quality={quality}
                  setQuality={setQuality}
                  durations
                  durationSeconds={durationSeconds}
                  setDurationSeconds={setDurationSeconds}
                />
              </>
            )}

            <details className="rounded-2xl border border-white/10 bg-[var(--studio-panel-2)] px-3 py-2">
              <summary className="cursor-pointer select-none text-sm text-[var(--studio-muted)]">
                Negative prompt
              </summary>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                className="mt-2 min-h-[64px] w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-[var(--studio-accent)]"
              />
            </details>
          </div>

          <div className="space-y-2 border-t border-white/10 p-4">
            {error && (
              <p className="rounded-xl border border-[var(--studio-danger)]/30 bg-[var(--studio-danger)]/10 px-3 py-2 text-sm text-[#ffb3bb]">
                {error}
              </p>
            )}
            {progress && (
              <p className="text-center text-xs text-[var(--studio-accent-2)]">
                {progress}
              </p>
            )}

            {mode === "script" ? (
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={planning || generating}
                  onClick={onPlanScript}
                  className="studio-display w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-40"
                >
                  {planning ? "Planning scenes…" : "1. 脚本をシーン分割"}
                </button>
                <button
                  type="button"
                  disabled={generating || planning || scenes.length === 0}
                  onClick={onGenerateAllScenes}
                  className={cx(
                    "studio-display w-full rounded-2xl px-4 py-3.5 text-base font-semibold text-black transition",
                    generating
                      ? "studio-generating cursor-wait"
                      : "bg-gradient-to-r from-[var(--studio-accent)] to-[var(--studio-accent-2)] hover:brightness-110"
                  )}
                >
                  {generating
                    ? "Generating scenes…"
                    : "2. 全シーンを動画化 (Wan 2.2)"}
                </button>
                {generating && (
                  <button
                    type="button"
                    onClick={() => {
                      abortRef.current = true;
                    }}
                    className="text-xs text-[var(--studio-muted)] hover:text-white"
                  >
                    Stop after current scene
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                disabled={generating}
                onClick={onGenerateSingle}
                className={cx(
                  "studio-display w-full rounded-2xl px-4 py-3.5 text-base font-semibold text-black transition",
                  generating
                    ? "studio-generating cursor-wait"
                    : "bg-gradient-to-r from-[var(--studio-accent)] to-[var(--studio-accent-2)] hover:brightness-110"
                )}
              >
                {generating ? "Generating…" : "Generate Video"}
              </button>
            )}
            <p className="text-center text-[11px] text-[var(--studio-muted)]">
              RunPod 未設定時はデモ動画で流れを確認できます
            </p>
          </div>
        </section>

        <section className="studio-rise flex min-h-[520px] flex-col rounded-2xl border border-white/10 bg-[var(--studio-panel)]/70 backdrop-blur-sm md:min-h-0">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="studio-display text-base font-semibold">
                {mode === "script" ? "Storyboard Preview" : "Preview"}
              </p>
              <p className="text-xs text-[var(--studio-muted)]">
                {mode === "script"
                  ? "カットごとに生成 → 並べて確認（Vidu の脚本フロー）"
                  : "単発生成のプレビュー"}
              </p>
            </div>
            {(activeScene?.status === "completed" && activeJob?.mock) ||
            activeJob?.mock ? (
              <span className="rounded-full border border-[var(--studio-accent-2)]/30 bg-[var(--studio-accent-2)]/10 px-2.5 py-1 text-[11px] text-[var(--studio-accent-2)]">
                Demo output
              </span>
            ) : null}
          </div>

          <div className="flex flex-1 flex-col gap-4 p-4">
            <div
              className={cx(
                "relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/40",
                generating && "studio-generating"
              )}
            >
              {previewVideoUrl ? (
                <video
                  key={previewVideoUrl}
                  src={previewVideoUrl}
                  controls
                  playsInline
                  className={cx(
                    "max-h-[min(58vh,680px)] w-full bg-black object-contain",
                    aspectRatio === "9:16" && "mx-auto max-w-[360px]",
                    aspectRatio === "1:1" && "mx-auto max-w-[520px]"
                  )}
                />
              ) : (
                <div className="px-6 text-center">
                  <p className="studio-display text-2xl font-semibold text-white/90">
                    {mode === "script"
                      ? "Script → scenes → clips"
                      : "Your video appears here"}
                  </p>
                  <p className="mt-2 max-w-md text-sm text-[var(--studio-muted)]">
                    {mode === "script"
                      ? "脚本を分割してから各シーンを Wan 2.2 で生成します。長い物語は「1シーン＝1ショット」がコツです。"
                      : "左のパネルから生成してください。"}
                  </p>
                </div>
              )}
            </div>

            {mode === "script" && scenes.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--studio-muted)]">
                  Timeline
                </p>
                <div className="studio-scroll flex gap-2 overflow-x-auto pb-1">
                  {scenes.map((scene) => (
                    <button
                      key={scene.id}
                      type="button"
                      onClick={() => setActiveSceneId(scene.id)}
                      className={cx(
                        "w-36 shrink-0 overflow-hidden rounded-xl border text-left transition",
                        activeSceneId === scene.id
                          ? "border-[var(--studio-accent)]"
                          : "border-white/10 hover:border-white/25"
                      )}
                    >
                      <div className="aspect-video bg-black/50">
                        {scene.videoUrl ? (
                          <video
                            src={scene.videoUrl}
                            muted
                            playsInline
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-white/35">
                            {scene.status}
                          </div>
                        )}
                      </div>
                      <p className="line-clamp-2 px-2 py-1.5 text-[11px] text-white/75">
                        {scene.index + 1}. {scene.title}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode !== "script" && jobs.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--studio-muted)]">
                  History
                </p>
                <div className="studio-scroll grid max-h-40 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
                  {jobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setActiveJobId(job.id)}
                      className={cx(
                        "overflow-hidden rounded-xl border text-left",
                        activeJobId === job.id
                          ? "border-[var(--studio-accent)]"
                          : "border-white/10"
                      )}
                    >
                      <div className="aspect-video bg-black/50">
                        {job.videoUrl ? (
                          <video
                            src={job.videoUrl}
                            muted
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <p className="line-clamp-2 px-2 py-1.5 text-[11px] text-white/70">
                        {job.prompt}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: ScriptScene["status"] }) {
  const map: Record<ScriptScene["status"], string> = {
    draft: "draft",
    queued: "queued",
    running: "running",
    completed: "done",
    failed: "failed",
  };
  const color =
    status === "completed"
      ? "text-[var(--studio-ok)] border-[var(--studio-ok)]/30"
      : status === "failed"
        ? "text-[#ffb3bb] border-[var(--studio-danger)]/30"
        : status === "running"
          ? "text-[var(--studio-accent-2)] border-[var(--studio-accent-2)]/30"
          : "text-[var(--studio-muted)] border-white/10";
  return (
    <span className={cx("rounded-full border px-2 py-0.5 text-[10px]", color)}>
      {map[status]}
    </span>
  );
}

function SettingsBlock(props: {
  aspectRatio: AspectRatio;
  setAspectRatio: (v: AspectRatio) => void;
  quality: QualityPreset;
  setQuality: (v: QualityPreset) => void;
  durations?: boolean;
  durationSeconds?: DurationSeconds;
  setDurationSeconds?: (v: DurationSeconds) => void;
}) {
  return (
    <div className="grid gap-3">
      {props.durations &&
        props.durationSeconds != null &&
        props.setDurationSeconds && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--studio-muted)]">
              Duration
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => props.setDurationSeconds?.(d)}
                  className={cx(
                    "rounded-xl border px-3 py-2 text-sm",
                    props.durationSeconds === d
                      ? "border-[var(--studio-accent)] bg-[var(--studio-accent)]/15 text-white"
                      : "border-white/10 text-[var(--studio-muted)]"
                  )}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>
        )}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--studio-muted)]">
          Aspect ratio
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => props.setAspectRatio(a.id)}
              className={cx(
                "rounded-xl border px-3 py-2 text-sm",
                props.aspectRatio === a.id
                  ? "border-[var(--studio-accent)] bg-[var(--studio-accent)]/15 text-white"
                  : "border-white/10 text-[var(--studio-muted)]"
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--studio-muted)]">
          Quality
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["standard", "Standard · 480p"],
              ["pro", "Pro · 720p"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => props.setQuality(id)}
              className={cx(
                "rounded-xl border px-3 py-2 text-sm",
                props.quality === id
                  ? "border-[var(--studio-accent)] bg-[var(--studio-accent)]/15 text-white"
                  : "border-white/10 text-[var(--studio-muted)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
