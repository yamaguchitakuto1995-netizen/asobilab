"""【30秒でわかる、AI活用ができるまで】レトロゲーム風アニメーションを生成する。

make_video.py（AI動画ができるまで）と同じ主人公・ロボット・会話ウィンドウ・効果音を使う続編。
絵・動き・効果音はすべてプログラムで作る（外部素材・生成AIは不使用）。

使い方: python3 scripts/retro_video/make_ai_katsuyo.py [--stills 1.5,6.0,...]
"""
import math
import os
import random
import subprocess
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_video as base  # noqa: E402
from make_video import (C, H, W, SCALE, FPS, SR, DURATION, draw_bubble, draw_girl,  # noqa: E402
                        draw_heart, draw_robot, ease, frame_rect, lerp, rect, sparkle,
                        sprite, text, text_w, big_text, bg_room, bg_stars, BULB)

OUT_NAME = "ai_katsuyo_retro.mp4"

# ---------------------------------------------------------------- タイムライン
T_SCENES = [0.0, 4.0, 9.2, 15.0, 20.6, 25.4, 30.0]
LABELS = [None, "STAGE 1 企画する", "STAGE 2 言葉にする", "STAGE 3 分解する",
          "STAGE 4 AIに任せる", "STAGE CLEAR"]
DIALOG = [
    None,
    ["まずは企画する。", "何をAIでラクにしたいか考えよう！"],
    ["言葉にして、メモに書きだそう。", "私の、どんな仕事を、AIに任せる？"],
    ["自分の仕事を、小さな部品に", "分解してみよう！"],
    ["この3つの作業は、AIに任せよう！", "くりかえし・手間だけ・いやな作業"],
    ["自分の時間が生まれたら、", "AI活用が成功です！"],
]
DIALOG_DELAY = [0, 0.55, 0.55, 0.55, 0.55, 1.3]

# 字幕が会話ウィンドウに収まるか（内側の幅 284px）を確認
for _lines in DIALOG[1:]:
    for _l in _lines:
        assert text_w(_l) <= 276, (_l, text_w(_l))

# 共通部品（場面切り替え・字幕表示）はこの動画の設定で動かす
base.T_SCENES = T_SCENES
base.LABELS = LABELS
base.DIALOG = DIALOG
base.DIALOG_DELAY = DIALOG_DELAY


# ---------------------------------------------------------------- タイトル
PRESS_AT = 2.9


