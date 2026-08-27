# -*- coding: utf-8 -*-
"""index.html の反復部分（背表紙・平置き・森）を組み立てる。"""

IMG = 'assets/images/'

# 書影は使わない。第1稿は色と比率だけで組む。
# 判型・背幅は実際の書籍の寸法域から採り、大小の差が見えるようにしている。

# 写真のない本は色と比率だけ。書名は入れない。
# 暗い背表紙（#241A14 など）を各段に必ず混ぜ、什器に溶けないか確認できるようにする。
def P(h, t, c, e='#DED3BC'):
    return dict(h=h, t=t, c=c, e=e)

TIER_A1 = [
    P(210, 21, '#7A6A52'),
    P(218, 16, '#6F2027'),
    P(152, 12, '#B5A58A'),
    P(236, 28, '#4A5D52'),
    P(205, 15, '#241A14'),
    P(214, 25, '#E4E0D6'),
    P(222, 33, '#8A4B3C'),
    P(198,  9, '#D8CDB5'),
    P(208, 24, '#3C4A5E'),
    P(216, 17, '#94795A'),
    P(202, 13, '#2F3B33'),
    P(226, 26, '#6E2F38'),
    P(148, 10, '#A8654A'),
    P(212, 30, '#55402E'),
    P(192, 31, '#5B6E63'),
    P(240, 14, '#C2A87E')
]
TIER_A2 = [
    P(206, 18, '#3A3F4A'),
    P(220, 11, '#C4B79A'),
    P(196, 19, '#8FA9B5'),
    P(232, 31, '#5E4B36'),
    P(204, 14, '#6B5B7A'),
    P(214, 23, '#8F6A45'),
    P(150,  8, '#241A14'),
    P(224, 11, '#9FBFCB'),
    P(208, 20, '#46543F'),
    P(218, 27, '#7C4230'),
    P(200, 16, '#B0A184'),
    P(212, 12, '#333A44'),
    P(228, 29, '#6A5340'),
    P(194, 15, '#9A8258'),
    P(226, 34, '#6E4A3C'),
    P(190, 17, '#A9927A')
]
TIER_B1 = [
    P(212, 16, '#2B3340'),
    P(154, 10, '#A99878'),
    P(220, 24, '#4B3A5C'),
    P(204, 16, '#6F2027'),
    P(198, 19, '#1F2A22'),
    P(234, 32, '#5A4130'),
    P(216, 13, '#C9BBA0'),
    P(208, 22, '#3F4A57'),
    P(148, 19, '#8FA9B5'),
    P(226, 26, '#70503A'),
    P(202, 11, '#241A14'),
    P(214, 28, '#87614C'),
    P(196, 14, '#8E9A8C'),
    P(222, 17, '#5C4658'),
    P(238, 30, '#43506B'),
    P(194, 21, '#7E6B4F')
]

LYING_A = [
    dict(h=224, w=160, c='#9FBFCB', e='#F1EBDE', rot='-1.6deg'),
    dict(h=212, w=150, c='#E4E0D6', e='#F4F1E9', rot='1.2deg'),
    dict(h=218, w=152, c='#6F2027', e='#ECE3D2', rot='-0.9deg'),
    dict(h=206, w=146, c='#6B5B48', e='#E2D8C2', rot='1.5deg'),
    dict(h=230, w=164, c='#3E4C43', e='#DED3BC', rot='-1.3deg'),
    dict(h=198, w=140, c='#9A7F5C', e='#E7DCC4', rot='0.9deg'),
]
LYING_B = [
    dict(h=210, w=148, c='#8FA9B5', e='#E7DCC4', rot='-1.4deg'),
    dict(h=222, w=158, c='#2E2A38', e='#DCD1B8', rot='1.1deg'),
    dict(h=204, w=144, c='#7A4A3E', e='#E2D8C2', rot='-1.7deg'),
    dict(h=228, w=162, c='#4A5546', e='#E9E0CE', rot='1.4deg'),
    dict(h=200, w=142, c='#8B7350', e='#DED3BC', rot='-1.0deg'),
    dict(h=216, w=154, c='#514257', e='#E7DCC4', rot='1.8deg'),
]

def spine_li(b):
    st = '--h:%d;--t:%d;--c:%s;--e:%s' % (b['h'], b['t'], b['c'], b['e'])
    return '        <li class="spine spine--plain" style="%s"></li>' % st

def lying_li(b):
    st = '--h:%d;--w:%d;--c:%s;--e:%s;--rot:%s' % (b['h'], b['w'], b['c'], b['e'], b['rot'])
    return '        <li class="lying lying--plain" style="%s"></li>' % st

def tier(books):
    return '\n'.join(spine_li(b) for b in books)

def platform(books):
    return '\n'.join(lying_li(b) for b in books)
