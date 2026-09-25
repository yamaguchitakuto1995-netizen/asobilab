"""【30秒でわかる、AI動画ができるまで】レトロゲーム風アニメーションを生成する。

絵・動き・効果音はすべてこのプログラムで作る（外部素材・生成AIは不使用）。
320x180 で描いて 4 倍に拡大（ぼかしなし）し、1280x720 / 30fps の mp4 を書き出す。

使い方: python3 scripts/retro_video/make_video.py [--stills]
"""
import math
import os
import random
import subprocess
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 320, 180
SCALE = 4
FPS = 30
DURATION = 30.0
SR = 44100
OUT_NAME = "ai_video_retro.mp4"

FONT_PATHS = [
    "/usr/share/fonts/opentype/unifont/unifont_jp.otf",
    "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
]
FONT = next(ImageFont.truetype(p, 16) for p in FONT_PATHS if os.path.exists(p))

# PICO-8 の 16 色
PAL = {
    "k": (0, 0, 0), "n": (29, 43, 83), "u": (126, 37, 83), "g": (0, 135, 81),
    "o": (171, 82, 54), "d": (95, 87, 79), "l": (194, 195, 199), "w": (255, 241, 232),
    "r": (255, 0, 77), "a": (255, 163, 0), "y": (255, 236, 39), "e": (0, 228, 54),
    "b": (41, 173, 255), "v": (131, 118, 156), "p": (255, 119, 168), "s": (255, 204, 170),
}
C = PAL

# ---------------------------------------------------------------- タイムライン
T_SCENES = [0.0, 4.0, 9.2, 15.0, 20.6, 25.4, 30.0]  # 各場面の開始秒
TR_HALF = 0.4          # 場面切り替え（ブロックで埋める／はがす）の片側の長さ
CHAR_SEC = 0.075       # 字幕 1 文字あたりの秒数

LABELS = [None, "STAGE 1 企画する", "STAGE 2 言葉にする", "STAGE 3 画像をつくる",
          "STAGE 4 選んでつなぐ", "STAGE CLEAR"]
DIALOG = [
    None,
    ["まずは企画する。", "どんな動画にするか、ひらめこう！"],
    ["言葉にして、メモに書きだそう。", "だれに？雰囲気は？何を伝える？"],
    ["メモをAIにわたして、", "画像をつくってもらおう！"],
    ["いい画像を選んで、", "つなげれば動画になる！"],
    ["見た人の心が動いたら、完成です"],
]
DIALOG_DELAY = [0, 0.55, 0.55, 0.55, 0.55, 1.3]  # 場面開始から字幕が出始めるまで


def scene_at(t):
    for i in range(len(T_SCENES) - 1):
        if t < T_SCENES[i + 1]:
            return i, t - T_SCENES[i]
    return len(T_SCENES) - 2, t - T_SCENES[-2]


def ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def lerp(a, b, x):
    return a + (b - a) * x


# ---------------------------------------------------------------- 描画の道具
def rect(d, x, y, w, h, col):
    if w > 0 and h > 0:
        d.rectangle([int(x), int(y), int(x) + int(w) - 1, int(y) + int(h) - 1], fill=C[col])


def frame_rect(d, x, y, w, h, col):
    d.rectangle([int(x), int(y), int(x) + int(w) - 1, int(y) + int(h) - 1], outline=C[col])


def sprite(d, grid, x, y, cmap=None, flip=False):
    cmap = cmap or {}
    for j, row in enumerate(grid):
        if flip:
            row = row[::-1]
        for i, ch in enumerate(row):
            if ch == ".":
                continue
            ch = cmap.get(ch, ch)
            d.point((int(x) + i, int(y) + j), fill=C[ch])


def text(d, x, y, s, col="w", shadow=None):
    if shadow:
        d.text((x + 1, y + 1), s, font=FONT, fill=C[shadow])
    d.text((x, y), s, font=FONT, fill=C[col])


def text_w(s):
    return int(FONT.getlength(s))


