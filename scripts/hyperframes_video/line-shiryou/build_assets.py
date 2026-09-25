"""HyperFrames 用の素材をプログラムで用意する。

1. index.html で使っている文字だけを含む Noto Sans JP のファイルを assets/fonts にコピーし、
   @font-face を index.html の FONTS:BEGIN〜FONTS:END の間に書き込む
2. GSAP を assets/ にコピー（ネットの CDN に頼らずに描画できるように）
3. BGM と効果音を合成して assets/bgm.wav / assets/sfx.wav に書き出す（音素材ファイルは使わない）

使い方: npm install && python3 build_assets.py
"""
import os
import re
import shutil
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_PKG = os.path.join(HERE, "node_modules", "@fontsource", "noto-sans-jp")
WEIGHTS = [500, 700, 900]
SR = 44100
DUR = 30.0


# ---------------------------------------------------------------- フォント
def parse_ranges(s):
    out = []
    for part in s.split(","):
        part = part.strip().replace("U+", "")
        if "-" in part:
            a, b = part.split("-")
            out.append((int(a, 16), int(b, 16)))
        else:
            v = int(part, 16)
            out.append((v, v))
    return out


def build_fonts():
    html_path = os.path.join(HERE, "index.html")
    html = open(html_path, encoding="utf-8").read()
    body = re.sub(r"/\* FONTS:BEGIN.*?FONTS:END \*/", "", html, flags=re.S)
    used = {ord(c) for c in body if ord(c) > 32}
    dst = os.path.join(HERE, "assets", "fonts")
    os.makedirs(dst, exist_ok=True)
    rules = []
    for w in WEIGHTS:
        css = open(os.path.join(FONT_PKG, f"{w}.css"), encoding="utf-8").read()
        for block in re.findall(r"@font-face\s*{(.*?)}", css, flags=re.S):
            fname = re.search(r"url\(\./files/([^)]+\.woff2)\)", block).group(1)
            ur = re.search(r"unicode-range:\s*([^;]+);", block).group(1)
            ranges = parse_ranges(ur)
            if not any(a <= c <= b for c in used for a, b in ranges):
                continue
            shutil.copy(os.path.join(FONT_PKG, "files", fname), os.path.join(dst, fname))
            rules.append(
                "      @font-face {\n"
                "        font-family: \"Noto Sans JP\";\n"
                f"        font-weight: {w};\n"
                "        font-style: normal;\n"
                f"        src: url(\"assets/fonts/{fname}\") format(\"woff2\");\n"
                f"        unicode-range: {ur};\n"
                "      }"
            )
    block = "/* FONTS:BEGIN (build_assets.py が自動で書き込む) */\n" + "\n".join(rules) + "\n      /* FONTS:END */"
    html = re.sub(r"/\* FONTS:BEGIN.*?FONTS:END \*/", lambda _m: block, html, flags=re.S)
    open(html_path, "w", encoding="utf-8").write(html)
    print(f"fonts: {len(rules)} files")


def copy_gsap():
    src = os.path.join(HERE, "node_modules", "gsap", "dist", "gsap.min.js")
    shutil.copy(src, os.path.join(HERE, "assets", "gsap.min.js"))


# ---------------------------------------------------------------- 音
def nf(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env_adsr(n, a=0.005, d=0.1, s=0.0, r=0.05, sus_len=None):
    t = np.arange(n) / SR
    e = np.zeros(n)
    ai = max(1, int(a * SR))
    e[:ai] = np.linspace(0, 1, ai)
    rest = t[ai:] - a
    e[ai:] = s + (1 - s) * np.exp(-rest / max(d, 1e-4))
    ri = min(n, int(r * SR))
    e[-ri:] *= np.linspace(1, 0, ri)
    return e


def bell(freq, dur, vol=0.2, decay=0.35):
    n = int(SR * dur)
    t = np.arange(n) / SR
    wv = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2 * t) + 0.12 * np.sin(2 * np.pi * freq * 3.01 * t)
    return wv * env_adsr(n, 0.004, decay, 0, 0.05) * vol


def pad(freqs, dur, vol=0.05):
    n = int(SR * dur)
    t = np.arange(n) / SR
    wv = sum(np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2 * t) for f in freqs)
    e = np.minimum(1, t / 0.4) * np.minimum(1, (dur - t) / 0.4)
    return wv * e * vol


def tri(freq, dur, vol=0.15):
    n = int(SR * dur)
    t = np.arange(n) / SR
    ph = (t * freq) % 1.0
    return (4 * np.abs(ph - 0.5) - 1) * env_adsr(n, 0.01, 0.3, 0.4, 0.05) * vol


def pop(freq=880, vol=0.25):
    n = int(SR * 0.12)
    t = np.arange(n) / SR
    f = freq * (1 + 0.8 * np.exp(-t * 60))
    ph = np.cumsum(f) / SR
    return np.sin(2 * np.pi * ph) * np.exp(-t * 30) * vol


