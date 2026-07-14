export type StudioMode = "script" | "t2v" | "i2v";
export type AspectRatio = "16:9" | "9:16" | "1:1";
export type DurationSeconds = 5 | 10;
export type QualityPreset = "standard" | "pro";

export type StudioGenerateRequest = {
  mode: Exclude<StudioMode, "script">;
  prompt: string;
  negativePrompt?: string;
  aspectRatio: AspectRatio;
  durationSeconds: DurationSeconds;
  quality: QualityPreset;
  /** data URL or base64 for I2V start frame */
  imageDataUrl?: string | null;
};

export type StudioJob = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  mode: Exclude<StudioMode, "script"> | "script-scene";
  prompt: string;
  aspectRatio: AspectRatio;
  durationSeconds: DurationSeconds;
  quality: QualityPreset;
  createdAt: string;
  videoUrl?: string | null;
  error?: string | null;
  mock?: boolean;
  sceneIndex?: number;
};

export type StudioGenerateResponse =
  | { ok: true; job: StudioJob }
  | { ok: false; error: string; detail?: string };

export type ScriptScene = {
  id: string;
  index: number;
  title: string;
  /** 脚本の該当部分 */
  beat: string;
  /** Wan に渡す映像プロンプト */
  visualPrompt: string;
  camera: string;
  durationSeconds: DurationSeconds;
  status: "draft" | "queued" | "running" | "completed" | "failed";
  videoUrl?: string | null;
  error?: string | null;
  jobId?: string | null;
};

export type ScriptPlanRequest = {
  script: string;
  style?: string;
  language?: "ja" | "en";
  maxScenes?: number;
  defaultDurationSeconds?: DurationSeconds;
};

export type ScriptPlanResponse =
  | {
      ok: true;
      title: string;
      style: string;
      scenes: ScriptScene[];
      planner: "heuristic" | "llm";
    }
  | { ok: false; error: string; detail?: string };
