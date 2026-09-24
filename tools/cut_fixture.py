# -*- coding: utf-8 -*-
"""什器の部材を、既存の絵から切り出す。

本棚は1枚の絵ではなく、部材を組んで描く。
段の高さは本の大きさ（判型×倍率）から決まり、画面ごとに変わる。
1枚の絵だと段と棚板の比率が絵に固定され、本の大きさに合わせられない。

切り出す部材
  case-crown.webp   天板の小口（前面）
  case-back.webp    背板（段の奥）
  case-board.webp   棚板の小口（本が立つ板の前面）
  deck-top.webp     平台の天板（上から見た面）
  deck-lip.webp     平台の手前の縁
  floor-boards.webp 床板
行の位置は、元の絵を行ごとの明るさで測って決めた。
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'assets', 'images')
# 切り出し元の絵。配信はしないので assets の外に置く
SRC = os.path.join(ROOT, 'tools', 'fixture-src')

CUTS = [
    # 出力名,            元の絵,             上,   下
    ('case-crown.webp',   'case-shelf.webp',    0,   30),
    ('case-back.webp',    'case-shelf.webp',   70,  266),
    ('case-board.webp',   'case-shelf.webp',  274,  320),
    ('deck-top.webp',     'platform.webp',     70,  441),
    ('deck-lip.webp',     'platform.webp',    438,  552),
    ('floor-boards.webp', 'platform.webp',    760, 1024),
]

for out, src, top, bottom in CUTS:
    im = Image.open(os.path.join(SRC, src)).convert('RGB')
    part = im.crop((0, top, im.width, bottom))
    part.save(os.path.join(IMG, out), 'WEBP', quality=90, method=6)
    print('%-18s %dx%d' % (out, part.width, part.height))
