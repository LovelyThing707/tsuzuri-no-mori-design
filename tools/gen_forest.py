# -*- coding: utf-8 -*-
"""ヒーローの森。奥・中・手前の三層で奥行きを作る。
   枝から本が実る。書名や絵柄は描かず、判型の違いを形だけで見せる。"""
import math

BARK = {'far':('#4C5C48','#3D4B3A'), 'mid':('#455438','#2A3622'), 'near':('#1A231A','#0D120D')}
LEAF = {'far':'#3E4F3E', 'mid':'#33422F', 'near':'#151D16'}

# 実る本の色。彩度は低く、金の箔押しや装飾は使わない
FRUIT = [
 ('#C7B48E','#A08F6C'), ('#8E5A46','#6E4234'), ('#5E6E58','#465341'),
 ('#A98C63','#83694A'), ('#6E4A3C','#523529'), ('#B9AE99','#948A78'),
 ('#7A6A52','#5B4E3C'), ('#94795A','#705B43'), ('#4F5F55','#3A473F'),
 ('#C2A87E','#9A8462'), ('#6B4F3A','#4E3A2A'), ('#8A7B5E','#685C46'),
]

def trunk(x, base, top, w, layer, bend=0.0):
    """根元が太く先が細い幹。わずかに曲げて棒に見えないようにする。"""
    lo = BARK[layer][1]
    tw = max(w * 0.20, 1.0)
    mx = x + bend * 0.55
    tx = x + bend
    return ('<path d="M%.1f %.1f Q%.1f %.1f %.1f %.1f L%.1f %.1f Q%.1f %.1f %.1f %.1f Z" '
            'fill="url(#bark-%s)"/>'
            % (x - w/2, base,
               mx - w*0.40, (base+top)/2, tx - tw/2, top,
               tx + tw/2, top,
               mx + w*0.40, (base+top)/2, x + w/2, base,
               layer))

def foliage(cx, cy, r, layer, op=.85, n=7, seed=0):
    """葉のかたまり。円を重ねて塊にする。"""
    col = LEAF[layer]; o = []
    for i in range(n):
        a = (i * 2.39996 + seed)
        rx = r * (0.44 + 0.30 * ((i * 7 + seed) % 5) / 5.0)
        dx = math.cos(a) * r * 0.62
        dy = math.sin(a) * r * 0.38
        o.append('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s" opacity="%.2f"/>'
                 % (cx+dx, cy+dy, rx, rx*0.72, col, op))
    return ''.join(o)

def branch(x, y, dx, dy, w, layer):
    lo = BARK[layer][1]
    return ('<path d="M%.1f %.1f Q%.1f %.1f %.1f %.1f" stroke="%s" stroke-width="%.1f"'
            ' fill="none" stroke-linecap="round"/>'
            % (x, y, x+dx*0.5, y+dy*0.75, x+dx, y+dy, lo, w))

def book(x, y, w, h, ci, rot=0, stem=10):
    """枝から吊り下がる1冊。背・小口・天が分かる形にする。"""
    face, spine = FRUIT[ci % len(FRUIT)]
    sw = max(w * 0.20, 1.6)
    return (
      '<g transform="translate(%.2f %.2f) rotate(%.1f)">'
      '<line x1="0" y1="%.1f" x2="0" y2="0.5" stroke="#26301F" stroke-width="0.8"/>'
      '<rect x="%.2f" y="0" width="%.2f" height="%.2f" fill="%s"/>'
      '<rect x="%.2f" y="0" width="%.2f" height="%.2f" fill="%s"/>'
      '<rect x="%.2f" y="0" width="%.2f" height="%.2f" fill="#E6DCC6" opacity=".55"/>'
      '<rect x="%.2f" y="0" width="%.2f" height="%.2f" fill="url(#fruit-shade)"/>'
      '</g>'
      % (x, y, rot, -stem,
         -w/2, w, h, face,
         -w/2, sw, h, spine,
         w/2 - w*0.09, w*0.09, h,
         -w/2, w, h))

def tree(x, base, top, w, layer, bend, crown_r, branches, seed=0):
    """1本の木。幹 → 樹冠 → 枝 → 枝先に実る本、の順に描く。"""
    o = [trunk(x, base, top, w, layer, bend)]
    if crown_r:
        o.append(foliage(x + bend, top - crown_r * 0.42, crown_r, layer,
                         .72 if layer == 'mid' else .30, 9, seed))
    for (ty, dx, dy, bw, books) in branches:
        # 枝は幹の中心から出す。幹は上に行くほど細くなるので位置を補間する
        f  = (base - ty) / float(base - top)
        bx = x + bend * f
        o.append(branch(bx, ty, dx, dy, bw, layer))
        for (u, bwid, bhgt, ci, rot) in books:
            # 枝上の位置 u(0-1) に実らせ、枝から短い軸で吊る
            px = bx + dx * u
            py = ty + dy * u * 0.75 + bw * 0.4
            o.append(book(px, py + 9, bwid, bhgt, ci, rot, stem=9))
    return ''.join(o)