def scene_title(img, d, tl):
    bg_stars(d, tl)
    rect(d, 6, 22, 308, 72, "k")
    frame_rect(d, 8, 24, 304, 68, "a")
    frame_rect(d, 10, 26, 300, 64, "y")
    s = "30秒でわかる"
    text(d, 160 - text_w(s) // 2, 32, s, "p")
    bounce = int(math.sin(tl / 0.6 * math.pi) * -6) if tl < 0.6 else 0
    big_text(img, 160, 50 + bounce, "AI活用ができるまで", "w", "u")
    draw_girl(d, 144, 148 - (1 if (tl * 2) % 1 < 0.5 else 0), tl)
    draw_robot_small(d, 176, 148, tl)
    if tl < PRESS_AT:
        vis = (tl * 1.6) % 1 < 0.6
    else:
        vis = ((tl - PRESS_AT) * 10) % 1 < 0.5
    if vis:
        s = "PRESS START"
        text(d, 160 - text_w(s) // 2, 104, s, "y" if tl >= PRESS_AT else "w")
    s = "(C) 2026 ASOBI LAB"
    text(d, 160 - text_w(s) // 2, 158, s, "l")


def draw_robot_small(d, x, y, t):
    """タイトル用のミニロボット（本編のロボットと同じ配色）。x,y は足元の左端。"""
    top = y - 22
    rect(d, x + 7, top - 3, 2, 3, "d")
    rect(d, x + 6, top - 5, 4, 2, "r" if (t * 3) % 1 < 0.5 else "u")
    rect(d, x + 1, top, 14, 10, "l")
    frame_rect(d, x + 1, top, 14, 10, "k")
    rect(d, x + 3, top + 2, 10, 6, "n")
    rect(d, x + 5, top + 4, 2, 2, "e")
    rect(d, x + 9, top + 4, 2, 2, "e")
    rect(d, x, top + 10, 16, 9, "l")
    frame_rect(d, x, top + 10, 16, 9, "k")
    rect(d, x + 3, top + 13, 2, 2, "r")
    rect(d, x + 7, top + 13, 2, 2, "y")
    rect(d, x + 11, top + 13, 2, 2, "e")
    rect(d, x + 2, top + 19, 4, 3, "d")
    rect(d, x + 10, top + 19, 4, 3, "d")


# ---------------------------------------------------------------- STAGE 1
def scene1(img, d, tl):
    bg_room(d)
    rect(d, 40, 92, 50, 6, "o")
    rect(d, 44, 98, 4, 20, "o")
    rect(d, 82, 98, 4, 20, "o")
    # 机の上の書類の山（いそがしさ）
    for i in range(4):
        rect(d, 52 + i % 2, 84 - i * 3, 16, 3, "w")
        frame_rect(d, 52 + i % 2, 84 - i * 3, 16, 3, "l")
    rect(d, 72, 84, 12, 8, "l")
    rect(d, 74, 86, 8, 4, "b")
    rect(d, 14, 104, 12, 14, "o")
    rect(d, 10, 92, 20, 12, "g")
    rect(d, 14, 88, 12, 4, "e")
    gx, gy = 150, 119
    lit = tl > 1.5
    draw_girl(d, gx, gy - (2 if lit and (tl * 6) % 1 < 0.5 else 0), tl, happy=lit and tl < 3.2)
    bx, by = gx - 4, 70
    if tl < 1.5:
        if tl > 0.5:
            dots = int((tl - 0.5) / 0.3) % 4
            for i in range(dots):
                rect(d, gx + 12 + i * 4, 86, 2, 2, "w")
        if tl > 0.3:
            sprite(d, BULB, bx, by, {"y": "d", "w": "l"})
    else:
        pop = tl - 1.5
        yy = by - int(ease(pop / 0.2) * 3)
        if (pop * 8) % 1 < 0.7:
            for a in range(8):
                ang = a * math.pi / 4 + pop * 0.8
                r2 = 13 + int(2 * math.sin(pop * 10))
                for r in range(9, r2):
                    d.point((bx + 4 + int(math.cos(ang) * r), yy + 5 + int(math.sin(ang) * r)),
                            fill=C["y"])
        sprite(d, BULB, bx, yy)
        if pop < 1.2:
            text(d, gx + 18, 76, "ひらめいた！", "y", "k")


# ---------------------------------------------------------------- STAGE 2
MEMO_ITEMS = ["私の", "どんな仕事を", "AIに任せる？"]
MEMO_T0, MEMO_STEP = 0.8, 1.1
MEMO_CHAR = 0.13


def scene2(img, d, tl):
    bg_room(d, window=False)
    draw_girl(d, 62, 119, tl)
    mx, my, mw, mh = 112, 28, 180, 88
    rect(d, mx + 3, my + 3, mw, mh, "k")
    rect(d, mx, my, mw, mh, "w")
    frame_rect(d, mx, my, mw, mh, "k")
    rect(d, mx, my, mw, 18, "a")
    frame_rect(d, mx, my, mw, 18, "k")
    text(d, mx + 6, my + 1, "MEMO", "k")
    for i in range(3):
        rect(d, mx + 4, my + 36 + i * 22, mw - 8, 1, "l")
    px = py = None
    for i, item in enumerate(MEMO_ITEMS):
        t0 = MEMO_T0 + i * MEMO_STEP
        if tl < t0:
            break
        n = min(len(item), int((tl - t0) / MEMO_CHAR) + 1)
        yy = my + 20 + i * 22
        frame_rect(d, mx + 6, yy + 3, 10, 10, "k")
        if n == len(item) and tl - t0 > len(item) * MEMO_CHAR + 0.1:
            d.line([(mx + 7, yy + 8), (mx + 10, yy + 11), (mx + 15, yy + 3)], fill=C["r"])
            d.line([(mx + 8, yy + 8), (mx + 10, yy + 10), (mx + 16, yy + 3)], fill=C["r"])
        s = "「" + item[:n] + ("」" if n == len(item) else "")
        text(d, mx + 22, yy, s, "k")
        px = mx + 22 + text_w("「" + item[:n])
        py = yy
    if px is not None and tl < MEMO_T0 + 3 * MEMO_STEP + 0.3:
        wig = int(math.sin(tl * 30) * 1.5)
        pxi, pyi = px + 2, py + 10 + wig
        d.polygon([(pxi, pyi), (pxi + 3, pyi - 6), (pxi + 6, pyi - 3)], fill=C["s"])
        for k in range(10):
            rect(d, pxi + 4 + k, pyi - 6 - k, 3, 3, "a")
        rect(d, pxi + 13, pyi - 16, 3, 3, "p")
        d.point((pxi, pyi), fill=C["k"])
    if 0.2 < tl < 1.4:
        draw_bubble(d, 42, 70, "かこう！")


# ---------------------------------------------------------------- STAGE 3
def draw_part(d, kind, cx, cy, t=0.0):
    """仕事の部品。cx,cy は中心。"""
    cx, cy = int(cx), int(cy)
    if kind == 0:  # ネジ
        rect(d, cx - 5, cy - 7, 11, 4, "l")
        frame_rect(d, cx - 5, cy - 7, 11, 4, "k")
        rect(d, cx - 1, cy - 7, 3, 2, "d")
        rect(d, cx - 2, cy - 3, 5, 9, "l")
        frame_rect(d, cx - 2, cy - 3, 5, 9, "k")
        for j in range(-2, 6, 2):
            d.line([(cx - 2, cy + j), (cx + 2, cy + j - 1)], fill=C["d"])
        d.point((cx, cy + 7), fill=C["k"])
    elif kind == 1:  # ボルト
        d.polygon([(cx - 6, cy - 5), (cx - 3, cy - 8), (cx + 3, cy - 8), (cx + 6, cy - 5),
                   (cx + 3, cy - 2), (cx - 3, cy - 2)], fill=C["v"], outline=C["k"])
        rect(d, cx - 2, cy - 2, 5, 10, "v")
        frame_rect(d, cx - 2, cy - 2, 5, 10, "k")
        for j in range(0, 8, 2):
            rect(d, cx - 1, cy + j, 3, 1, "d")
    elif kind == 2:  # 板
        rect(d, cx - 12, cy - 4, 24, 8, "a")
        frame_rect(d, cx - 12, cy - 4, 24, 8, "k")
        rect(d, cx - 9, cy - 2, 8, 1, "o")
        rect(d, cx + 1, cy + 1, 9, 1, "o")
        d.point((cx - 10, cy + 2), fill=C["o"])
    elif kind == 3:  # 歯車
        ang0 = t * 3
        for a in range(8):
            ang = ang0 + a * math.pi / 4
            rect(d, cx + math.cos(ang) * 7 - 1, cy + math.sin(ang) * 7 - 1, 3, 3, "y")
        d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=C["y"], outline=C["k"])
        d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=C["k"])
    else:  # ナット
        d.polygon([(cx - 6, cy), (cx - 3, cy - 5), (cx + 3, cy - 5), (cx + 6, cy),
                   (cx + 3, cy + 5), (cx - 3, cy + 5)], fill=C["l"], outline=C["k"])
        d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=C["n"], outline=C["k"])


