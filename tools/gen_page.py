# -*- coding: utf-8 -*-
import io, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import gen_data as D

def market(idx, name, tiers, lying, note):
    t = []
    for books in tiers:
        t.append('        <div class="shelf__tier">\n'
                 '          <ul class="row">\n%s\n          </ul>\n'
                 '          <div class="shelf__board"></div>\n'
                 '        </div>' % D.tier(books))
    return """
  <section class="market" aria-labelledby="theme-%d">
    <div class="wrap">
      <h2 class="market__sign" id="theme-%d">%s</h2>
    </div>
    <div class="scene">
      <div class="scene__floor"></div>
      <div class="wrap">
        <p class="sr-only">%s</p>
        <div class="shelf" aria-hidden="true">
%s
        </div>
        <div class="platform" aria-hidden="true">
          <ul class="platform__books">
%s
          </ul>
          <div class="platform__slab"></div>
        </div>
      </div>
    </div>
  </section>""" % (idx, idx, name, note, '\n'.join(t), D.platform(lying))

PAGE = """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>綴りの森</title>
<meta name="description" content="本を選ぶ楽しみをそのままに。オンライン書店「綴りの森」">
<meta name="theme-color" content="#1C2620">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500&family=Noto+Serif+JP:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles/base.css">
<link rel="stylesheet" href="styles/layout.css">
<link rel="stylesheet" href="styles/hero.css">
<link rel="stylesheet" href="styles/shelf.css">
</head>
<body>
<div class="page">

<header class="hero">
  <div class="hero__scene">
    <picture>
      <source media="(min-width:768px)" srcset="assets/images/hero-forest-landscape.webp">
      <img src="assets/images/hero-forest-portrait.webp" alt=""
           fetchpriority="high" decoding="async">
    </picture>
  </div>
  <div class="hero__light"></div>
  <div class="hero__veil"></div>

  <div class="hero__title">
    <h1 class="hero__name">綴りの森</h1>
    <p class="hero__lead">本を選ぶ楽しみをそのままに―</p>
  </div>

  <a class="hero__scroll" href="#theme-1">
    <span>棚をのぞく</span>
    <svg viewBox="0 0 13 20" aria-hidden="true">
      <path class="hero__arrow" d="M6.5 1 V17 M1.5 12 L6.5 17.4 L11.5 12"/>
    </svg>
  </a>
</header>

<section class="threshold">
  <p>森のおくに、<br>小さな本屋があります。</p>
</section>

<div class="interior">
<main class="room">
%(market1)s

  <div class="aisle">
    <div class="aisle__light"></div>
    <div class="wrap">
      <div class="aisle__inner">
        <div class="window"></div>
        <div class="sill"></div>
        <img class="plant" src="assets/images/plant.webp" alt=""
             loading="lazy" decoding="async">
      </div>
    </div>
  </div>

%(market2)s
</main>

<footer class="foot">
  <div class="wrap">
    <p class="foot__name">綴りの森</p>
    <nav class="foot__links" aria-label="サイト内の案内">
      <a href="#">綴りの森について</a>
      <a href="#">お問い合わせ</a>
      <a href="#">特定商取引法に基づく表記</a>
      <a href="#">プライバシーポリシー</a>
    </nav>
  </div>
</footer>
</div>

</div>
<script src="scripts/main.js"></script>
</body>
</html>
"""

html = PAGE % dict(
    market1 = market(1, '子供に読みたい本', [D.TIER_A1, D.TIER_A2], D.LYING_A,
                     '本棚に背表紙が2段、手前の平台に表紙を上にした本が並びます。'),
    market2 = market(2, '夜に読む本', [D.TIER_B1], D.LYING_B,
                     '本棚に背表紙が1段、手前の平台に表紙を上にした本が並びます。'),
)
io.open('index.html', 'w', encoding='utf-8', newline='\n').write(html)
print('index.html:', len(html.splitlines()), 'lines')
