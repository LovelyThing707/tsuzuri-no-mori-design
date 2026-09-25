# -*- coding: utf-8 -*-
"""窓の左上から差す低い日差しを、当たるところごとの「光の地図」として描く。

  python tools/gen_light.py

光は、木に当たったところだけを明るく、金色にする。白や灰色の膜は重ねない。
地図は白黒で、白いところほど日が強く、黒いところには日が当たらない。
shelf.css はこの地図に日の色を掛け、色覆い焼き（color-dodge）で木に重ねる。
覆い焼きは下の木の色に掛け算で効くので、木目と色はそのままに明るく金色になり、
黒は黒のまま残る（暗いところが白っぽく浮かない）。

書き出すもの（assets/images）
  sunlight-floor.webp   本棚の手前の床。左下に落ちる細長い斜めの日の筋
  sunlight-deck.webp    平台の天面。手前ほど明るい日だまりと、斜めの光と影の帯
  sunlight-crown.webp   天板の小口。植物の真下は葉の影と、葉のすき間を抜けた小さな光、
                        その右は葉にさえぎられない日だまり
  sunlight-post.webp    左の柱。縦にゆるく明暗が入れ替わる帯
  leaf-shadow.webp      看板の壁に落ちる葉の影（暗い焦茶。透明度が影の濃さ）

どの地図も、日は同じ向きから差す。筋と帯は右下がり（約28度）。
乱数は種を固定しているので、何度書き出しても同じ絵になる。
画像は長くキャッシュされる（vercel.json）。中身を変えたときは新しい名前で書き出し、
古い絵を消す。
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'assets', 'images')

ANGLE = np.radians(28.0)          # 日の筋の傾き（右下がり）
SIN, COS = np.sin(ANGLE), np.cos(ANGLE)


# --- 道具 ------------------------------------------------------------------
def gauss_kernel(sigma):
    r = max(1, int(sigma * 3.2))
    x = np.arange(-r, r + 1, dtype=np.float64)
    k = np.exp(-0.5 * (x / sigma) ** 2)
    return k / k.sum()


def blur(a, sx, sy=None):
    """ぼかし（縦横別々のガウス）。端は折り返す"""
    sy = sx if sy is None else sy
    out = a.astype(np.float64)
    if sx > 0:
        k = gauss_kernel(sx); r = len(k) // 2
        p = np.pad(out, ((0, 0), (r, r)), mode='reflect')
        out = sum(k[i] * p[:, i:i + out.shape[1]] for i in range(len(k)))
    if sy > 0:
        k = gauss_kernel(sy); r = len(k) // 2
        p = np.pad(out, ((r, r), (0, 0)), mode='reflect')
        out = sum(k[i] * p[i:i + out.shape[0], :] for i in range(len(k)))
    return out


def smooth_noise(rng, h, w, cell):
    """なめらかなむら（0〜1）。粗い乱数の格子を補間する"""
    gh, gw = int(np.ceil(h / cell)) + 3, int(np.ceil(w / cell)) + 3
    g = rng.random((gh, gw))
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((gw * cell, gh * cell), Image.BICUBIC)
    a = np.asarray(im).astype(np.float64)[cell:cell + h, cell:cell + w] / 255.0
    a = (a - a.min()) / max(1e-6, a.max() - a.min())
    return a


def noise1d(rng, n, cell):
    return smooth_noise(rng, 1, n, cell)[0]


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def save_grey(a, name, quality=92):
    a = np.clip(a, 0, 1)
    im = Image.fromarray((a * 255 + 0.5).astype(np.uint8), 'L').convert('RGB')
    im.save(os.path.join(IMG, name), 'WEBP', quality=quality, method=6)
    print('%-22s %4dx%-4d  最大 %.2f  平均 %.3f' % (name, a.shape[1], a.shape[0], a.max(), a.mean()))


def streaks(u, v, lines, rng):
    """右下がりの日の筋を重ねる。u, v は高さを1とした座標（v は下向き）。
    lines: (筋が上の辺を横切る位置 u0, 強さ, 芯の太さ sig)"""
    out = np.zeros_like(u)
    for u0, amp, sig in lines:
        d = (u - u0) * SIN - v * COS            # 筋からの距離（筋に直交）
        t = (u - u0) * COS + v * SIN            # 筋に沿った位置
        # 葉のすき間を通った光なので、筋の途中で強さが揺らぎ、わずかに波打つ
        n = noise1d(rng, 400, 23)
        ti = np.clip(((t + 2) / 8.0 * 399).astype(int), 0, 399)
        wob = (noise1d(rng, 400, 31)[ti] - .5) * .04
        dd = d + wob
        # 芯は平らに近く、縁はやわらかく落ちる（葉のすき間の像がぼけた筋）
        core = np.exp(-0.5 * np.abs(dd / sig) ** 3.0)
        halo = 0.22 * np.exp(-0.5 * (dd / (sig * 2.6)) ** 2)
        out += amp * (0.62 + 0.38 * n[ti]) * (core + halo)
    return out


# --- 床 --------------------------------------------------------------------
def floor_map():
    """本棚の手前の床。高さを1として幅8まで。高さ1の大きさは shelf.css の --fs で、
    スマートフォンでは床の奥行き（36mm）、広い画面ではそれより大きく貼る
    （筋が太く、間が広くなる。細い筋が何本も並ぶと縞模様に見える）。
    日の筋は左の端から入り、右下へ細く長く伸びる。筋と筋のあいだは日陰。
    どこまで見せるかは shelf.css のマスクで決める（左ほど強く、右で消える）。"""
    rng = np.random.default_rng(20260925)
    H, W = 256, 2048
    v, u = np.mgrid[0:H, 0:W].astype(np.float64)
    v /= H; u /= H
    # 筋の間隔は高さのおよそ 0.6〜0.9。そろえると格子に見えるので、ばらつかせる。
    # 太さ（芯の幅）は高さの 0.1 前後。細すぎると日の筋ではなく線に見える
    lines = [(-1.85, .90, .105), (-0.92, 1.0, .120), (0.05, .95, .110), (0.98, .85, .100),
             (1.95, .80, .110), (2.95, .72, .105), (3.95, .66, .110), (5.00, .60, .100),
             (6.05, .56, .105), (7.10, .52, .100)]
    a = streaks(u, v, lines, rng)
    # 筋のまわりの床にも日が回る。左下の隅ほど明るい
    a += 0.26 * np.exp(-u / 1.2) * smoothstep(0.0, 0.9, v)
    a *= 1.0 - 0.3 * smoothstep(1.5, 8.0, u)
    # 奥の端（平台の陰から出たところ）のぼかしは shelf.css のマスクで入れる。
    # 広い画面では地図を床より大きく貼るので、地図に焼き込むと床の全体がぼける
    return np.clip(a, 0, 1)


# --- 平台の天面 ---------------------------------------------------------------
def deck_map():
    """平台の天面。高さ（天面の見えている奥行き）を1として幅8まで。
    奥（背板の下）は棚板の陰で暗く、手前ほど日を受ける。
    日は右下がりの帯になって天面を横切り、帯と帯のあいだは少し暗い。
    左の端（柱の前）がいちばん明るい。右へ消えていくのは shelf.css のマスク。
    窓から離れるほど、帯の間は広く、明暗はゆるくなり、なだらかな日だまりに溶ける。
    広い画面では日が遠くまで届くので、同じ間隔の帯が並ぶと縞模様に見える。"""
    rng = np.random.default_rng(20260926)
    H, W = 256, 2048
    v, u = np.mgrid[0:H, 0:W].astype(np.float64)
    v /= H; u /= H
    depth = 0.12 + 0.88 * smoothstep(0.02, 0.88, v)
    d = u * SIN - v * COS
    # 帯の位置（筋に直交する向きで測る）。間隔は窓の近くで 0.14〜0.28、遠くではその倍ほど
    pos, x = [], -1.2
    while x < 8 * SIN + 0.3:
        pos.append(x); x += (0.14 + 0.14 * rng.random()) * (1.0 + 1.0 * smoothstep(0.6, 1.9, x))
    bands = np.zeros_like(u)
    t = u * COS + v * SIN                     # 帯に沿った位置
    for p in pos:
        sig = 0.03 + 0.025 * rng.random()
        # 葉のすき間を通った光なので、帯の途中で強さが揺らぐ
        along = noise1d(rng, 600, 40)[np.clip((t / 9.0 * 599).astype(int), 0, 599)]
        bands += (0.7 + 0.3 * rng.random()) * (0.45 + 0.55 * along) * np.exp(-0.5 * np.abs((d - p) / sig) ** 2.6)
    bands = np.clip(bands, 0, 1)
    leafy = 0.8 + 0.2 * smooth_noise(rng, H, W, 36)
    # 帯の明暗の強さ。窓に近い左（スマートフォンで日が届くところ）では、帯のあいだを
    # はっきり日陰にして、光が斜めの筋になって天面を横切るのが見えるようにする。
    # 遠くでは4分の1ほどに弱める。明暗を弱めても、平均の明るさは変えない
    bm = bands.mean()
    k = 0.72 * (1.0 - 0.75 * smoothstep(1.5, 3.6, u))
    a = depth * (0.56 + 0.38 * bm + k * (bands - bm)) * leafy
    # 左の端。柱の前の天面は、窓からの日をまともに受ける
    a += 0.3 * (1 - smoothstep(0.0, 0.3, u)) * smoothstep(0.06, 0.4, v)
    return np.clip(a, 0, 1)


# --- 天板の小口 ---------------------------------------------------------------
def crown_map():
    """天板の小口。幅は植物の幅（--lw）の 3.4 倍、高さは小口の厚み。
    植物の真下（左から 0.03〜0.38）は葉の影。重なった葉のすき間だけ日が抜け、
    小口の上に葉の形に欠けた小さな光のかけらが落ちる（丸い玉のぼけにはしない）。
    低い日が斜めに差すので、かけらは横に少し伸びる。
    その右は葉にさえぎられない日だまりで、右へなだらかに消える。"""
    rng = np.random.default_rng(20260927)
    H, W = 96, 1280
    v, x = np.mgrid[0:H, 0:W].astype(np.float64)
    uu = x / W; vv = v / H
    # 日の強さ。植物の真下も日だまりも同じ直射で、右へなだらかに消える
    sun = 0.5 * (1 - smoothstep(0.50, 1.0, uu)) * smoothstep(0.015, 0.06, uu)
    # 葉の影。植物に近い左ほど葉が重なり、すき間が少ない
    S = 3
    im = Image.new('L', (W * S, H * S), 0)
    dr = ImageDraw.Draw(im)
    n = 0
    while n < 95:
        cx = rng.uniform(0.0, 0.40); cy = rng.uniform(-0.3, 1.3)
        if rng.random() > 1.0 - smoothstep(0.08, 0.40, cx) * 0.9:
            continue
        size = rng.uniform(0.009, 0.017) * W * S
        pts = []
        rot = rng.uniform(0, 2 * np.pi)
        for k in range(48):
            ph = 2 * np.pi * k / 48
            r = size * (0.62 + 0.38 * np.abs(np.cos(2.5 * ph)) ** 1.6)
            px_, py_ = r * np.cos(ph + rot), r * np.sin(ph + rot)
            pts.append((cx * W * S + px_ * 1.5, cy * H * S + py_))   # 横に伸びた葉の影
        dr.polygon(pts, fill=255)
        n += 1
    cover = np.asarray(im.resize((W, H), Image.LANCZOS)).astype(np.float64) / 255.0
    cover = blur(cover, 3.2, 1.8)                                    # 葉の影の縁（半影）
    gaps = np.clip(1.0 - cover, 0, 1) ** 1.4
    a = sun * gaps
    # 小口の上の角は日をかすめて受ける
    a *= 0.86 + 0.14 * (1 - vv)
    return np.clip(a, 0, 1)


# --- 左の柱 --------------------------------------------------------------------
def post_map():
    """左の柱。1000mm ぶんの高さで繰り返す。およそ 100mm ごとに、ゆるく明暗が入れ替わる。
    明るい帯でも覆い焼きの強さは 0.36（1.56倍）まで。柱全体の明るさは shelf.css で戻す。"""
    rng = np.random.default_rng(20260928)
    H, W = 1000, 8
    y = np.arange(H, dtype=np.float64)
    a = np.zeros(H)
    c = 20.0
    while c < H + 60:
        w = rng.uniform(26, 44)
        amp = rng.uniform(0.55, 1.0)
        for off in (-H, 0, H):           # 上下の端でつなぐ
            a += amp * np.exp(-0.5 * ((y - c - off) / w) ** 2)
        c += rng.uniform(88, 128)
    a = a / a.max() * 0.36
    return np.repeat(a[:, None], W, axis=1)


# --- 看板の壁の葉の影 -------------------------------------------------------------
def ivy_leaf(draw, cx, cy, size, rot, fill):
    """アイビーの葉の形（先のとがった5つの裂片）"""
    pts = []
    for i in range(72):
        ph = 2 * np.pi * i / 72
        lobe = 0.62 + 0.38 * np.abs(np.cos(2.5 * ph)) ** 1.6
        r = size * lobe * (1.0 if np.sin(ph) < 0.2 else 0.82)
        pts.append((cx + r * np.cos(ph + rot), cy + r * np.sin(ph + rot)))
    draw.polygon(pts, fill=fill)


def leaf_shadow():
    """看板の壁の、植物の右と下に落ちる葉の影。幅は植物の幅（--lw）、高さは看板の
    高さの 0.55 に広げて置く（shelf.css の .market）。左（植物の側）ほど葉が密で、
    影の縁は日の角度でぼける。
    葉のすき間は影が抜け、壁の木がそのまま日を受ける。"""
    rng = np.random.default_rng(20260929)
    S = 4
    H, W = 256, 512
    im = Image.new('L', (W * S, H * S), 0)
    dr = ImageDraw.Draw(im)
    n = 0
    while n < 70:
        x = rng.uniform(-0.05, 1.0); y = rng.uniform(-0.1, 1.05)
        # 植物に近い左上ほど密に
        if rng.random() > (1 - x) ** 1.8 * (0.5 + 0.5 * (1 - y)):
            continue
        size = rng.uniform(0.035, 0.07) * W * S
        ivy_leaf(dr, x * W * S, y * H * S, size, rng.uniform(0, 2 * np.pi), 255)
        n += 1
    a = np.asarray(im.resize((W, H), Image.LANCZOS)).astype(np.float64) / 255.0
    a = blur(a, 2.4, 1.8)                       # 半影
    a *= 0.34 * (1 - smoothstep(0.5, 1.0, np.linspace(0, 1, W)))[None, :]
    a *= smoothstep(0.0, 0.22, np.linspace(0, 1, H))[:, None] * 0.4 + 0.6
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = 14, 9, 4
    rgba[..., 3] = np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(os.path.join(IMG, 'leaf-shadow.webp'), 'WEBP', quality=90, method=6)
    print('%-22s %4dx%-4d  影の濃さ 最大 %.2f' % ('leaf-shadow.webp', W, H, a.max()))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    save_grey(floor_map(), 'sunlight-floor.webp')
    save_grey(deck_map(), 'sunlight-deck.webp')
    save_grey(crown_map(), 'sunlight-crown.webp')
    save_grey(post_map(), 'sunlight-post.webp')
    leaf_shadow()