PART_SPOTS = [(168, 56), (200, 42), (236, 54), (272, 42), (302, 56)]
PART_T0, PART_STEP = 1.2, 0.55
BOX_X, BOX_Y = 188, 90       # 箱の左上
ROBOT3_X = 100


def draw_box(d, open_p):
    x, y = BOX_X, BOX_Y
    # 開いたふた
    if open_p > 0:
        a = int(10 * open_p)
        d.polygon([(x, y), (x - a, y - 8), (x + 26 - a, y - 8), (x + 26, y)],
                  fill=C["a"], outline=C["k"])
        d.polygon([(x + 52, y), (x + 52 + a, y - 8), (x + 26 + a, y - 8), (x + 26, y)],
                  fill=C["a"], outline=C["k"])
        rect(d, x + 2, y, 48, 3, "k")
    else:
        rect(d, x, y - 2, 52, 3, "a")
        rect(d, x + 25, y - 2, 2, 3, "o")
    rect(d, x, y + 2, 52, 27, "o")
    frame_rect(d, x, y + 2, 52, 27, "k")
    rect(d, x + 24, y + 2, 4, 8, "a")
    s = "しごと"
    text(d, x + 26 - text_w(s) // 2, y + 10, s, "w", "k")


def scene3(img, d, tl):
    bg_room(d, window=False)
    draw_girl(d, 38, 119, tl, happy=tl > PART_T0 + 5 * PART_STEP)
    working = PART_T0 - 0.4 < tl < PART_T0 + 5 * PART_STEP
    draw_robot(d, ROBOT3_X, 119, tl, working)
    open_p = ease((tl - 0.5) / 0.4)
    draw_box(d, open_p)
    if 0.5 < tl < 1.2:
        draw_bubble(d, ROBOT3_X + 2, 26, "ぶんかい！")
    for i, (sx, sy) in enumerate(PART_SPOTS):
        t0 = PART_T0 + i * PART_STEP
        if tl < t0:
            continue
        q = ease((tl - t0) / 0.4)
        x0, y0 = BOX_X + 26, BOX_Y
        x = lerp(x0, sx, q)
        y = lerp(y0, sy, q) - math.sin(q * math.pi) * 22
        draw_part(d, i, x, y, tl)
        if q >= 1:
            if tl - t0 < 0.75:
                sparkle(d, sx + 9, sy - 9, "y", 3)


# ---------------------------------------------------------------- STAGE 4
TASKS = ["何回もやる同じ作業", "手間だけかかる作業", "やりたくない作業"]
TASK_X, TASK_Y0, TASK_DY = 50, 34, 28
TASK_W, TASK_H = 176, 22
TASK_T0, TASK_STEP = 0.9, 0.9
ROBOT4_X = 258


def draw_task_icon(d, kind, x, y, t):
    if kind == 0:  # くりかえし（ぐるぐる矢印）
        d.arc([x, y, x + 12, y + 12], 30, 330, fill=C["b"], width=2)
        d.polygon([(x + 9, y - 1), (x + 13, y + 3), (x + 8, y + 5)], fill=C["b"])
    elif kind == 1:  # 手間（砂時計）
        d.polygon([(x + 1, y), (x + 11, y), (x + 6, y + 6)], fill=C["y"], outline=C["w"])
        d.polygon([(x + 1, y + 12), (x + 11, y + 12), (x + 6, y + 6)], fill=C["a"], outline=C["w"])
    else:  # いやな作業（しかめっ面）
        d.ellipse([x, y, x + 12, y + 12], fill=C["u"], outline=C["w"])
        rect(d, x + 3, y + 4, 2, 2, "w")
        rect(d, x + 8, y + 4, 2, 2, "w")
        d.line([(x + 3, y + 9), (x + 6, y + 8), (x + 9, y + 9)], fill=C["w"])


def draw_task(d, i, x, y, t, done=False):
    x, y = int(x), int(y)
    rect(d, x, y, TASK_W, TASK_H, "k")
    frame_rect(d, x + 1, y + 1, TASK_W - 2, TASK_H - 2, "w" if not done else "d")
    if done:
        rect(d, x + 3, y + 3, 18, 16, "r")
        frame_rect(d, x + 3, y + 3, 18, 16, "w")
        text(d, x + 4, y + 3, "AI", "w")
    else:
        draw_task_icon(d, i, x + 5, y + 5, t)
    text(d, x + 24, y + 3, TASKS[i], "l" if done else "w")


def scene4(img, d, tl):
    bg_room(d, window=False)
    draw_girl(d, 26, 119, tl, happy=tl > TASK_T0 + 3 * TASK_STEP)
    last = TASK_T0 + 2 * TASK_STEP + 0.5
    working = TASK_T0 + 0.3 < tl
    draw_robot(d, ROBOT4_X, 119, tl, working)
    for i in range(3):
        t0 = TASK_T0 + i * TASK_STEP
        y = TASK_Y0 + i * TASK_DY
        # 作業パネルが画面の左から出てくる
        appear = ease((tl - 0.15 * i) / 0.4)
        x = lerp(-TASK_W, TASK_X, appear)
        if tl < t0:
            draw_task(d, i, x, y, tl)
            continue
        q = (tl - t0) / 0.5
        if q < 1:
            # ロボットへ飛んでいく
            e = ease(q)
            fx = lerp(TASK_X, ROBOT4_X + 10, e)
            fy = lerp(y, 70, e) - math.sin(e * math.pi) * 16
            s = 1 - e * 0.85
            w, h = int(TASK_W * s), max(4, int(TASK_H * s))
            rect(d, fx, fy, w, h, "k")
            frame_rect(d, fx, fy, w, h, "w")
            if s > 0.6:
                draw_task_icon(d, i, fx + 5, fy + 5, tl)
            # 残った枠
            frame_rect(d, TASK_X, y, TASK_W, TASK_H, "d")
        else:
            # 任せた作業は「AI」のはんこ付きで灰色に
            draw_task(d, i, TASK_X, y, tl, done=True)
            if q < 1.6:
                sparkle(d, ROBOT4_X + 22, 44, "y", 3)
    if tl > last + 0.2:
        draw_bubble(d, ROBOT4_X - 30, 22, "まかせて！")
    elif TASK_T0 - 0.6 < tl < TASK_T0 - 0.05:
        draw_bubble(d, 34, 70, "おねがい！")


# ---------------------------------------------------------------- STAGE CLEAR
NOTE = [
    "..kkk",
    "..kwk",
    "..k.k",
    "..k..",
    "kkk..",
    "kwk..",
    "kkk..",
]


def draw_clock(d, cx, cy, t):
    d.ellipse([cx - 13, cy - 13, cx + 13, cy + 13], fill=C["k"])
    d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=C["w"], outline=C["a"])
    for k in range(12):
        a = k * math.pi / 6
        d.point((cx + int(math.cos(a) * 10), cy + int(math.sin(a) * 10)), fill=C["d"])
    a1 = t * 1.2 - math.pi / 2
    a2 = t * 8 - math.pi / 2
    d.line([(cx, cy), (cx + int(math.cos(a1) * 6), cy + int(math.sin(a1) * 6))], fill=C["k"], width=2)
    d.line([(cx, cy), (cx + int(math.cos(a2) * 9), cy + int(math.sin(a2) * 9))], fill=C["r"])


