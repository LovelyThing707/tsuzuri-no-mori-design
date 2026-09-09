# -*- coding: utf-8 -*-
"""index.html の反復部分（背表紙・平置き）を組み立てる。"""

IMG = 'assets/images/'

# クライアント様よりご指定の4冊。
#   高さ  … ご指定の判型から（要件定義書 2-2 の対応表どおり）
#   厚み  … 実測値（mm）
#   幅    … 判型の幅
# 「同じ本を複数置く形で構わない」とのことなので、この4冊を繰り返します。
REAL = [
 dict(key='suika',  h=297, t=11, w=210, c='#A9CDDC', e='#F1EBDE',
      sp='spine-suika-no-pool.webp',         cv='cover-suika-no-pool.webp'),
 dict(key='monte',  h=148, t=19, w=105, c='#A9CDDB', e='#E7DCC4',
      sp='spine-monteleggio.webp',           cv='cover-monteleggio.webp'),
 dict(key='kagaku', h=210, t=25, w=148, c='#F0EEE9', e='#F4F1E9',
      sp='spine-kagaku-no-ohanashi-25.webp', cv='cover-kagaku-no-ohanashi-25.webp'),
 dict(key='aya',    h=210, t=16, w=148, c='#6F2027', e='#ECE3D2',
      sp='spine-aya-to-majo.webp',           cv='cover-aya-to-majo.webp'),
]

# 1冊ずつわずかに傾ける。同じ本が並ぶので、傾きだけは変える。
LEAN = [0.0, -0.7, 0.5, -0.4, 0.8, -0.2, 0.6, -0.9, 0.3, -0.5, 0.9, -0.3]


def row_books(n, offset=0):
    """4冊を繰り返して n 冊ぶんの並びを作る。並び順は売り場ごとにずらす。"""
    out = []
    for i in range(n):
        b = dict(REAL[(i + offset) % len(REAL)])
        b['lean'] = LEAN[(i + offset * 3) % len(LEAN)]
        out.append(b)
    return out


def flat_books(n, offset=0):
    """平台に寝かせる本。表紙を上に向ける。"""
    out = []
    for i in range(n):
        b = dict(REAL[(i + offset) % len(REAL)])
        b['rot'] = LEAN[(i * 2 + offset) % len(LEAN)] * 1.6
        out.append(b)
    return out


def spine_li(b):
    st = '--h:%d;--t:%d;--c:%s;--e:%s;--lean:%.1fdeg' % (
        b['h'], b['t'], b['c'], b['e'], b['lean'])
    return ('        <li class="spine" style="%s">'
            '<img src="%s%s" alt="" loading="lazy" decoding="async"></li>'
            % (st, IMG, b['sp']))


def flat_li(b):
    # --t（厚み）も渡す。寝かせた本の小口をページ数から出すため
    st = '--h:%d;--w:%d;--t:%d;--c:%s;--rot:%.1fdeg' % (
        b['h'], b['w'], b['t'], b['c'], b['rot'])
    return ('        <li class="flat" style="%s">'
            '<img src="%s%s" alt="" loading="lazy" decoding="async"></li>'
            % (st, IMG, b['cv']))


def tier(books):
    return '\n'.join(spine_li(b) for b in books)


def platform(books):
    return '\n'.join(flat_li(b) for b in books)


# 画面幅いっぱいに広げるため、いちばん広い画面でも足りる冊数を出しておき、
# 入りきらないぶんは CSS で隠す。
TIER_A1 = row_books(64, 0)
TIER_A2 = row_books(64, 2)
TIER_B1 = row_books(64, 1)
LYING_A = flat_books(14, 0)
LYING_B = flat_books(14, 2)
