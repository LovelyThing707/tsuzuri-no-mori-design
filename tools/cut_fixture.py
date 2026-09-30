# -*- coding: utf-8 -*-
"""什器の部材を、既存の絵から切り出す。

本棚は1枚の絵ではなく、部材を組んで描く。
段の高さは本の大きさ（判型×倍率）から決まり、画面ごとに変わる。
1枚の絵だと段と棚板の比率が絵に固定され、本の大きさに合わせられない。

切り出す部材
  case-crown-front.webp 天板の笠木（前面）。下の角が裏へ回り込むところまで
  case-crown-fascia.webp 天板の幕板（笠木の下の板の前面）。棚のテーマの札を留める板。
                        背板と同じ明るい板のうち、節の少ない帯。均してから使い、色は画面の側で落とす
  case-ceiling.webp     天板の裏（いちばん上の段から見上げた面）。中の棚板の裏にも使う
  case-back-panel.webp  背板（段の奥）。色と明るさの大きな斑を均し、木目の濃淡を強める
  case-board-front.webp 棚板の小口（本が立つ板の前面）。上の丸い角から、裏との折れ目まで
  deck-top.webp         平台の天板（上から見た面）
  deck-lip-edge.webp    平台の手前の縁。丸い上の角と前の面だけ（下の溝と幕板は含めない）
  floor-boards.webp     床板
行の位置は、元の絵を行ごとの明るさで測って決めた。

画像は長くキャッシュされる（vercel.json）。絵の中身を変えたときは、
同じ名前で上書きせず、新しい名前で書き出して古い絵を消す。

天板・その裏・棚板は、元の絵に左から当たっている光を均してから保存する。
絵に焼き込まれた光が残ると、横に長く伸ばしたときに明るい斑が浮き、
狭い画面では板の左端の明るいところだけが写る。
光は画面の側（shelf.css）で、窓の位置に合わせて足す。

背板は色と明るさの大きな斑も均す。元の絵の左端には、赤みの強い暗い斑がある。
背板は段の高さに合わせて引き伸ばすので、狭い画面ほど絵の左端しか写らない。
斑が残ると、スマートフォンでは段の奥だけが赤黒く沈む。

背板と天板の裏は暗く沈めて使うので、そのままでは木目が消えて、段の奥が
板ではなく暗い穴に、天板の裏がのっぺりした帯に見える。明るさの平均は
そのままに、木目の細かな濃淡だけを強める。
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'assets', 'images')
# 切り出し元の絵。配信はしないので assets の外に置く
SRC = os.path.join(ROOT, 'tools', 'fixture-src')

CUTS = [
    # 出力名,                 元の絵,              上,   下, 均すもの, 木目の濃淡
    #   均すもの … '列'＝横に流れる光だけ、'斑'＝色と明るさの大きな斑も
    ('case-crown-front.webp', 'case-shelf.webp',    0,   28, '列',  1.0),
    ('case-crown-fascia.webp', 'case-shelf.webp', 110,  160, '列',  1.8),
    ('case-ceiling.webp',     'case-shelf.webp',   29,   54, '列',  1.8),
    ('case-back-panel.webp',  'case-shelf.webp',   70,  266, '斑',  2.2),
    ('case-board-front.webp', 'case-shelf.webp',  275,  314, '列',  1.0),
    ('deck-top.webp',         'platform.webp',     70,  441, None, 1.0),
    ('deck-lip-edge.webp',    'platform.webp',    438,  481, None, 1.0),
    ('floor-boards.webp',     'platform.webp',    760, 1024, None, 1.0),
]


def even_light(part):
    """列ごとの明るさを、なだらかな平均にそろえる。
    木目や節の細かな濃淡は残し、横に大きく流れる光だけを取る。
    左右の端は輪にしてならすので、端どうしの明るさもそろう。"""
    a = np.asarray(part).astype(np.float64)
    col = (a @ [0.299, 0.587, 0.114]).mean(axis=0)
    sigma, reach = 120.0, 360
    x = np.arange(-reach, reach + 1)
    k = np.exp(-(x * x) / (2 * sigma * sigma))
    k /= k.sum()
    n = col.size
    ring = np.concatenate([col[-reach:], col, col[:reach]])
    smooth = np.convolve(ring, k, mode='same')[reach:reach + n]
    gain = col.mean() / smooth
    out = np.clip(a * gain[None, :, None], 0, 255).astype(np.uint8)
    return Image.fromarray(out, 'RGB')


def even_patches(part):
    """色と明るさの大きな斑を、色ごとに板全体の平均へそろえる。
    木目の幅より大きな斑だけを取るので、木目と節はそのまま残る。
    画面の幅によって板の見える範囲が変わっても、色と暗さが変わらない。"""
    a = np.asarray(part).astype(np.float64)
    out = np.empty_like(a)
    for c in range(3):
        ch = Image.fromarray(np.clip(a[..., c], 0, 255).astype(np.uint8), 'L')
        low = np.asarray(ch.filter(ImageFilter.GaussianBlur(20))).astype(np.float64)
        out[..., c] = a[..., c] * (a[..., c].mean() / np.maximum(low, 1.0))
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')


def deepen_grain(part, k):
    """木目の細かな濃淡だけを k 倍にする。
    ぼかした明るさ（板の明るさのなだらかな変化）はそのまま残すので、
    平均の明るさは変わらない。色の比も変えない。"""
    a = np.asarray(part).astype(np.float64)
    lum = a @ [0.299, 0.587, 0.114]
    gray = Image.fromarray(np.clip(lum, 0, 255).astype(np.uint8), 'L')
    low = np.asarray(gray.filter(ImageFilter.GaussianBlur(6))).astype(np.float64)
    ratio = (low + k * (lum - low)) / np.maximum(lum, 1.0)
    out = np.clip(a * ratio[:, :, None], 0, 255).astype(np.uint8)
    return Image.fromarray(out, 'RGB')


for out, src, top, bottom, even, grain in CUTS:
    im = Image.open(os.path.join(SRC, src)).convert('RGB')
    part = im.crop((0, top, im.width, bottom))
    if even == '列':
        part = even_light(part)
    elif even == '斑':
        part = even_patches(part)
    if grain != 1.0:
        part = deepen_grain(part, grain)
    part.save(os.path.join(IMG, out), 'WEBP', quality=90, method=6)
    print('%-18s %dx%d' % (out, part.width, part.height))
