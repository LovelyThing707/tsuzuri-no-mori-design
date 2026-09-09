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

# 4冊を順番どおりに繰り返すと、同じ並びが規則的に現れて
# 「背表紙の画像をただ並べました」に見える。順不同に散らす。
# 毎回同じ結果になるよう、乱数は種を固定する（ビルドを再現可能にするため）。
import random


def _shuffled(n, seed):
    """4冊を順不同に n 冊ぶん並べる。

    ただの乱数だと、種によっては最初の十数冊に同じ本ばかり出る。
    実際に見えているのは先頭の10〜19冊なので、そこで偏ると目立つ。
    4冊をひと組として組の中で並べ替え、それをつなぐ方式にする。
    どの4冊を取っても4種類そろい、並び順は組ごとに変わる。
    """
    rnd = random.Random(seed)
    out = []
    while len(out) < n:
        block = list(range(len(REAL)))
        rnd.shuffle(block)
        out.extend(block)
    return out[:n], rnd


def row_books(n, seed=0):
    """背表紙の並び。順序も傾きも売り場ごとに変える。"""
    idx, rnd = _shuffled(n, seed)
    out = []
    for k in idx:
        b = dict(REAL[k])
        b['lean'] = round(rnd.uniform(-0.9, 0.9), 1)
        out.append(b)
    return out


def flat_books(n, seed=0):
    """平台に寝かせる本。表紙を上に向ける。"""
    idx, rnd = _shuffled(n, seed)
    out = []
    for k in idx:
        b = dict(REAL[k])
        b['rot'] = round(rnd.uniform(-1.6, 1.6), 1)
        # 首を振らせて側面を見せる。真正面だと板のように見えるため。
        # 実測：正の角度で左の面（背・書名）、負で右の面（小口・白い紙）が出る。
        # 5度前後では遠近法に負けて向きが定まらないので、10度以上振る。
        # 書名の見える背を多めに、小口も混ぜる。
        sign = 1 if rnd.random() < 0.62 else -1
        b['yaw'] = round(sign * rnd.uniform(10.0, 17.0), 1)
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
    st = '--h:%d;--w:%d;--t:%d;--c:%s;--rot:%.1fdeg;--yaw:%.1fdeg' % (
        b['h'], b['w'], b['t'], b['c'], b['rot'], b['yaw'])
    # 寝かせた本は箱。表紙のほかに、背（左）・小口（右）・地（手前）の面がある。
    return ('        <li class="flat" style="%s">'
            '<img src="%s%s" alt="" loading="lazy" decoding="async">'
            '<span class="flat__spine">'
            '<img src="%s%s" alt="" loading="lazy" decoding="async"></span>'
            '<span class="flat__fore"></span></li>'
            % (st, IMG, b['cv'], IMG, b['sp']))


def tier(books):
    return '\n'.join(spine_li(b) for b in books)


def platform(books):
    return '\n'.join(flat_li(b) for b in books)


# 画面幅いっぱいに広げるため、いちばん広い画面でも足りる冊数を出しておき、
# 入りきらないぶんは CSS で隠す。
TIER_A1 = row_books(64, seed=11)
TIER_A2 = row_books(64, seed=23)
TIER_B1 = row_books(64, seed=37)
LYING_A = flat_books(14, seed=53)
LYING_B = flat_books(14, seed=71)