def tree(x, base, top, w, layer, bend, crown_r, branches, seed=0):
    """1本の木。幹 → 樹冠 → 枝 → 枝先に実る本、の順に描く。"""
    o = [trunk(x, base, top, w, layer, bend)]
    if crown_r:
        o.append(foliage(x + bend, top - crown_r * 0.42, crown_r, layer,
                         .72 if layer == 'mid' else .30, 9, seed))
    for (ty, dx, dy, bw, books) in branches:
        f  = (base - ty) / float(base - top)
        bx = x + bend * f
        o.append(branch(bx, ty, dx, dy, bw, layer))
        for (u, bwid, bhgt, ci, rot) in books:
            px = bx + dx * u
            py = ty + dy * u * 0.75 + bw * 0.4
            o.append(book(px, py + 10, bwid, bhgt, ci, rot, stem=10))
    return ''.join(o)

def build():
    """横長で組む。広い画面ほど森が広く見え、狭い画面は中央が切り出される。"""
    o = ['<svg viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" '
         'xmlns="http://www.w3.org/2000/svg" role="presentation" focusable="false">',
         '<defs>']
    for k,(hi,lo) in BARK.items():
        o.append('<linearGradient id="bark-%s" x1="0" y1="0" x2="1" y2="0">'
                 '<stop offset="0" stop-color="%s"/><stop offset=".34" stop-color="%s"/>'
                 '<stop offset="1" stop-color="%s"/></linearGradient>' % (k, lo, hi, lo))
    o.append('<linearGradient id="fruit-shade" x1="0" y1="0" x2="0" y2="1">'
             '<stop offset="0" stop-color="#FFFFFF" stop-opacity=".18"/>'
             '<stop offset=".4" stop-color="#000000" stop-opacity="0"/>'
             '<stop offset="1" stop-color="#000000" stop-opacity=".46"/></linearGradient>')
    o.append('</defs>')

    # ---- 奥：霞んだ木立。全幅にわたって並べる --------------------
    o.append('<g class="layer--far">')
    for i in range(15):
        x  = 30 + i * 82
        w  = 11 + (i * 5) % 9
        bd = (-1) ** i * (3 + (i % 3) * 2)
        o.append(tree(x, 660, 120, w, 'far', bd, 0, [], i))
    o.append('</g>')

    # ---- 中：主役。狭い画面では中央付近（x 340〜860）が見える ----
    o.append('<g class="layer--mid">')
    mid = [
      (120, 780, 150, 30, -8, 0, [
        (330, 74,-22, 5.2, [(.42,20,16,0,-5),(.80,13,19,1,4)]),
        (452,-52,-14, 4.2, [(.58,10,14,2,-4)]),
      ], 2),
      (330, 800, 210, 34, 7, 0, [
        (318,-78,-24, 5.6, [(.36,21,17,5,3),(.74,12,18,6,-4)]),
        (438, 66,-16, 4.6, [(.50,15,12,7,4),(.90, 9,13,8,-3)]),
        (556,-44,-10, 3.4, [(.60,17,14,9,2)]),
      ], 5),
      (520, 790, 130, 32, -6, 0, [
        (300, 84,-26, 5.8, [(.40,22,17,10,-3),(.78,12,18,11,5)]),
        (424,-58,-14, 4.6, [(.52, 9,13,0,4),(.88,16,13,1,-4)]),
        (548, 50, -9, 3.6, [(.58,14,19,2,3)]),
      ], 8),
      (700, 806, 176, 29, 6, 0, [
        (322,-70,-22, 5.4, [(.38,19,15,3,4),(.76,11,16,4,-3)]),
        (446, 58,-14, 4.4, [(.56,15,12,5,-5),(.92,10,14,6,3)]),
        (562,-40, -9, 3.4, [(.62,18,14,7,-2)]),
      ], 3),
      (880, 786, 142, 33, -7, 0, [
        (308, 80,-24, 5.6, [(.44,21,16,8,-4),(.82,13,19,9,4)]),
        (430,-54,-13, 4.4, [(.54,16,13,10,3)]),
        (552, 44, -8, 3.4, [(.60, 9,13,11,-3)]),
      ], 6),
      (1070, 800, 196, 28, 6, 0, [
        (326,-66,-20, 5.2, [(.42,18,14,1,4),(.80,12,17,2,-4)]),
        (450, 54,-12, 4.2, [(.58,15,19,3,3)]),
      ], 9),
    ]
    for x, base, top, w, bd, cr, br, sd in mid:
        o.append(tree(x, base, top, w, 'mid', bd, cr, br, sd))
    o.append('</g>')

    # ---- 手前：両端の幹。広い画面でだけ額縁として効く -------------
    o.append('<g class="layer--near">')
    for x, base, top, w, br, sd in [
        (-30, 900, -80, 92, [(300, 104, 34, 10, [(.60,28,22,6,-5),(.88,18,26,7,4)])], 1),
        (1240, 900, -80, 86, [(360,-100, 30,  9, [(.56,27,21,8,4),(.86,17,24,9,-4)])], 5),
    ]:
        o.append(tree(x, base, top, w, 'near', 0, 0, br, sd))
    o.append('</g>')

    o.append('</svg>')
    return '\n'.join('    ' + s for s in o)
