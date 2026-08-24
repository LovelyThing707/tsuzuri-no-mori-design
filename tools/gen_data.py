# -*- coding: utf-8 -*-
"""index.html の反復部分（背表紙・平置き・森）を組み立てる。"""

IMG = 'assets/images/'

# 実写のある4冊。判型・背幅は実測値（mm）
REAL = {
 'aya'   : dict(h=210, t=16, w=152, c='#6F2027', e='#ECE3D2',
                sp='spine-aya-to-majo.webp',           cv='cover-aya-to-majo.webp'),
 'kagaku': dict(h=201, t=25, w=144, c='#F0EEE9', e='#F4F1E9',
                sp='spine-kagaku-no-ohanashi-25.webp', cv='cover-kagaku-no-ohanashi-25.webp'),
 'monte' : dict(h=148, t=19, w=105, c='#A9CDDB', e='#E7DCC4',
                sp='spine-monteleggio.webp',           cv='cover-monteleggio.webp'),
 'suika' : dict(h=260, t=11, w=191, c='#A9CDDC', e='#F1EBDE',
                sp='spine-suika-no-pool.webp',         cv='cover-suika-no-pool.webp'),
}

# 写真のない本は色と比率だけ。書名は入れない。
# 暗い背表紙（#241A14 など）を各段に必ず混ぜ、什器に溶けないか確認できるようにする。
def P(h, t, c, e='#DED3BC'):
    return dict(h=h, t=t, c=c, e=e)

TIER_A1 = [
    P(188, 21, '#7A6A52'), REAL['aya'],        P(148, 12, '#B5A58A'),
    P(257, 28, '#4A5D52'), P(182, 15, '#241A14'), REAL['kagaku'],
    P(210, 33, '#8A4B3C'), P(148,  9, '#D8CDB5'), P(218, 24, '#3C4A5E'),
    P(182, 17, '#94795A'), P(188, 13, '#2F3B33'), P(210, 26, '#6E2F38'),
    P(173, 10, '#A8654A'), P(257, 30, '#55402E'),
]
TIER_A2 = [
    P(210, 18, '#3A3F4A'), P(148, 11, '#C4B79A'), REAL['monte'],
    P(218, 31, '#5E4B36'), P(182, 14, '#6B5B7A'), P(188, 23, '#8F6A45'),
    P(148,  8, '#241A14'), REAL['suika'],        P(210, 20, '#46543F'),
    P(257, 27, '#7C4230'), P(173, 16, '#B0A184'), P(182, 12, '#333A44'),
    P(188, 29, '#6A5340'), P(210, 15, '#9A8258'),
]
TIER_B1 = [
    P(182, 16, '#2B3340'), P(148, 10, '#A99878'), P(210, 24, '#4B3A5C'),
    REAL['aya'],           P(188, 19, '#1F2A22'), P(257, 32, '#5A4130'),
    P(173, 13, '#C9BBA0'), P(210, 22, '#3F4A57'), REAL['monte'],
    P(218, 26, '#70503A'), P(182, 11, '#241A14'), P(188, 28, '#87614C'),
    P(148, 14, '#8E9A8C'), P(210, 17, '#5C4658'),
]

LYING_A = [
    dict(**REAL['suika'],  rot='-2.4deg'),
    dict(**REAL['kagaku'], rot='1.6deg'),
    dict(**REAL['aya'],    rot='-1.1deg'),
    dict(h=188, t=0, w=128, c='#6B5B48', e='#E2D8C2', rot='2.2deg'),
    dict(h=210, t=0, w=148, c='#3E4C43', e='#DED3BC', rot='-1.8deg'),
    dict(h=148, t=0, w=105, c='#9A7F5C', e='#E7DCC4', rot='1.2deg'),
]
LYING_B = [
    dict(**REAL['monte'],  rot='-1.9deg'),
    dict(h=210, t=0, w=152, c='#2E2A38', e='#DCD1B8', rot='1.5deg'),
    dict(h=182, t=0, w=128, c='#7A4A3E', e='#E2D8C2', rot='-2.1deg'),
    dict(h=257, t=0, w=182, c='#4A5546', e='#E9E0CE', rot='1.9deg'),
    dict(h=188, t=0, w=130, c='#8B7350', e='#DED3BC', rot='-1.3deg'),
    dict(h=148, t=0, w=105, c='#514257', e='#E7DCC4', rot='2.4deg'),
]

def spine_li(b):
    cls = 'spine' if 'sp' in b else 'spine spine--plain'
    st  = '--h:%d;--t:%d;--c:%s;--e:%s' % (b['h'], b['t'], b['c'], b['e'])
    img = ''
    if 'sp' in b:
        img = '<img src="%s%s" alt="" loading="lazy" decoding="async">' % (IMG, b['sp'])
    return '        <li class="%s" style="%s">%s</li>' % (cls, st, img)

def lying_li(b):
    st = '--h:%d;--w:%d;--c:%s;--e:%s;--rot:%s' % (b['h'], b['w'], b['c'], b['e'], b['rot'])
    img = ''
    if 'cv' in b:
        img = '<img src="%s%s" alt="" loading="lazy" decoding="async">' % (IMG, b['cv'])
    return '        <li class="lying" style="%s">%s</li>' % (st, img)

def tier(books):
    return '\n'.join(spine_li(b) for b in books)

def platform(books):
    return '\n'.join(lying_li(b) for b in books)