GAUGE_T0, GAUGE_T1 = 0.4, 2.2


def scene5(img, d, tl):
    bg_room(d, wall="u", window=False)
    rng = random.Random(11)
    for _ in range(36):
        x0 = rng.randrange(W)
        sp = rng.uniform(18, 40)
        ph = rng.uniform(0, 120)
        y = (tl * sp + ph) % 130 - 10
        x = x0 + math.sin(tl * 3 + ph) * 4
        rect(d, x, y, 2, 2, rng.choice(["y", "p", "b", "e", "a", "w"]))
    # 「じぶんの時間」ゲージ
    gx, gy = 118, 6
    rect(d, gx, gy, 196, 22, "k")
    frame_rect(d, gx + 1, gy + 1, 194, 20, "w")
    text(d, gx + 6, gy + 3, "じぶんの時間", "y")
    bx, bw = gx + 108, 80
    frame_rect(d, bx, gy + 6, bw, 10, "w")
    p = ease((tl - GAUGE_T0) / (GAUGE_T1 - GAUGE_T0))
    full = p >= 1
    col = "e" if not full or (tl * 6) % 1 < 0.5 else "y"
    rect(d, bx + 2, gy + 8, int((bw - 4) * p), 6, col)
    if full:
        s = "MAX!"
        if (tl * 3) % 1 < 0.7:
            text(d, bx + bw // 2 - text_w(s) // 2, gy + 20, s, "y", "k")
    # ロボットが机で仕事中
    rect(d, 30, 96, 70, 6, "o")
    rect(d, 34, 102, 4, 16, "o")
    rect(d, 92, 102, 4, 16, "o")
    rect(d, 52, 76, 30, 20, "d")
    frame_rect(d, 52, 76, 30, 20, "k")
    rect(d, 55, 79, 24, 14, "n")
    for j in range(3):
        w = (int(tl * 12) + j * 5) % 18 + 4
        rect(d, 57, 81 + j * 4, w, 2, "e")
    draw_robot(d, 94, 119, tl, True)
    for k in range(2):
        if int(tl * 8 + k) % 2 == 0:
            sparkle(d, 86 + k * 6, 60 + k * 8, "y", 2)
    # 時計（時間がうまれる）
    draw_clock(d, 186, 62, tl)
    # 主人公はのんびり、よろこぶ
    jump = int(abs(math.sin(tl * 4)) * 5)
    draw_girl(d, 252, 119 - jump, tl, happy=True)
    # お茶
    rect(d, 272, 108, 8, 10, "w")
    frame_rect(d, 272, 108, 8, 10, "k")
    rect(d, 280, 111, 2, 4, "w")
    for k in range(2):
        yy = 102 - int((tl * 10 + k * 3) % 8)
        d.point((275 + k * 2, yy), fill=C["l"])
    # 音符とハート
    for i in range(4):
        base_t = i * 0.6
        if tl < 0.6 + base_t:
            continue
        q = ((tl - 0.6 - base_t) % 2.4) / 2.4
        x = 236 + i * 10 + math.sin(q * 7 + i) * 5
        y = 94 - q * 42
        if i % 2:
            sprite(d, NOTE, x, y, {"w": "y"})
        else:
            draw_heart(d, x, y)


SCENES = [scene_title, scene1, scene2, scene3, scene4, scene5]
base.SCENES = SCENES


# ---------------------------------------------------------------- 効果音
def build_audio():
    buf = np.zeros(int(SR * DURATION) + SR)

    def put(t, s):
        i = int(t * SR)
        j = min(len(buf), i + len(s))
        buf[i:j] += s[:j - i]

    blip, decide, item, whoosh = base.sfx_blip(), base.sfx_decide(), base.sfx_item(), base.sfx_whoosh()
    put(PRESS_AT, decide)
    for b in T_SCENES[1:-1]:
        put(b - base.TR_HALF, whoosh)
    for sc in range(1, 6):
        chars = "".join(DIALOG[sc])
        for i, ch in enumerate(chars):
            if ch in "、。？！・ ":
                continue
            put(T_SCENES[sc] + DIALOG_DELAY[sc] + i * base.CHAR_SEC, blip)
    # STAGE 1：電球
    put(T_SCENES[1] + 1.5, item)
    # STAGE 2：メモ 1 項目ごとに決定音
    for i, it in enumerate(MEMO_ITEMS):
        put(T_SCENES[2] + MEMO_T0 + i * MEMO_STEP + len(it) * MEMO_CHAR + 0.1, decide)
    # STAGE 3：箱が開く→部品が出るたびにアイテム音
    put(T_SCENES[3] + 0.5, decide)
    for i in range(len(PART_SPOTS)):
        put(T_SCENES[3] + PART_T0 + i * PART_STEP + 0.35, item)
    # STAGE 4：任せるたびに決定音、全部任せたらアイテム音
    for i in range(3):
        put(T_SCENES[4] + TASK_T0 + i * TASK_STEP + 0.5, decide)
    put(T_SCENES[4] + TASK_T0 + 2 * TASK_STEP + 0.75, item)
    # STAGE CLEAR：ゲージが上がる音 → ファンファーレ
    n = 12
    for k in range(n):
        f = base.note_freq(60 + k * 2)
        put(T_SCENES[5] + GAUGE_T0 + k * (GAUGE_T1 - GAUGE_T0) / n * 0.5,
            base.square(f, 0.04, 0.08, 0.25))
    put(T_SCENES[5] + GAUGE_T0 + (GAUGE_T1 - GAUGE_T0) * 0.5 + 0.05, base.sfx_fanfare())

    buf = buf[:int(SR * DURATION)]
    peak = np.max(np.abs(buf))
    if peak > 0.95:
        buf *= 0.95 / peak
    return (buf * 32767).astype(np.int16)


# ---------------------------------------------------------------- 書き出し
def main():
    here = os.path.dirname(os.path.abspath(__file__))
    if "--stills" in sys.argv:
        times = [float(x) for x in sys.argv[sys.argv.index("--stills") + 1].split(",")]
        base.export_stills(os.environ.get("STILL_DIR", os.path.join(here, "stills")), times)
        return
    out_dir = os.getcwd()
    wav_path = os.path.join(out_dir, "_sfx_katsuyo_tmp.wav")
    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(build_audio().tobytes())
    out = os.path.join(out_dir, OUT_NAME)
    cmd = [base.ffmpeg_exe(), "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W * SCALE}x{H * SCALE}",
           "-r", str(FPS), "-i", "-", "-i", wav_path,
           "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(int(DURATION * FPS)):
        img = base.render(f / FPS).resize((W * SCALE, H * SCALE), Image.NEAREST)
        proc.stdin.write(img.tobytes())
    proc.stdin.close()
    proc.wait()
    os.remove(wav_path)
    print("saved:", out)


if __name__ == "__main__":
    main()
