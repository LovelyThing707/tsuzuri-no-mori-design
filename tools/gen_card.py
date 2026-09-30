# -*- coding: utf-8 -*-
"""本棚の天板に画鋲で留める、手書きの紙の札（棚のテーマ）の紙を描く。

  python tools/gen_card.py

10/1 のご依頼「本棚のテーマを添付のように紙に書いたように表示することは可能でしょうか？」
への対応。町の本屋の棚に留めてある、手書きの札の紙。
文字は絵に焼き込まない。札の文字は本文の見出し（読み上げ・メニュー・#theme-1 の行き先）
なので、紙だけを絵にして、その上に手書きの書体で文字を置く（shelf.css の .market__sign）。

書き出すもの（assets/images）
  shelf-card-paper.webp   札の紙。きなりの紙に、ごく薄いしわと紙の繊維。
                          四辺ははさみで切ったような、わずかに波打つ縁。まわりは透明

紙は白ではなく、きなりの色。店の明かりの中に置くので、色はやや落ち着いた暖かい色にしてある。
白い紙にすると、暗い木の上で光って見える（切り抜いて貼ったように見える）。
影は絵に描かない。紙の縁の形（透明度）から、画面の側で右下へ落とす。

札の幅は文字の長さで変わる（「夜に読む本」は短い）。絵は札の大きさいっぱいに伸ばして貼るので、
しわや繊維は向きを持たない細かなものにし、縦横の比が 3〜5.4 のあいだで伸び縮みしても
形が崩れて見えないようにしてある（縁の波も、伸ばして目立つほど大きくしない）。
大きさは、札の最大（幅 200px ほど・高さ 37px）を 3 倍の画面でも粗く見えない大きさ。

乱数は種を固定しているので、何度書き出しても同じ絵になる。
画像は長くキャッシュされる（vercel.json）。中身を変えたときは新しい名前で書き出し、
古い絵を消す。
"""
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'assets', 'images')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_light import blur, smooth_noise, smoothstep   # 同じ道具を使う

W, H = 640, 150          # 縦横の比 4.3。札の比（3〜5.4）のなかほど
M = 9                    # 縁の外の透明な余白


def edge_profile(rng, n, amp_low, amp_high):
    """はさみで切った縁のゆらぎ。長くゆるい波と、はさみを入れ直したところの小さな段、
    切り口のけば立ち"""
    low = (smooth_noise(rng, 1, n, 140)[0] - .5) * 2 * amp_low
    mid = (smooth_noise(rng, 1, n, 28)[0] - .5) * amp_low * .7
    fuzz = blur((rng.random((1, n)) - .5), 1.2)[0]
    fuzz = fuzz / max(1e-6, np.abs(fuzz).max()) * amp_high
    return low + mid + fuzz