def whoosh(vol=0.18, dur=0.45):
    n = int(SR * dur)
    rng = np.random.default_rng(3)
    x = rng.standard_normal(n)
    # 簡単なローパス（移動平均の幅を時間で変える）
    out = np.zeros(n)
    acc = 0.0
    for i in range(n):
        k = 0.02 + 0.25 * (i / n)
        acc += k * (x[i] - acc)
        out[i] = acc
    t = np.arange(n) / SR
    e = np.sin(np.pi * t / dur) ** 2
    return out * e * vol * 3


def thump(vol=0.5):
    n = int(SR * 0.25)
    t = np.arange(n) / SR
    f = 160 * np.exp(-t * 8) + 50
    ph = np.cumsum(f) / SR
    return np.sin(2 * np.pi * ph) * np.exp(-t * 14) * vol


def tick(vol=0.12):
    return bell(1760, 0.08, vol, 0.03)


def chime(notes, vol=0.18, gap=0.09):
    parts = []
    L = int(SR * (gap * len(notes) + 1.2))
    out = np.zeros(L)
    for i, n in enumerate(notes):
        b = bell(nf(n), 1.2, vol, 0.5)
        s = int(SR * gap * i)
        out[s:s + len(b)] += b[:L - s]
    return out


def mix_at(buf, t, s):
    i = int(t * SR)
    j = min(len(buf), i + len(s))
    if j > i:
        buf[i:j] += s[:j - i]


def build_bgm():
    buf = np.zeros(int(SR * DUR))
    bpm = 100
    beat = 60 / bpm
    prog = [(48, [60, 64, 67]), (43, [59, 62, 67]), (45, [60, 64, 69]), (41, [60, 65, 69])]  # C G Am F
    bar = 4 * beat
    t = 0.0
    k = 0
    while t < DUR - 1.5:
        root, chord = prog[k % 4]
        mix_at(buf, t, pad([nf(n) for n in chord], bar, 0.028))
        for b in range(4):
            mix_at(buf, t + b * beat, tri(nf(root), beat * 0.9, 0.09))
        # やわらかいアルペジオ
        pat = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 12]
        for i in range(8):
            mix_at(buf, t + i * beat / 2, bell(nf(pat[i % 4]), 0.4, 0.035, 0.18))
        t += bar
        k += 1
    # 終わりの和音
    end = 28.0
    mix_at(buf, end, pad([nf(n) for n in (48, 60, 64, 67, 72)], 2.0, 0.03))
    fade = np.ones(len(buf))
    fi = int(SR * 27.6)
    fade[fi:int(SR * 28.0)] = np.linspace(1, 0.35, int(SR * 28.0) - fi)
    fade[int(SR * 28.0):] = 0.35
    fade[-int(SR * 0.8):] *= np.linspace(1, 0, int(SR * 0.8))
    return buf * fade


def build_sfx():
    buf = np.zeros(int(SR * DUR))
    cuts = [3.5, 8.5, 14, 19.5, 24.5]
    for c in cuts:
        mix_at(buf, c - 0.36, whoosh())
    # タイトル
    mix_at(buf, 0.15, pop(660))
    mix_at(buf, 1.3, pop(990))
    # STEP1
    for i, t in enumerate([4.2, 4.8, 5.4]):
        mix_at(buf, t, pop(700 + i * 120))
    mix_at(buf, 6.4, chime([72, 76, 79]))
    # STEP2
    for i in range(5):
        mix_at(buf, 8.95 + i * 0.6, pop(620 + i * 90))
    mix_at(buf, 13.5, chime([74, 79, 83, 86]))
    # STEP3
    for i in range(6):
        mix_at(buf, 14.75 + i * 0.12, tick())
    for i in range(4):
        mix_at(buf, 16.1 + i * 0.5, pop(760))
    # STEP4
    for t in (20.0, 20.8, 21.6):
        mix_at(buf, t, pop(820))
        for k in range(6):
            mix_at(buf, t + 0.2 + k * 0.11, tick(0.07))
    mix_at(buf, 22.0, chime([76, 79, 84]))
    # まとめ
    for i in range(5):
        mix_at(buf, 24.9 + i * 0.15, pop(700 + i * 60, 0.18))
    mix_at(buf, 25.9, whoosh(0.1, 0.7))
    mix_at(buf, 27.2, thump())
    mix_at(buf, 28.35, chime([72, 76, 79, 84, 88], 0.2, 0.1))
    return buf


def write_wav(path, x):
    peak = np.max(np.abs(x))
    if peak > 0.9:
        x = x * 0.9 / peak
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes((x * 32767).astype(np.int16).tobytes())


def main():
    os.makedirs(os.path.join(HERE, "assets"), exist_ok=True)
    build_fonts()
    copy_gsap()
    write_wav(os.path.join(HERE, "assets", "bgm.wav"), build_bgm())
    write_wav(os.path.join(HERE, "assets", "sfx.wav"), build_sfx())
    print("assets ready")


if __name__ == "__main__":
    main()
