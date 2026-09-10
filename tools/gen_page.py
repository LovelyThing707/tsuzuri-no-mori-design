# -*- coding: utf-8 -*-
import io, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import gen_data as D

def market(idx, name, tiers, lying, note):
    """背表紙の棚と平台は別の什器。平台は棚の手前に、隙間なく置く。"""
    TIER = """          <div class="tier">
            <ul class="row">
%s
            </ul>
          </div>"""
    t = [TIER % D.tier(b) for b in tiers]
    flat = """      <div class="platform" aria-hidden="true">
        <ul class="platform__row">
%s
        </ul>
      </div>""" % D.platform(lying)
    # 什器は絵。背表紙の段数ごとに絵を出し分けるので、段数をクラスで持たせる
    shelves = 'case--%dshelf' % len(tiers)
    return """
  <section class="market" aria-labelledby="theme-%d">
    <div class="wrap">
      <div class="market__head">
        <h2 class="market__sign" id="theme-%d">%s</h2>
        <a class="market__all" href="#">すべて見る</a>
      </div>
    </div>
    <div class="scene">
      <p class="sr-only">%s</p>
      <div class="case %s" aria-hidden="true">
        <div class="case__box">
%s
        </div>
      </div>
%s
    </div>
  </section>""" % (idx, idx, name, note, shelves, "\n".join(t), flat)

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

<header class="topbar">
  <button type="button" class="topbar__menu" aria-label="メニューを開く">
    <svg viewBox="0 0 24 18" aria-hidden="true"><path d="M1 2h22M1 9h22M1 16h22"/></svg>
  </button>
  <p class="topbar__logo">綴りの森</p>
  <button type="button" class="topbar__search" aria-label="本をさがす">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><path d="M15.6 15.6L21 21"/></svg>
  </button>
</header>

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

<div class="interior">
<main class="room">
%(market1)s

  <div class="aisle">
    <div class="aisle__light"></div>
    <a class="aisle__next" href="#theme-2">
      <span>つぎの森へ</span>
      <svg viewBox="0 0 20 12" aria-hidden="true"><path d="M2 2 L10 9.6 L18 2"/></svg>
    </a>
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

<!-- 引き抜き。棚の本をタップすると、その本が手前に出て表紙を見せる -->
<div class="pull" id="pull" hidden>
  <div class="pull__scrim" data-close></div>
  <div class="pull__panel" role="dialog" aria-modal="true" aria-labelledby="pull-title">
    <button class="pull__close" type="button" data-close aria-label="閉じる">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4 L16 16 M16 4 L4 16"/></svg>
    </button>
    <div class="pull__book">
      <img class="pull__cover" src="" alt="">
    </div>
    <div class="pull__meta">
      <h3 class="pull__title" id="pull-title"></h3>
      <p class="pull__author"></p>
      <p class="pull__lead"></p>
      <dl class="pull__spec">
        <div><dt>出版社</dt><dd class="pull__pub"></dd></div>
        <div><dt>判型・ページ数</dt><dd class="pull__form"></dd></div>
      </dl>
      <p class="pull__price"></p>
      <div class="pull__acts">
        <button class="pull__act pull__act--read" type="button">試し読み</button>
        <button class="pull__act pull__act--buy" type="button">カートに入れる</button>
      </div>
      <a class="pull__more" href="#">商品の詳細を見る</a>
    </div>
  </div>
</div>

<!-- 試し読み。見開きを左右にめくり、つまんで拡大できる -->
<div class="peek" id="peek" hidden>
  <div class="peek__stage" id="peek-stage">
    <div class="peek__track" id="peek-track">
      <figure class="peek__page">
        <img src="assets/images/sample-spread-1.webp" alt="試し読み 1ページ目" draggable="false">
      </figure>
      <figure class="peek__page">
        <img src="assets/images/sample-spread-2.webp" alt="試し読み 2ページ目" draggable="false">
      </figure>
    </div>
  </div>
  <div class="peek__bar">
    <button class="peek__nav peek__nav--prev" type="button" aria-label="前の見開き">
      <svg viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 L2 10 L10 18"/></svg>
    </button>
    <p class="peek__count"><span id="peek-now">1</span> / <span id="peek-all">2</span></p>
    <button class="peek__nav peek__nav--next" type="button" aria-label="次の見開き">
      <svg viewBox="0 0 12 20" aria-hidden="true"><path d="M2 2 L10 10 L2 18"/></svg>
    </button>
  </div>
  <p class="peek__hint" id="peek-hint">指をひろげると拡大できます</p>
  <button class="peek__close" type="button" data-peek-close aria-label="試し読みを閉じる">
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4 L16 16 M16 4 L4 16"/></svg>
  </button>
</div>

<script type="application/json" id="book-data">%(books)s</script>
<script src="scripts/main.js"></script>
</body>
</html>
"""

html = PAGE % dict(
    books   = D.book_json(),
    market1 = market(1, '子供に読みたい本', [D.TIER_A1, D.TIER_A2], D.LYING_A,
                     '背表紙の棚が2段。その手前の平台に、表紙を上にして本を寝かせて置いています。'),
    market2 = market(2, '夜に読む本', [D.TIER_B1], D.LYING_B,
                     '背表紙の棚が1段。その手前の平台に、表紙を上にして本を寝かせて置いています。'),
)
io.open('index.html', 'w', encoding='utf-8', newline='\n').write(html)
print('index.html:', len(html.splitlines()), 'lines')
