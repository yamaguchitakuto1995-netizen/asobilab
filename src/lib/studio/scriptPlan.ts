import type { DurationSeconds, ScriptScene } from "@/lib/studio/types";

const SCENE_HEADING =
  /^(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.|内景|外景|シーン\s*\d+|Scene\s*\d+|第?\d+場)/i;

const CAMERA_CYCLE = [
  "wide establishing shot, slow push-in",
  "medium shot, gentle handheld feel",
  "close-up, shallow depth of field",
  "tracking shot following the subject",
  "over-the-shoulder shot, cinematic framing",
  "low angle, dramatic lighting",
];

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `scene-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanBlock(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function splitByHeadings(script: string): string[] {
  const lines = script.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (SCENE_HEADING.test(line.trim()) && current.length > 0) {
      blocks.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join("\n").trim());
  return blocks.filter(Boolean);
}

function splitByBlankLines(script: string): string[] {
  return script
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length >= 12);
}

function splitBySentences(script: string, maxScenes: number): string[] {
  const sentences = script
    .replace(/\n+/g, " ")
    .split(/(?<=[。．！？!?\.])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);

  if (sentences.length <= maxScenes) return sentences;

  const per = Math.ceil(sentences.length / maxScenes);
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += per) {
    chunks.push(sentences.slice(i, i + per).join(" "));
  }
  return chunks.slice(0, maxScenes);
}

export function extractBeats(script: string, maxScenes: number): string[] {
  const cleaned = cleanBlock(script);
  if (!cleaned) return [];

  let beats = splitByHeadings(cleaned);
  if (beats.length < 2) beats = splitByBlankLines(cleaned);
  if (beats.length < 2) beats = splitBySentences(cleaned, maxScenes);

  if (beats.length > maxScenes) {
    const merged: string[] = [];
    const per = Math.ceil(beats.length / maxScenes);
    for (let i = 0; i < beats.length; i += per) {
      merged.push(beats.slice(i, i + per).join("\n\n"));
    }
    beats = merged.slice(0, maxScenes);
  }

  return beats.slice(0, maxScenes);
}

function titleFromBeat(beat: string, index: number): string {
  const first = beat
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!first) return `Scene ${index + 1}`;
  if (SCENE_HEADING.test(first)) {
    return first.slice(0, 48);
  }
  const short = first.replace(/^["「『]|["」』]$/g, "");
  return short.length > 36 ? `${short.slice(0, 36)}…` : short;
}

function toVisualPrompt(beat: string, style: string, camera: string): string {
  const plain = beat
    .replace(/^(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.).*$/gim, "")
    .replace(/^[A-Z][A-Z0-9 ]{2,}:\s*/gm, "")
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const action = plain.slice(0, 280) || "A cinematic moment unfolds";

  return [
    style.trim() || "cinematic photorealistic video",
    action,
    camera,
    "natural motion, coherent lighting, high detail, no text overlay, no watermark",
  ].join(", ");
}

export function buildHeuristicPlan(opts: {
  script: string;
  style?: string;
  maxScenes?: number;
  defaultDurationSeconds?: DurationSeconds;
}): { title: string; style: string; scenes: ScriptScene[] } {
  const maxScenes = Math.min(Math.max(opts.maxScenes ?? 6, 2), 12);
  const duration = opts.defaultDurationSeconds ?? 5;
  const style = (opts.style || "cinematic, film lighting, 35mm look").trim();
  const beats = extractBeats(opts.script, maxScenes);

  const firstLine =
    opts.script
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) || "Untitled Script";

  const scenes: ScriptScene[] = beats.map((beat, index) => {
    const camera = CAMERA_CYCLE[index % CAMERA_CYCLE.length];
    return {
      id: uid(),
      index,
      title: titleFromBeat(beat, index),
      beat: beat.trim(),
      visualPrompt: toVisualPrompt(beat, style, camera),
      camera,
      durationSeconds: duration,
      status: "draft",
      videoUrl: null,
      error: null,
      jobId: null,
    };
  });

  return {
    title: firstLine.slice(0, 64),
    style,
    scenes,
  };
}

/** Optional LLM planner via OpenAI-compatible chat completions */
export async function buildLlmPlan(opts: {
  script: string;
  style?: string;
  maxScenes?: number;
  defaultDurationSeconds?: DurationSeconds;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}): Promise<{ title: string; style: string; scenes: ScriptScene[] } | null> {
  const maxScenes = Math.min(Math.max(opts.maxScenes ?? 6, 2), 12);
  const duration = opts.defaultDurationSeconds ?? 5;
  const style = (opts.style || "cinematic, film lighting").trim();
  const base = (opts.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = opts.model || "gpt-4o-mini";

  const system = `You are a film director AI. Split a short script into ${maxScenes} or fewer video shots for an AI video model (Wan 2.2).
Return ONLY valid JSON:
{"title":"...","scenes":[{"title":"...","beat":"original script excerpt","visualPrompt":"English cinematic prompt under 280 chars","camera":"..."}]}
Rules:
- One subject, one action, one camera idea per scene
- visualPrompt must be English, concrete, visual, no dialogue quotes as on-screen text
- Keep continuity of characters/locations across scenes via repeated descriptors
- Max ${maxScenes} scenes`;

  const user = `Style: ${style}\n\nScript:\n${opts.script.slice(0, 6000)}`;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  let parsed: {
    title?: string;
    scenes?: Array<{
      title?: string;
      beat?: string;
      visualPrompt?: string;
      camera?: string;
    }>;
  };
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  if (!rawScenes.length) return null;

  const scenes: ScriptScene[] = rawScenes.slice(0, maxScenes).map((s, index) => {
    const camera =
      (s.camera || CAMERA_CYCLE[index % CAMERA_CYCLE.length]).trim();
    const beat = (s.beat || s.title || `Scene ${index + 1}`).trim();
    const visualPrompt = (
      s.visualPrompt || toVisualPrompt(beat, style, camera)
    ).trim();
    return {
      id: uid(),
      index,
      title: (s.title || titleFromBeat(beat, index)).trim(),
      beat,
      visualPrompt,
      camera,
      durationSeconds: duration,
      status: "draft",
      videoUrl: null,
      error: null,
      jobId: null,
    };
  });

  return {
    title: (parsed.title || "Script Project").trim(),
    style,
    scenes,
  };
}