def big_text(img, cx, y, s, col, shadow, scale=2):
    """16px の文字を小さく描いてから、ぼかさずに拡大して貼る。"""
    w = text_w(s)
    layer = Image.new("RGBA", (w + 1, 17), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.fontmode = "1"
    ld.text((1, 1), s, font=FONT, fill=C[shadow] + (255,))
    ld.text((0, 0), s, font=FONT, fill=C[col] + (255,))
    layer = layer.resize((layer.width * scale, layer.height * scale), Image.NEAREST)
    img.paste(layer, (int(cx - layer.width / 2), int(y)), layer)


# ---------------------------------------------------------------- キャラクター
# 主人公の女の子（全場面で同じ見た目）16x24
GIRL = [
    "....kkkkkkkk....",
    "...khhhhhhhhk...",
    "..khhhhhhhhhhk..",
    ".khhhhhhhhhhhhk.",
    ".khhhhhhhhhhhhk.",
    ".khsshhsshhsshk.",
    ".khsskssssksshk.",
    ".khsskssssksshk.",
    ".khspsssssspshk.",
    ".khssssmmsssshk.",
    "..khsssssssshk..",
    "..khkksssskkhk..",
    "...kccwwwwcck...",
    "..kccccwwcccck..",
    ".ksccccccccccsk.",
    ".ksccccccccccsk.",
    ".kkcccccccccckk.",
    "..kcccccccccck..",
    ".kcccccccccccck.",
    ".kkkkkkkkkkkkkk.",
    "....ksk..ksk....",
    "....ksk..ksk....",
    "...kddk..kddk...",
    "...kkkk..kkkk...",
]
for _r in GIRL:
    assert len(_r) == 16, _r
GIRL_MAP = {"h": "o", "c": "b", "m": "r", "d": "n"}
BOW = [
    "kk.kk",
    "kpkpk",
    "kpppk",
    "kpkpk",
    "kk.kk",
]


def draw_girl(d, x, y, t, happy=False, blink_seed=0):
    """x,y は足元の中心。"""
    grid = [row for row in GIRL]
    # まばたき
    if (t + blink_seed) % 3.1 < 0.12:
        grid[6] = ".khsssssssssshk."
    if happy:
        grid[9] = ".khsssrrrrssshk."
        # 腕をばんざい
        grid[14] = "..kcccccccccck.."
        grid[15] = "..kcccccccccck.."
    ox = int(x) - 8
    oy = int(y) - 24
    sprite(d, grid, ox, oy, GIRL_MAP)
    sprite(d, BOW, ox + 11, oy - 2)
    if happy:
        # 上げた腕
        for side in (0, 1):
            ax = ox + (-1 if side == 0 else 15)
            rect(d, ax, oy + 7, 2, 7, "k")
            rect(d, ax + (1 if side == 0 else 0), oy + 8, 1, 5, "s")
            rect(d, ax - (1 if side == 0 else -1), oy + 6, 2, 2, "s")


AUDIENCE = [
    "...kkkkkk...",
    "..kHHHHHHk..",
    ".kHHHHHHHHk.",
    ".kHssssssHk.",
    ".kskssssksk.",
    ".kssssssssk.",
    ".kspsmmspsk.",
    "..kssssssk..",
    "...kkkkkk...",
    "..kTTTTTTk..",
    ".kTTTTTTTTk.",
    ".sTTTTTTTTs.",
    ".kTTTTTTTTk.",
    "..kkkkkkkk..",
    "...ksk.ksk..",
    "...kkk.kkk..",
]
AUDIENCE = [(r + "............")[:12] for r in AUDIENCE]


def draw_viewer(d, x, y, hair, shirt, t, phase):
    jump = int(abs(math.sin((t * 5 + phase))) * 4)
    sprite(d, AUDIENCE, x - 6, y - len(AUDIENCE) - jump, {"H": hair, "T": shirt, "m": "r"})


BULB = [
    "..kkkkk..",
    ".kyyyyyk.",
    "kyywyyyyk",
    "kywyyyyyk",
    "kyyyyyyyk",
    "kyyyyyyyk",
    ".kyyyyyk.",
    "..kyyyk..",
    "..kdldk..",
    "..kdldk..",
    "...kdk...",
]

HAND = [
    "..kk......",
    ".kwwk.....",
    ".kwwk.....",
    ".kwwkkk...",
    ".kwwkwwkk.",
    "kkwwwwwwwk",
    "kwkwwwwwwk",
    "kwwwwwwwwk",
    ".kwwwwwwk.",
    "..kwwwwk..",
    "..kkkkkk..",
]

HEART = [
    ".kk.kk.",
    "krrkrrk",
    "krwrrrk",
    "krrrrrk",
    ".krrrk.",
    "..krk..",
    "...k...",
]


def draw_heart(d, x, y):
    sprite(d, HEART, x - 3, y - 3)


def sparkle(d, x, y, col, size):
    x, y = int(x), int(y)
    for i in range(-size, size + 1):
        d.point((x + i, y), fill=C[col])
        d.point((x, y + i), fill=C[col])


# ---------------------------------------------------------------- 絵のカード
def draw_picture(d, x, y, kind, w=24, h=18):
    """AI がつくった画像（カードの中の絵）。"""
    if kind == 0:  # 山と太陽
        rect(d, x, y, w, h, "b")
        rect(d, x + w - 8, y + 2, 5, 5, "y")
        for i in range(w):
            top = int(abs(i - w * 0.4) * 0.9) + 6
            rect(d, x + i, y + top, 1, h - top, "g")
        rect(d, x + int(w * 0.4) - 1, y + 6, 3, 2, "w")
    elif kind == 1:  # 海と夕日
        rect(d, x, y, w, h, "a")
        rect(d, x, y, w, 4, "p")
        rect(d, x + w // 2 - 3, y + 6, 6, 4, "y")
        rect(d, x, y + 10, w, h - 10, "n")
        for i in range(0, w, 4):
            rect(d, x + i, y + 12 + (i // 4) % 2 * 2, 2, 1, "b")
    elif kind == 2:  # 花
        rect(d, x, y, w, h, "e")
        rect(d, x, y + h - 5, w, 5, "g")
        cx, cy = x + w // 2, y + 7
        rect(d, cx, cy + 3, 1, h - 10, "g")
        for dx, dy in ((-3, 0), (3, 0), (0, -3), (0, 3)):
            rect(d, cx + dx - 1, cy + dy - 1, 3, 3, "p")
        rect(d, cx - 1, cy - 1, 3, 3, "y")
    else:  # 失敗した画像（ぐちゃぐちゃ）
        rng = random.Random(7)
        for j in range(0, h, 2):
            for i in range(0, w, 2):
                rect(d, x + i, y + j, 2, 2, rng.choice(["v", "d", "u", "l", "n"]))
        text(d, x + w // 2 - 4, y + 1, "?", "w", "k")


def draw_card(d, x, y, kind, hl=None, gray=False):
    """30x36 の絵カード。"""
    x, y = int(x), int(y)
    rect(d, x + 1, y + 1, 30, 36, "k")          # 影
    rect(d, x, y, 30, 36, "w")
    frame_rect(d, x, y, 30, 36, "k")
    draw_picture(d, x + 3, y + 3, kind)
    rect(d, x + 3, y + 25, 18, 2, "l")
    rect(d, x + 3, y + 29, 12, 2, "l")
    if gray:
        for j in range(y + 1, y + 35):
            for i in range(x + 1 + (j % 2), x + 29, 2):
                d.point((i, j), fill=C["d"])
    if hl:
        frame_rect(d, x - 2, y - 2, 34, 40, hl)
        frame_rect(d, x - 1, y - 1, 32, 38, hl)


# ---------------------------------------------------------------- 背景
def bg_room(d, wall="n", floor="v", window=True):
    rect(d, 0, 0, W, 120, wall)
    # 壁のもよう
    for yy in range(8, 120, 16):
        for xx in range((yy // 16) % 2 * 16, W, 32):
            d.point((xx, yy), fill=C["u"])
    rect(d, 0, 118, W, 2, "k")
    rect(d, 0, 120, W, 60, floor)
    for xx in range(0, W, 16):
        rect(d, xx, 120, 1, 60, "d")
    if not window:
        return
    # 窓
    rect(d, 250, 22, 44, 34, "k")
    rect(d, 252, 24, 40, 30, "b")
    rect(d, 271, 24, 2, 30, "k")
    rect(d, 252, 38, 40, 2, "k")
    rect(d, 256, 28, 8, 3, "w")


def bg_stars(d, t):
    rect(d, 0, 0, W, H, "n")
    rng = random.Random(3)
    for _ in range(70):
        x, y = rng.randrange(W), rng.randrange(H)
        ph = rng.random() * 6
        col = "w" if math.sin(t * 4 + ph) > 0.3 else "v"
        d.point((x, y), fill=C[col])
    rect(d, 0, 150, W, 30, "u")
    for xx in range(0, W, 8):
        rect(d, xx, 150, 4, 2, "p")


# ---------------------------------------------------------------- UI
def draw_label(d, s):
    w = text_w(s) + 12
    rect(d, 5, 5, w, 22, "k")
    frame_rect(d, 6, 6, w - 2, 20, "w")
    col = "y" if s == "STAGE CLEAR" else "w"
    if s.startswith("STAGE") and s != "STAGE CLEAR":
        head = s[:7]
        text(d, 11, 8, head, "y")
        text(d, 11 + text_w(head + " "), 8, s[8:], "w")
    else:
        text(d, 11, 8, s, col)


def draw_dialog(d, lines, shown, t_local):
    x, y, w, h = 8, 128, 304, 46
    rect(d, x, y, w, h, "k")
    frame_rect(d, x + 1, y + 1, w - 2, h - 2, "w")
    frame_rect(d, x + 3, y + 3, w - 6, h - 6, "w")
    total = sum(len(l) for l in lines)
    n = shown
    ty = y + 7 if len(lines) == 2 else y + 15
    for li, line in enumerate(lines):
        part = line[:max(0, n)]
        n -= len(line)
        text(d, x + 10, ty + li * 17, part, "w")
    if shown >= total and (t_local * 2.5) % 1 < 0.6:  # 送りマーク
        d.polygon([(x + w - 16, y + h - 12), (x + w - 9, y + h - 12), (x + w - 13, y + h - 8)],
                  fill=C["w"])


def shown_chars(scene, tl):
    if DIALOG[scene] is None:
        return 0
    return max(0, int((tl - DIALOG_DELAY[scene]) / CHAR_SEC) + 1) if tl >= DIALOG_DELAY[scene] else 0


def draw_transition(d, t):
    """黒いブロックで画面を埋めて、次の場面ではがす。"""
    for b in T_SCENES[1:-1]:
        dt = t - b
        if -TR_HALF <= dt < TR_HALF:
            bs = 16
            cols, rows = W // bs, math.ceil(H / bs)
            rng = random.Random(int(b * 10))
            maxk = cols + rows
            for j in range(rows):
                for i in range(cols):
                    k = (i + j + rng.random() * 3) / (maxk + 3)
                    if dt < 0:
                        on = (dt + TR_HALF) / TR_HALF > k
                    else:
                        on = dt / TR_HALF < k
                    if on:
                        rect(d, i * bs, j * bs, bs, bs, "k")
                    else:
                        # 境目のブロックは少し小さく
                        p = (dt + TR_HALF) / TR_HALF if dt < 0 else dt / TR_HALF
                        if abs(p - k) < 0.06:
                            rect(d, i * bs + 4, j * bs + 4, bs - 8, bs - 8, "k")


# ---------------------------------------------------------------- 各場面
PRESS_AT = 2.9


def scene_title(img, d, tl):
    bg_stars(d, tl)
    # タイトル枠
    rect(d, 6, 22, 308, 72, "k")
    frame_rect(d, 8, 24, 304, 68, "a")
    frame_rect(d, 10, 26, 300, 64, "y")
    s = "30秒でわかる"
    text(d, 160 - text_w(s) // 2, 32, s, "p")
    bounce = int(max(0, math.sin(min(tl, 0.6) / 0.6 * math.pi)) * -6) if tl < 0.6 else 0
    big_text(img, 160, 50 + bounce, "AI動画ができるまで", "w", "u")
    # 主人公
    draw_girl(d, 160, 148 - (1 if (tl * 2) % 1 < 0.5 else 0), tl)
    # PRESS START
    if tl < PRESS_AT:
        vis = (tl * 1.6) % 1 < 0.6
    else:
        vis = ((tl - PRESS_AT) * 10) % 1 < 0.5
    if vis:
        s = "PRESS START"
        text(d, 160 - text_w(s) // 2, 104, s, "y" if tl >= PRESS_AT else "w")
    s = "(C) 2026 ASOBI LAB"
    text(d, 160 - text_w(s) // 2, 158, s, "l")


def scene1(img, d, tl):
    bg_room(d)
    # 机と植木
    rect(d, 40, 92, 50, 6, "o")
    rect(d, 44, 98, 4, 20, "o")
    rect(d, 82, 98, 4, 20, "o")
    rect(d, 60, 84, 12, 8, "l")
    rect(d, 62, 86, 8, 4, "b")
    rect(d, 212, 104, 12, 14, "o")
    rect(d, 208, 92, 20, 12, "g")
    rect(d, 212, 88, 12, 4, "e")
    gx, gy = 150, 119
    lit = tl > 1.5
    draw_girl(d, gx, gy - (2 if lit and (tl * 6) % 1 < 0.5 else 0), tl, happy=lit and tl < 3.2)
    bx, by = gx - 4, 70
    if tl < 1.5:
        # 考え中の「…」とかすかな電球
        if tl > 0.5:
            dots = int((tl - 0.5) / 0.3) % 4
            for i in range(dots):
                rect(d, gx + 12 + i * 4, 86, 2, 2, "w")
        if tl > 0.3:
            sprite(d, BULB, bx, by, {"y": "d", "w": "l"})
    else:
        pop = tl - 1.5
        yy = by - int(ease(pop / 0.2) * 3)
        # 光のすじ
        if (pop * 8) % 1 < 0.7:
            for a in range(8):
                ang = a * math.pi / 4 + pop * 0.8
                r1, r2 = 9, 13 + int(2 * math.sin(pop * 10))
                for r in range(r1, r2):
                    d.point((bx + 4 + int(math.cos(ang) * r), yy + 5 + int(math.sin(ang) * r)),
                            fill=C["y"])
        sprite(d, BULB, bx, yy)
        if pop < 1.2:
            s = "ひらめいた！"
            text(d, gx + 18, 76, s, "y", "k")


MEMO_ITEMS = ["だれに", "雰囲気", "伝えたいこと"]
MEMO_T0, MEMO_STEP = 0.8, 1.1


def scene2(img, d, tl):
    bg_room(d, wall="n", window=False)
    draw_girl(d, 70, 119, tl)
    # 大きなメモ用紙
    mx, my, mw, mh = 128, 28, 150, 88
    rect(d, mx + 3, my + 3, mw, mh, "k")
    rect(d, mx, my, mw, mh, "w")
    frame_rect(d, mx, my, mw, mh, "k")
    rect(d, mx, my, mw, 18, "a")
    frame_rect(d, mx, my, mw, 18, "k")
    text(d, mx + 6, my + 1, "MEMO", "k")
    for i in range(3):
        rect(d, mx + 4, my + 36 + i * 22, mw - 8, 1, "l")
    px, py = None, None
    for i, item in enumerate(MEMO_ITEMS):
        t0 = MEMO_T0 + i * MEMO_STEP
        if tl < t0:
            break
        n = min(len(item), int((tl - t0) / 0.13) + 1)
        yy = my + 20 + i * 22
        # チェック欄
        frame_rect(d, mx + 6, yy + 3, 10, 10, "k")
        if n == len(item) and tl - t0 > len(item) * 0.13 + 0.1:
            d.line([(mx + 7, yy + 8), (mx + 10, yy + 11), (mx + 15, yy + 3)], fill=C["r"], width=1)
            d.line([(mx + 8, yy + 8), (mx + 10, yy + 10), (mx + 16, yy + 3)], fill=C["r"], width=1)
        text(d, mx + 22, yy, "「" + item[:n] + ("」" if n == len(item) else ""), "k")
        px = mx + 22 + text_w("「" + item[:n])
        py = yy
    # 鉛筆
    if px is not None and tl < MEMO_T0 + 3 * MEMO_STEP + 0.3:
        wig = int(math.sin(tl * 30) * 1.5)
        pxi, pyi = px + 2, py + 10 + wig
        pts = [(pxi, pyi), (pxi + 3, pyi - 3), (pxi + 13, pyi - 13), (pxi + 10, pyi - 16), (pxi, pyi - 6)]
        d.polygon([(pxi, pyi), (pxi + 3, pyi - 6), (pxi + 6, pyi - 3)], fill=C["s"])
        for k in range(10):
            rect(d, pxi + 4 + k, pyi - 6 - k, 3, 3, "a")
        rect(d, pxi + 13, pyi - 16, 3, 3, "p")
        d.point((pxi, pyi), fill=C["k"])
    # 女の子の吹き出し「かくぞ！」
    if 0.2 < tl < 1.4:
        draw_bubble(d, 50, 70, "かこう！")


def draw_bubble(d, x, y, s):
    w = text_w(s) + 8
    rect(d, x, y, w, 18, "w")
    frame_rect(d, x, y, w, 18, "k")
    d.polygon([(x + 10, y + 17), (x + 16, y + 17), (x + 12, y + 22)], fill=C["w"])
    d.line([(x + 10, y + 18), (x + 12, y + 22), (x + 16, y + 18)], fill=C["k"])
    text(d, x + 4, y + 1, s, "k")


ROBOT_X = 118
CARD_SLOTS3 = [(200, 30), (236, 30), (200, 72), (236, 72)]
CARD_KINDS = [0, 1, 3, 2]  # 3 = 失敗画像
CARD_T0, CARD_STEP = 1.6, 0.55


def draw_robot(d, x, y, t, working):
    """x,y は足元の左端。幅 44。"""
    top = y - 70
    # アンテナ
    rect(d, x + 21, top, 2, 8, "d")
    on = working and (t * 6) % 1 < 0.5
    rect(d, x + 19, top - 4, 6, 5, "r" if on else "u")
    frame_rect(d, x + 19, top - 4, 6, 5, "k")
    # 頭
    rect(d, x + 4, top + 8, 36, 26, "l")
    frame_rect(d, x + 4, top + 8, 36, 26, "k")
    rect(d, x + 8, top + 12, 28, 16, "n")
    frame_rect(d, x + 8, top + 12, 28, 16, "k")
    blink = (t % 2.7) < 0.12
    if working and (t * 3) % 1 < 0.5:
        # 目が「> <」
        for side in (0, 1):
            ex = x + 13 + side * 13
            d.line([(ex, top + 16), (ex + 4, top + 19), (ex, top + 22)] if side == 0 else
                   [(ex + 4, top + 16), (ex, top + 19), (ex + 4, top + 22)], fill=C["e"])
    else:
        for side in (0, 1):
            ex = x + 14 + side * 12
            rect(d, ex, top + 18 if not blink else top + 20, 4, 4 if not blink else 1, "e")
    rect(d, x + 1, top + 16, 3, 8, "d")
    rect(d, x + 40, top + 16, 3, 8, "d")
    # 胴体
    rect(d, x, top + 34, 44, 30, "l")
    frame_rect(d, x, top + 34, 44, 30, "k")
    rect(d, x + 6, top + 38, 32, 5, "k")  # カードの出口
    rect(d, x + 7, top + 39, 30, 3, "d")
    for i in range(3):
        col = ["r", "y", "e"][i]
        if working and int(t * 8 + i) % 3 == 0:
            col = "w"
        rect(d, x + 8 + i * 8, top + 48, 5, 5, col)
        frame_rect(d, x + 8 + i * 8, top + 48, 5, 5, "k")
    rect(d, x + 32, top + 48, 6, 10, "d")
    # 腕
    arm = int(math.sin(t * 10) * 2) if working else 0
    rect(d, x - 5, top + 38 + arm, 5, 16, "d")
    frame_rect(d, x - 5, top + 38 + arm, 5, 16, "k")
    rect(d, x + 44, top + 38 - arm, 5, 16, "d")
    frame_rect(d, x + 44, top + 38 - arm, 5, 16, "k")
    # 足
    rect(d, x + 6, top + 64, 12, 6, "d")
    rect(d, x + 26, top + 64, 12, 6, "d")
    frame_rect(d, x + 6, top + 64, 12, 6, "k")
    frame_rect(d, x + 26, top + 64, 12, 6, "k")
    return top + 38  # 出口の y


def scene3(img, d, tl):
    bg_room(d, wall="n", window=False)
    draw_girl(d, 50, 119, tl, happy=tl > CARD_T0 + 4 * CARD_STEP)
    working = CARD_T0 - 0.4 < tl < CARD_T0 + 4 * CARD_STEP
    slot_y = draw_robot(d, ROBOT_X, 119, tl, working)
    # メモが女の子からロボットへ飛ぶ
    if 0.3 < tl < 1.3:
        p = ease((tl - 0.3) / 0.9)
        mx = lerp(58, ROBOT_X + 16, p)
        my = lerp(96, slot_y - 6, p) - math.sin(p * math.pi) * 24
        rect(d, mx, my, 12, 14, "w")
        frame_rect(d, mx, my, 12, 14, "k")
        rect(d, mx, my, 12, 3, "a")
        for i in range(3):
            rect(d, mx + 2, my + 5 + i * 3, 8, 1, "d")
    if 1.1 < tl < 1.6:
        draw_bubble(d, ROBOT_X + 2, 24, "OK!")
    # 絵のカードが出てくる
    for i, (cx, cy) in enumerate(CARD_SLOTS3):
        t0 = CARD_T0 + i * CARD_STEP
        if tl < t0:
            continue
        p = (tl - t0) / 0.45
        sx, sy = ROBOT_X + 7, slot_y - 36
        if p < 0.4:
            # 出口からにゅっと出る
            q = p / 0.4
            h = int(36 * q)
            draw_card_clipped(img, sx, slot_y - h, h)
        else:
            q = ease((p - 0.4) / 0.6)
            x = lerp(sx, cx, q)
            y = lerp(sy, cy, q) - math.sin(q * math.pi) * 14
            draw_card(d, x, y, CARD_KINDS[i])
            if p < 1.3 and p > 0.9:
                sparkle(d, cx + 32, cy - 2, "y", 3)
                sparkle(d, cx - 3, cy + 30, "w", 2)
    # ロボットの前に出口の縁を描き直さない（カードは出口から上に出る）


def draw_card_clipped(img, x, y, h):
    if h <= 0:
        return
    card = Image.new("RGB", (31, 37), C["k"])
    cd = ImageDraw.Draw(card)
    draw_card(cd, 0, 0, 0)
    img.paste(card.crop((0, 0, 30, h)), (int(x), int(y)))


SEL_CARDS_X = [92, 136, 180, 224]
SEL_Y = 30
PICK = [True, True, False, True]
CURSOR_T = [0.6, 1.3, 2.0, 2.7]      # カーソルが各カードに着く時間
STRIP_T = 3.2                         # 選んだ画像がフィルムへ移る
FILM_X = [104, 150, 196]
FILM_Y = 80


def scene4(img, d, tl):
    bg_room(d, wall="n", window=False)
    draw_girl(d, 36, 119, tl, happy=tl > STRIP_T + 0.8)
    # フィルム
    if tl > STRIP_T - 0.3:
        rect(d, 84, FILM_Y - 6, 170, 46, "k")
        for xx in range(88, 250, 8):
            rect(d, xx, FILM_Y - 4, 4, 3, "w")
            rect(d, xx, FILM_Y + 35, 4, 3, "w")
    # カーソル位置
    cur = None
    for i, ct in enumerate(CURSOR_T):
        if tl >= ct - 0.5:
            prev = (SEL_CARDS_X[i - 1] if i else 60, SEL_Y + 60 if i == 0 else SEL_Y + 26)
            q = ease((tl - (ct - 0.5)) / 0.4)
            cur = (lerp(prev[0] + (0 if i == 0 else 16), SEL_CARDS_X[i] + 16, q),
                   lerp(prev[1], SEL_Y + 26, q))
    moved_idx = 0
    for i, cx in enumerate(SEL_CARDS_X):
        kind = CARD_KINDS[i]
        chosen = tl >= CURSOR_T[i] and PICK[i]
        rejected = tl >= CURSOR_T[i] and not PICK[i]
        if chosen and tl > STRIP_T:
            q = ease((tl - STRIP_T - moved_idx * 0.15) / 0.5)
            fx = FILM_X[moved_idx]
            x = lerp(cx, fx, q)
            y = lerp(SEL_Y, FILM_Y - 2, q)
            if q >= 1:
                rect(d, fx - 1, FILM_Y - 1, 32, 36, "k")
                draw_picture(d, fx + 1, FILM_Y + 1, kind, w=38, h=30) if False else None
                rect(d, fx, FILM_Y, 30, 33, "w")
                draw_picture(d, fx + 2, FILM_Y + 2, kind, w=26, h=29)
            else:
                draw_card(d, x, y, kind, hl="y")
            moved_idx += 1
            continue
        if chosen:
            draw_card(d, cx, SEL_Y, kind, hl="y")
            if tl - CURSOR_T[i] < 0.35:
                sparkle(d, cx + 30, SEL_Y - 2, "y", 3)
        elif rejected:
            draw_card(d, cx, SEL_Y, kind, gray=tl > STRIP_T)
            if tl < STRIP_T:
                d.line([(cx + 6, SEL_Y + 6), (cx + 24, SEL_Y + 30)], fill=C["r"], width=3)
                d.line([(cx + 24, SEL_Y + 6), (cx + 6, SEL_Y + 30)], fill=C["r"], width=3)
        else:
            draw_card(d, cx, SEL_Y, kind)
        if chosen and tl < STRIP_T:
            s = "OK"
            text(d, cx + 15 - text_w(s) // 2, SEL_Y + 37, s, "y", "k")
    # つながった線と再生マーク
    if tl > STRIP_T + 0.9:
        for i in range(2):
            x = FILM_X[i] + 31
            for k in range(0, 14, 2):
                if int(tl * 10) % 2 == (k // 2) % 2:
                    d.point((x + k, FILM_Y + 15), fill=C["y"])
        if (tl * 2) % 1 < 0.7:
            px = 256
            rect(d, px - 2, FILM_Y + 4, 22, 26, "r")
            frame_rect(d, px - 2, FILM_Y + 4, 22, 26, "k")
            d.polygon([(px + 5, FILM_Y + 10), (px + 5, FILM_Y + 24), (px + 14, FILM_Y + 17)],
                      fill=C["w"])
    if cur is not None and tl < STRIP_T:
        press = any(0 <= tl - ct < 0.12 for ct in CURSOR_T)
        sprite(d, HAND, cur[0] - 2, cur[1] + (2 if press else 0))


def scene5(img, d, tl):
    bg_room(d, wall="u", floor="v")
    # 紙ふぶき
    rng = random.Random(11)
    for _ in range(40):
        x0 = rng.randrange(W)
        sp = rng.uniform(18, 40)
        ph = rng.uniform(0, 120)
        y = (tl * sp + ph) % 130 - 10
        x = x0 + math.sin(tl * 3 + ph) * 4
        col = rng.choice(["y", "p", "b", "e", "a", "w"])
        rect(d, x, y, 2, 2, col)
    # テレビ（完成した動画を上映中）
    tx, ty = 40, 36
    rect(d, tx + 20, ty + 58, 40, 8, "d")
    rect(d, tx, ty, 80, 60, "o")
    frame_rect(d, tx, ty, 80, 60, "k")
    rect(d, tx + 5, ty + 5, 70, 50, "k")
    kind = [0, 1, 2][int(tl / 0.8) % 3]
    pic = Image.new("RGB", (22, 15))
    draw_picture(ImageDraw.Draw(pic), 0, 0, kind, w=22, h=15)
    img.paste(pic.resize((66, 45), Image.NEAREST), (tx + 7, ty + 7))
    if (tl * 2) % 1 < 0.6:
        rect(d, tx + 8, ty + 8, 5, 5, "r")
    # 見ている人たち（よろこぶ）
    viewers = [(148, "k", "e", 0.0), (180, "a", "b", 1.3), (212, "u", "y", 2.1)]
    for i, (vx, hair, shirt, ph) in enumerate(viewers):
        draw_viewer(d, vx, 119, hair, shirt, tl, ph)
    # ハートがふわふわ上がる
    for i in range(7):
        base = i * 0.55
        if tl < 0.4 + base:
            continue
        p = ((tl - 0.4 - base) % 2.6) / 2.6
        vx = viewers[i % 3][0]
        x = vx + math.sin(p * 8 + i) * 6
        y = 96 - p * 70
        if y > 26:
            draw_heart(d, x, y)
    # 主人公もばんざい
    jump = int(abs(math.sin(tl * 5)) * 6)
    draw_girl(d, 268, 119 - jump, tl, happy=True)
    if tl > 0.3:
        sparkle(d, 268 + math.sin(tl * 4) * 14, 70, "y", 2 + int(tl * 4) % 2)


SCENES = [scene_title, scene1, scene2, scene3, scene4, scene5]


def render(t):
    img = Image.new("RGB", (W, H), C["k"])
    d = ImageDraw.Draw(img)
    d.fontmode = "1"
    sc, tl = scene_at(t)
    SCENES[sc](img, d, tl)
    if LABELS[sc]:
        draw_label(d, LABELS[sc])
    if DIALOG[sc]:
        draw_dialog(d, DIALOG[sc], shown_chars(sc, tl), tl)
    draw_transition(d, t)
    return img


# ---------------------------------------------------------------- 効果音
def note_freq(n):
    """MIDI ノート番号 → 周波数"""
    return 440.0 * 2 ** ((n - 69) / 12)


def square(freq, dur, vol=0.2, duty=0.5, decay=0.0, slide=0.0):
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = freq + slide * t / max(dur, 1e-6)
    phase = np.cumsum(f) / SR
    wv = np.where((phase % 1.0) < duty, 1.0, -1.0)
    env = np.ones(n)
    if decay:
        env = np.exp(-t * decay)
    a = min(n, int(SR * 0.003))
    env[:a] *= np.linspace(0, 1, a)
    env[-a:] *= np.linspace(1, 0, a)
    return wv * env * vol


def triangle(freq, dur, vol=0.25):
    n = int(SR * dur)
    t = np.arange(n) / SR
    ph = (t * freq) % 1.0
    wv = 4 * np.abs(ph - 0.5) - 1
    env = np.ones(n)
    a = min(n, int(SR * 0.01))
    env[-a:] *= np.linspace(1, 0, a)
    return wv * env * vol


def noise(dur, vol=0.1, decay=20):
    n = int(SR * dur)
    rng = np.random.default_rng(1)
    # 8bit 風に粗いノイズ
    raw = rng.choice([-1.0, 1.0], size=n // 40 + 1).repeat(40)[:n]
    return raw * np.exp(-np.arange(n) / SR * decay) * vol


def sfx_blip():
    return square(1320, 0.028, vol=0.07, duty=0.25)


def sfx_decide():
    return np.concatenate([square(note_freq(83), 0.06, 0.16, 0.5),
                           square(note_freq(88), 0.14, 0.16, 0.5, decay=8)])


def sfx_item():
    notes = [72, 76, 79, 84, 88]
    parts = [square(note_freq(n), 0.055, 0.14, 0.25) for n in notes]
    parts.append(square(note_freq(91), 0.22, 0.14, 0.25, decay=6))
    return np.concatenate(parts)


def sfx_whoosh():
    return square(900, 0.18, vol=0.05, duty=0.5, decay=10, slide=-700) + noise(0.18, 0.04, 18)


def sfx_fanfare():
    """ステージクリアのファンファーレ（3 声）"""
    beat = 0.11
    mel = [(67, 1), (72, 1), (76, 1), (79, 3), (76, 1), (79, 6),
           (0, 1), (77, 1), (77, 1), (77, 1), (79, 2), (81, 2), (84, 8)]
    bass = [(48, 6), (48, 6), (53, 6), (48, 10)]
    harm = [(64, 3), (67, 3), (64, 6), (0, 1), (72, 5), (76, 8)]

    def voice(seq, fn):
        parts = []
        for n, l in seq:
            dur = l * beat
            if n == 0:
                parts.append(np.zeros(int(SR * dur)))
            else:
                parts.append(fn(n, dur))
        return np.concatenate(parts)

    a = voice(mel, lambda n, dur: square(note_freq(n), dur, 0.15, 0.5, decay=1.5))
    b = voice(harm, lambda n, dur: square(note_freq(n), dur, 0.07, 0.25, decay=2))
    c = voice(bass, lambda n, dur: triangle(note_freq(n), dur, 0.3))
    L = max(len(a), len(b), len(c))
    out = np.zeros(L)
    for v in (a, b, c):
        out[:len(v)] += v
    return out


def build_audio():
    buf = np.zeros(int(SR * DURATION) + SR)

    def put(t, s):
        i = int(t * SR)
        j = min(len(buf), i + len(s))
        buf[i:j] += s[:j - i]

    blip, decide, item, whoosh = sfx_blip(), sfx_decide(), sfx_item(), sfx_whoosh()
    # タイトル：PRESS START で決定音
    put(T_SCENES[0] + PRESS_AT, decide)
    # 場面切り替え
    for b in T_SCENES[1:-1]:
        put(b - TR_HALF, whoosh)
    # 字幕の文字音
    for sc in range(1, 6):
        lines = DIALOG[sc]
        n = sum(len(l) for l in lines)
        chars = "".join(lines)
        for i in range(n):
            if chars[i] in "、。？！ ":
                continue
            put(T_SCENES[sc] + DIALOG_DELAY[sc] + i * CHAR_SEC, blip)
    # STAGE 1：電球がひかる
    put(T_SCENES[1] + 1.5, item)
    # STAGE 2：メモの項目ごとに決定音
    for i, it in enumerate(MEMO_ITEMS):
        put(T_SCENES[2] + MEMO_T0 + i * MEMO_STEP + len(it) * 0.13 + 0.1, decide)
    # STAGE 3：カードが出るたびにアイテム入手音
    put(T_SCENES[3] + 1.1, decide)
    for i in range(4):
        put(T_SCENES[3] + CARD_T0 + i * CARD_STEP + 0.15, item)
    # STAGE 4：選ぶ（決定音）、選ばない（低いブー）
    for i, ct in enumerate(CURSOR_T):
        if PICK[i]:
            put(T_SCENES[4] + ct, decide)
        else:
            put(T_SCENES[4] + ct, square(160, 0.2, 0.12, 0.5, decay=4))
    put(T_SCENES[4] + STRIP_T + 0.8, item)
    # STAGE CLEAR：ファンファーレ
    put(T_SCENES[5] + 0.15, sfx_fanfare())

    buf = buf[:int(SR * DURATION)]
    peak = np.max(np.abs(buf))
    if peak > 0.95:
        buf *= 0.95 / peak
    return (buf * 32767).astype(np.int16)


# ---------------------------------------------------------------- 書き出し
def ffmpeg_exe():
    from shutil import which
    exe = which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def export_stills(outdir, times):
    os.makedirs(outdir, exist_ok=True)
    for t in times:
        img = render(t).resize((W * SCALE, H * SCALE), Image.NEAREST)
        img.save(os.path.join(outdir, f"still_{t:05.2f}.png"))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.getcwd()
    if "--stills" in sys.argv:
        times = [float(x) for x in sys.argv[sys.argv.index("--stills") + 1].split(",")]
        export_stills(os.environ.get("STILL_DIR", os.path.join(here, "stills")), times)
        return

    wav_path = os.path.join(out_dir, "_sfx_tmp.wav")
    audio = build_audio()
    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(audio.tobytes())

    out = os.path.join(out_dir, OUT_NAME)
    cmd = [ffmpeg_exe(), "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W * SCALE}x{H * SCALE}",
           "-r", str(FPS), "-i", "-", "-i", wav_path,
           "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    total = int(DURATION * FPS)
    for f in range(total):
        img = render(f / FPS).resize((W * SCALE, H * SCALE), Image.NEAREST)
        proc.stdin.write(img.tobytes())
    proc.stdin.close()
    proc.wait()
    os.remove(wav_path)
    print("saved:", out)


if __name__ == "__main__":
    main()