def paper():
    rng = np.random.default_rng(20261001)
    y, x = np.mgrid[0:H, 0:W].astype(np.float64)

    # --- 紙の形。四辺それぞれに、ゆるい波と細かなけば立ち ---
    top = M + 3 + edge_profile(rng, W, 3.2, 1.2)
    bot = H - M - 3 + edge_profile(rng, W, 3.2, 1.2)
    lef = M + 3 + edge_profile(rng, H, 2.6, 1.1)
    rig = W - M - 3 + edge_profile(rng, H, 2.6, 1.1)
    # 縁からの距離（内側が正）。四辺のうち近いもの
    d = np.minimum.reduce([y - top[None, :], bot[None, :] - y, x - lef[:, None], rig[:, None] - x])
    # 角は少しだけ丸く欠ける（切り落とした角の小さなほつれ）
    for cx, cy in ((lef.mean(), top.mean()), (rig.mean(), top.mean()), (lef.mean(), bot.mean()), (rig.mean(), bot.mean())):
        r = rng.uniform(4, 7)
        corner = (np.abs(x - cx) < r) & (np.abs(y - cy) < r)
        dist = r - np.hypot(np.maximum(r - np.abs(x - cx), 0), np.maximum(r - np.abs(y - cy), 0))
        d = np.where(corner, np.minimum(d, dist - r * .35), d)
    alpha = np.clip((d + 1) / 2, 0, 1)       # 縁は 2px でなめらかに（札の大きさでは半画素）

    # --- 紙の色。きなり（白くない、晒していない紙の色） ---
    base = np.array([218.0, 202.0, 171.0])
    # 大きなむら（漉きむら・手の脂）。ごく弱く
    mott = (smooth_noise(rng, H, W, 48) - .5) * .07 + (smooth_noise(rng, H, W, 13) - .5) * .04
    # しわ。紙を一度くしゃりと握って伸ばした、ごく浅い折れ。
    # 折れ目の両側で面の向きが変わるので、窓（左上）に向いた側は明るく、反対の側は暗い
    fold = np.zeros_like(x)
    for _ in range(22):
        px_, py_ = rng.uniform(0, W), rng.uniform(0, H)
        ang = rng.uniform(0, np.pi)
        nx, ny = np.cos(ang), np.sin(ang)
        s = (x - px_) * nx + (y - py_) * ny
        along = (x - px_) * -ny + (y - py_) * nx
        # 折れ目は紙の端まで届かず、途中で消える
        span = rng.uniform(.08, .3) * W
        fade = np.exp(-0.5 * (along / span) ** 2)
        amp = rng.uniform(.015, .04) * (1 if rng.random() < .5 else -1)
        fold += amp * np.tanh(s / rng.uniform(3, 9)) * fade
        # 折れ目の筋。細い明るい稜線と、その脇の陰
        fold += .03 * np.exp(-0.5 * (s / 1.3) ** 2) * fade * (1 if amp > 0 else -.6)
    # 大きな明暗の塊にならないよう、ゆるやかな変化は抜いて折れの細かな面だけを残す
    fold = blur(fold, .8) - blur(fold, 30)
    # 紙の繊維。細かなざらつきと、ところどころ短い繊維
    fib = (rng.random((H, W)) - .5) * .07
    fib = blur(fib, .7)
    strands = np.zeros_like(x)
    for _ in range(18):
        sx, sy = rng.uniform(0, W), rng.uniform(0, H)
        a = rng.uniform(0, np.pi); L = rng.uniform(4, 9)
        t = np.linspace(-L / 2, L / 2, 40)
        bend = rng.uniform(-.08, .08)
        for tt in t:
            xx = int(round(sx + tt * np.cos(a + bend * tt))); yy = int(round(sy + tt * np.sin(a + bend * tt)))
            if 0 <= xx < W and 0 <= yy < H:
                strands[yy, xx] = 1
    strands = blur(strands, .7) * -.045
    shade = 1 + mott + fold + fib + strands
    # 縁は手ずれで少しくすみ、切り口の繊維がわずかに白く立つ
    rim = smoothstep(0, 12, d)
    shade *= .86 + .14 * rim
    shade += .05 * np.exp(-0.5 * ((d - 1.4) / .9) ** 2)
    rgb = base[None, None, :] * shade[:, :, None]
    # くすんだ縁は茶に寄る
    rgb[..., 2] -= (1 - rim) * 14
    rgb[..., 1] -= (1 - rim) * 5
    rgb = np.clip(rgb, 0, 255)
    rgba = np.dstack([rgb, alpha * 255]).astype(np.float64)
    return np.clip(rgba + .5, 0, 255).astype(np.uint8)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    a = paper()
    name = 'shelf-card-paper.webp'
    Image.fromarray(a, 'RGBA').save(os.path.join(IMG, name), 'WEBP', quality=88, alpha_quality=90, method=6)
    inner = a[a[..., 3] == 255][:, :3]
    print('%-22s %4dx%-4d  紙の色の平均 #%02x%02x%02x  %d バイト' % (
        name, W, H, *inner.mean(0).round().astype(int), os.path.getsize(os.path.join(IMG, name))))
