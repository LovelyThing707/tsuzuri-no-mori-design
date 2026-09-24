# -*- coding: utf-8 -*-
"""index.html の反復部分（背表紙・平置き）を組み立てる。"""

IMG = 'assets/images/'

# クライアント様よりご指定の4冊。
#   高さ  … ご指定の判型から（要件定義書 2-2 の対応表どおり）
#   厚み  … 実測値（mm）
#   幅    … 判型の幅
# 「同じ本を複数置く形で構わない」とのことなので、この4冊を繰り返します。
# 書名・著者・出版社は書影から読み取ったもの。
# 価格と紹介文は仮です（定価が確定するまでの置き）。
REAL = [
 dict(key='suika',  h=297, t=11, w=210, c='#A9CDDC', e='#F1EBDE',
      sp='spine-suika-no-pool.webp',         cv='cover-suika-no-pool.webp',
      title='すいかのプール', author='アンニョン・タル 作／斎藤 真理子 訳',
      pub='岩波書店', kata='A4判', pages=58, price=1760,
      lead='見わたすかぎりの、すいかのプール。夏のいちにちを、たっぷりの赤と水音で描いた絵本です。',
      desc=['大きなすいかを半分に割ったら、そこはもうプールだった。',
            '水しぶきの赤、種の黒、遠くの空の青。ページをめくるたびに、'
            '夏の一日がゆっくりと過ぎていきます。文字は少なく、'
            '絵のなかの音を聞くようにして読む一冊です。',
            '読み聞かせにも、ひとりで眺めるのにも。']),
 dict(key='monte',  h=148, t=19, w=105, c='#A9CDDB', e='#E7DCC4',
      sp='spine-monteleggio.webp',           cv='cover-monteleggio.webp',
      title='モンテレッジオ 小さな村の旅する本屋の物語', author='内田 洋子',
      pub='方丈社', kata='文庫判', pages=336, price=990,
      lead='イタリアの山あいの村から、本を担いで旅に出た人たちがいた。本を届けるという仕事の来歴をたどる一冊。',
      desc=['モンテレッジオは、イタリアの山あいにある小さな村です。'
            'この村の人たちは、かごに本を詰めて各地をめぐり、本を売って暮らしていました。',
            'なぜ本だったのか。どうやって売り歩いたのか。'
            '著者は村を訪ね、残された人びとの話を聞き、記録をたどっていきます。',
            '本を届けるという仕事が、どんな人たちの手で続いてきたのか。'
            'その来歴に触れる一冊です。']),
 dict(key='kagaku', h=210, t=25, w=148, c='#F0EEE9', e='#F4F1E9',
      sp='spine-kagaku-no-ohanashi-25.webp', cv='cover-kagaku-no-ohanashi-25.webp',
      title='よみとく10分 かがくのお話25', author='国立科学博物館 監修',
      pub='西東社', kata='A5判', pages=264, price=1650,
      lead='身のまわりの「なぜ」を、ひとつ10分で読みきれる長さにまとめました。ひとりでも、いっしょでも。',
      desc=['どうして空は青いの。どうして氷は水に浮くの。',
            '身のまわりにある「なぜ」を25話、ひとつ10分で読みきれる長さにまとめました。'
            '国立科学博物館の監修で、絵と写真をたっぷり使っています。',
            '寝る前のひとつ、朝のひとつ。読み聞かせにも向いています。']),
 dict(key='aya',    h=210, t=16, w=148, c='#6F2027', e='#ECE3D2',
      sp='spine-aya-to-majo.webp',           cv='cover-aya-to-majo.webp',
      title='アーヤと魔女', author='ダイアナ・ウィン・ジョーンズ 作／田中 薫子 訳',
      pub='徳間書店', kata='A5判', pages=128, price=1540,
      lead='魔女の家に引き取られたアーヤは、すこしも動じない。したたかで愉快な女の子の物語。',
      desc=['施設で育ったアーヤは、人を思いどおりに動かすのが得意な女の子。',
            'ある日ひきとられた先は、魔女の家でした。'
            '朝から晩まで手伝いをさせられ、外にも出してもらえない。'
            'それでもアーヤは、すこしも動じません。',
            'したたかで愉快な女の子の物語。読み終えたあと、'
            'きっとアーヤのことが好きになっています。']),
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
        out.append(b)
    return out


def spine_li(b):
    # --kw（判横 mm）も渡す。天の見え幅をここから出すため
    st = '--h:%d;--kw:%d;--t:%d;--c:%s;--e:%s;--lean:%.1fdeg' % (
        b['h'], b['w'], b['t'], b['c'], b['e'], b['lean'])
    return ('        <li class="spine" style="%s" data-book="%s" '
            'tabindex="0" role="button" aria-label="%s">'
            '<img src="%s%s" alt="" loading="lazy" decoding="async"></li>'
            % (st, b['key'], b['title'], IMG, b['sp']))


def flat_li(b):
    # --t（厚み）も渡す。寝かせた本の小口をページ数から出すため
    st = '--h:%d;--w:%d;--t:%d;--c:%s;--rot:%.1fdeg' % (
        b['h'], b['w'], b['t'], b['c'], b['rot'])
    # 寝かせた本は箱。表紙のほかに、背（左）・小口（右）・地（手前）の面がある。
    return ('        <li class="flat" style="%s" data-book="%s" '
            'tabindex="0" role="button" aria-label="%s">'
            '<img src="%s%s" alt="" loading="lazy" decoding="async">'
            '<span class="flat__spine">'
            '<img src="%s%s" alt="" loading="lazy" decoding="async"></span>'
            '<span class="flat__fore"></span></li>'
            % (st, b['key'], b['title'], IMG, b['cv'], IMG, b['sp']))


def tier(books):
    return '\n'.join(spine_li(b) for b in books)


def platform(books):
    return '\n'.join(flat_li(b) for b in books)


def sumw(books):
    """平台に並べる本の判横（mm）の合計。冊数ごと。

    平台の本の大きさは「並べた本が平台の幅に収まる」ところで決める。
    何冊並べるかは画面幅で変わる（スマートフォン3冊・タブレット4冊・
    パソコン8冊）ので、それぞれの合計を渡しておき、CSS が選ぶ。"""
    return {n: sum(b['w'] for b in books[:n]) for n in (3, 4, 8)}


# 背表紙は1段。段の幅に入る冊数だけが見え、入りきらないぶんは隠す
# （scripts/main.js）。いちばん広い画面でも足りる冊数を出しておく。
TIER_A1 = row_books(80, seed=11)
TIER_B1 = row_books(80, seed=37)

# 平台は冊数を決めて置く。スマートフォン・タブレットは4冊
# （要件定義書 2-3／3-2「平台 3〜4冊」）。天板の広いパソコンは8冊。
# 8冊だと、お預かりしている4冊が2周する。
LYING_A = flat_books(8, seed=53)
LYING_B = flat_books(8, seed=71)


def book_json():
    """引き抜きの画面で使う書誌情報。1冊ずつ探し直さずに済むよう、まとめて置く。"""
    import json
    out = {}
    for b in REAL:
        out[b['key']] = dict(
            title=b['title'], author=b['author'], pub=b['pub'],
            kata=b['kata'], pages=b['pages'], price=b['price'],
            lead=b['lead'], desc=b['desc'],
            cover=IMG + b['cv'], spine=IMG + b['sp'],
            h=b['h'], w=b['w'], t=b['t'])
    return json.dumps(out, ensure_ascii=False, separators=(',', ':'))
