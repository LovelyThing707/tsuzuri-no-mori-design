/* ============================================================
   綴りの森 — 画面の動き
   演出は最小限に留める。動きを減らす設定の端末では何もしない。
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* --- 森の視差 ---------------------------------------------
     スクロールに対して森をわずかに遅らせ、奥行きを出す。ごく浅くかける。 */
  function parallax() {
    var hero = document.querySelector('.hero');
    var scene = document.querySelector('.hero__scene img');
    if (!hero || !scene) return;

    /* 森は遠くにある大きな景色なので、指の動きにそのまま付いてこない。
       目標の位置へ少しずつ寄せることで、重さと奥行きが出る。 */
    var want = 0, at = 0, running = false;
    function frame() {
      at += (want - at) * 0.14;
      if (Math.abs(want - at) < 0.05) at = want;
      scene.style.transform = 'translate3d(0,' + at.toFixed(2) + 'px,0) scale(1.06)';
      if (at !== want) window.requestAnimationFrame(frame);
      else running = false;
    }
    function apply() {
      var y = window.pageYOffset;
      if (y > hero.offsetHeight) return;
      want = y * 0.16;
      if (running) return;
      running = true;
      window.requestAnimationFrame(frame);
    }
    window.addEventListener('scroll', apply, { passive: true });
    at = want = window.pageYOffset * 0.16;
    scene.style.transform = 'translate3d(0,' + at.toFixed(2) + 'px,0) scale(1.06)';
  }

  /* --- 売り場が視界に入ったら静かに現れる ------------------- */
  function reveal() {
    var targets = document.querySelectorAll('.market, .aisle, .threshold');
    if (!targets.length) return;

    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(targets, function (t) { t.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    Array.prototype.forEach.call(targets, function (t) {
      t.classList.add('will-reveal');
      io.observe(t);
    });
  }

  /* --- 段の高さ ---------------------------------------------
     その段でいちばん背の高い本（見えている本）の上に、手を差し入れる空きを取る。
     空きは本の高さの 7.3%、少なくとも 16mm。値は base.css の --air-k・--air-min、
     本の高さの範囲は --h-min・--h-max（tools/gen_data.py の tier_mm と同じ決まり）。 */
  function tierMM(tall) {
    var root = window.getComputedStyle(document.documentElement);
    var num = function (k, d) { var v = parseFloat(root.getPropertyValue(k)); return isNaN(v) ? d : v; };
    var lo = num('--h-min', 120), hi = num('--h-max', 300);
    var t = Math.min(Math.max(tall, lo), hi);
    return t + Math.max(num('--air-min', 16), Math.round(t * num('--air-k', 0.073)));
  }

  /* --- 棚に入りきらない本を下げる ----------------------------
     棚は柱で幅が決まっている。入りきらない本をそのままにすると、
     柱のきわで本が縦に切れてしまう。入る冊数だけを残す。
     残した本のうちいちばん背の高い本に、段の高さを合わせる。
     見た目の正しさなので、動きを減らす設定でも必ず動かす。 */
  function fitShelves() {
    var rows = document.querySelectorAll('.case .row');
    fitW = window.innerWidth;
    Array.prototype.forEach.call(rows, function (row) {
      var books = row.querySelectorAll('.spine');
      if (!books.length) return;
      var avail = row.getBoundingClientRect().width - 4;

      /* 測るときは測るだけ、付け外しは最後にまとめて。
         以前はここで全冊の is-over をいったん外してから測っていた。
         1段120冊×3段がぜんぶ並んでから大半をまた隠すことになり、
         画面の回転や、スクロール中にURLバーが開け閉めするたびに
         （どちらも resize）そのあいだ指が効かなかった。

         隠れている本も width は読める（display:none でも、指定が
         絶対値の計算式なら計算値が返る）。出し入れは不要。

         幅は小数のまま足す。offsetWidth は整数に丸められるので、
         70冊も積むと30px近くずれ、柱ぎわで本が切れる。 */
      var i, b, cs, w, h;
      var cut = books.length;
      var used = 0, tall = 0;   /* tall は入る本のうち、いちばん背の高い本の判型（mm） */
      /* 本と本のあいだのすき間（CSS の gap）。2冊目から1冊ごとに足す */
      var gap = parseFloat(window.getComputedStyle(row).columnGap) || 0;
      for (i = 0; i < books.length; i++) {
        b = books[i];
        cs = window.getComputedStyle(b);
        /* 抜き（margin）も幅に含める。含めないと入ると誤算し、
           先頭の1冊が柱の外へ押し出されて押せなくなる */
        w = (parseFloat(cs.width) || 0)
          + (parseFloat(cs.marginLeft) || 0)
          + (parseFloat(cs.marginRight) || 0);
        /* 本はまっすぐ立てている（傾けていない）ので、端の余白は要らない。
           以前は傾きのぶん両端を空けていて、12冊目が入らなかった */
        h = Math.max(tall, parseFloat(cs.getPropertyValue('--h')) || 0);
        if (i > 0) w += gap;
        if (used + w > avail) { cut = i; break; }
        used += w;
        tall = h;
      }

      /* 段の高さ。読み込んだときは、段に並べる本すべてのうちいちばん背の高い本に
         合わせてある（tools/gen_page.py）。見えている本だけに合わせて下げる。
         見える本は幅だけで決まるので、高さだけが変わるとき（URL バーの出し入れ）は動かない */
      var tier = row.closest('.tier');
      if (tier && tall > 0) {
        var th = 'calc(var(--mm) * ' + tierMM(tall) + ')';
        if (tier.style.getPropertyValue('--tier-h').trim() !== th) tier.style.setProperty('--tier-h', th);
      }

      for (i = 0; i < books.length; i++) {
        b = books[i];
        if (i < cut) {
          if (b.classList.contains('is-over')) b.classList.remove('is-over');
        } else {
          if (!b.classList.contains('is-over')) b.classList.add('is-over');
        }
      }
    });
  }


  /* 入る冊数と段の高さは、画面の幅だけで決まる。スマートフォンでは下へ送るたびに
     URL バーが出入りして resize が来るが、幅は変わらないので測り直さない
     （測り直しても同じ結果だが、そのたびに1段百冊を読み直すことになる） */
  var fitTimer, fitW = 0;
  function onResize() {
    if (window.innerWidth === fitW) return;
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitShelves, 120);
  }

  function start() {
    if (reduced.matches) return;
    parallax();
    reveal();
  }

  /* --- 重なった画面 -------------------------------------------
     画面はいくつも重なる。Escape で閉じるのは、いちばん上の一枚だけ。 */
  function above(ids) {
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && !el.hidden) return true;
    }
    return false;
  }

  /* --- 手の動き ---------------------------------------------
     いま使われているのが、キーボードか、指・マウスか。
     画面を閉じたあと焦点を棚の本へ返すのは、キーボードで操作しているときだけ。
     指やマウスで閉じたあとに本へ焦点を返すと、キーボード用の書名の札が出て、
     本が少し引き出されたまま残り、次のタップで隣の本を選んでしまう。 */
  var byKey = false;
  function modality() {
    document.addEventListener('keydown', function (e) {
      /* 修飾キーだけのとき（Ctrl を押しながらのクリックなど）は数えない */
      if (!/^(Shift|Control|Alt|Meta)$/.test(e.key)) byKey = true;
    }, true);
    document.addEventListener('pointerdown', function () { byKey = false; }, true);
  }

  /* 閉じた画面の中に、焦点を残さない。
     キーボードのときは、入口だった棚の本へ返す */
  function settleFocus(back, inside) {
    if (byKey && back && back.isConnected && back.getClientRects().length) {
      back.focus({ preventScroll: true, focusVisible: true });
      return;
    }
    var a = document.activeElement;
    if (a && a !== document.body && inside && inside.contains(a)) a.blur();
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* --- 本を棚から引き出す ------------------------------------
     棚の本をタップすると、その本が自分の場所から手前へ引き出され、途中で止まる。
     手で本の頭に指をかけ、棚から引き抜きかけたときの動き。後ろはまだ棚に残っている
     （9/30 のご依頼「本の後ろ側がまだ本棚に少し残っているくらいの引き出し具合」）。
     ほかの本はぼかして暗くし、引き出した本にだけピントが合う（1回目）。
     書名などの文字は添えない（同日のご依頼。背表紙そのものが見やすくなれば足りる）。
     引き出した本をもう一度タップすると、商品詳細が開く（2回目）。
     それ以外のところをタップすると、本は棚へ押しもどされる。
     以前は指を離しただけで本が開き、途中で指が離れただけでも先の画面へ
     進んでしまっていた（國分様のご指摘）。先へ進むのは、引き出した本を
     もう一度タップしたときだけにする。
     平置きの本は、タップするとそのまま商品詳細が開く（表紙の拡大は無い。9/30 のご依頼）。
     マウスでは、指している本が少し出て書名の札が出る（何も開かない）。クリックで引き出す。
     キーボードでは Enter で引き出し、もう一度 Enter で商品詳細、Escape で棚へもどす。 */
  function shelf(page) {
    var root = document.getElementById('focus');
    var raw = document.getElementById('book-data');
    if (!root || !raw || !page) return;

    var BOOKS = JSON.parse(raw.textContent);
    var box = root.querySelector('.focus__book');
    var hole = root.querySelector('.focus__slot');
    var shut = root.querySelector('.focus__close');

    /* 引き出す大きさ。縦と横に同じ倍率をかけ、実物どおりの比のまま大きくする。
       ご依頼の絵では、棚で 205px の本が引き出すと 360px（1.76 倍）。
       大きさを変えても動かない点は、本の上から 71% のところ（同じ絵から）。本は上へ大きく、
       下へ少し伸び、下の端は棚板の手前の縁にかかる（手前へ来たぶん）。
       背の高い本が背の低い画面に収まらないときだけ、収まるところまで倍率を下げる。
       画面の上の端に近い本（上の段の本、背の高い本）も倍率を下げる。1.76 倍のままだと
       上の端で止めて下へ伸ばすことになり、本が棚から落ちて平台の上に出たように見える。
       下の端が棚板の縁より下へ出るのは、本の高さの 12.5% まで（ご依頼の絵と同じ出方）。
       写真を引き伸ばすのではなく、大きな --mm で描き直す（写真の細かさのまま描ける） */
    var PULL = 1.76;
    var BELOW = 0.125;    /* 棚板の縁より下へ出る長さの上限（引き出した本の高さに対する割合） */
    var PULL_MIN = 1.2;   /* 画面の上の端で切れかけている本を引き出すときの下限 */
    var FIX = 0.71;       /* styles/shelf.css の .focus__book の transform-origin と同じ */
    var EDGE_X = 8;       /* 画面の左右の端から空ける。端の列の本も、なるべく自分の列のまま */
    var EDGE_Y = 12;      /* 画面の上下の端から空ける */
    var SIDE = 11;        /* 側面の見える幅の上限（px）。画面の端の本ほど広く見える */
    var DEPTH = 0.35;     /* 引き出したぶん（本の奥行きに対する割合）。側面に見えるのはここまで */
    var GUARD = 450;      /* 引き出してすぐのタップは受けない。二度たたきで先へ進まないように */
    var DRIFT = 12;       /* 引き出したまま、これより画面を送ったら棚へもどす */
    /* 動きの長さ。引き出すときは、頭に指をかけて手前へ傾ける短い間のあと、
       すっと出てきて、静かに止まる。押しもどすときは、止まった姿から動き出し、
       棚に収まる手前で速さを落とす（速さを増したまま着くと、棚の本へ跳んだように見える）。
       動きを減らす設定では、棚の自分の場所から短く手前へ出て、短く戻るだけ
       （側面を見せる動きも、傾ける動きもない。透けた姿から現れたり、消えていったりもしない） */
    var T_OPEN = 500, T_CLOSE = 300, T_SOFT = 280, T_SOFT_CLOSE = 200;
    var HOOK = 0.16;      /* 引き出す動きのうち、頭に指をかけて傾けるところの割合（80ms） */
    var EASE_HOOK = 'cubic-bezier(.4,0,.8,.6)';
    var EASE_PULL = 'cubic-bezier(.24,.6,.3,1)';
    var EASE_BACK = 'cubic-bezier(.34,.08,.24,1)';

    var src = null;       /* 引き出している棚の本 */
    var key = null;
    var at = null;        /* 引き出した本の置き場所と、棚の上の姿 */
    var since = 0;        /* 引き出した時刻 */
    var y0 = 0;           /* 引き出したときの画面の位置 */
    var w0 = 0;           /* 引き出したときの画面の幅 */
    var anims = [];       /* 動いている途中の動き（本・側面・影・すき間） */
    var later = 0;

    /* ぼかしが重い端末（メモリの少ない端末）と、透け感を減らす設定では、暗くするだけにする */
    if ((navigator.deviceMemory && navigator.deviceMemory <= 2) ||
        window.matchMedia('(prefers-reduced-transparency: reduce)').matches) {
      root.classList.add('is-plain');
    }

    /* 棚の上での本の姿。指でなぞって少し持ち上がっている途中（is-picked の戻り）や、
       マウスを乗せて持ち上がっているときも、棚に立っている位置で測る。
       持ち上がっていたぶん（lx・ly）も返す。引き出す動きは、その持ち上がった姿から始める
       （棚に立つ位置から始めると、本が一度沈んでから出てくる） */
    function slot(el) {
      var r = el.getBoundingClientRect();
      var m = window.getComputedStyle(el).transform;
      var dx = 0, dy = 0;
      if (m && m !== 'none') {
        var M = new DOMMatrix(m);
        dx = M.e; dy = M.f;
      }
      return { l: r.left - dx, t: r.top - dy, w: r.width, h: r.height, lx: dx, ly: dy };
    }

    /* 置き場所を決める。本は棚の自分の列のまま（左右の中心は棚の本と同じ）、
       上から 71% の点を動かさずに大きくする。画面からはみ出すときだけ、内側へ寄せる。
       側面は画面の中央を向いた側に見える */
    function layout(el, b) {
      var vw = root.clientWidth, vh = root.clientHeight;
      var sl = slot(el);
      /* 上の端から EDGE_Y 空けて置いたときに、下の端が棚板の縁より BELOW を超えて出ない倍率まで。
         画面の上の端で切れかけている本でも、背表紙が読みやすくなるよう PULL_MIN までは大きくする */
      var s = Math.min(PULL, (sl.t + sl.h - EDGE_Y) / (sl.h * (1 - BELOW)));
      s = Math.min(Math.max(s, PULL_MIN), (vh - 2 * EDGE_Y) / sl.h);
      /* 写しを大きな --mm で描く。天（紙の束の上面）の見える高さも同じ倍率で */
      var top = parseFloat(window.getComputedStyle(el, '::before').height) || 0;
      var node = document.createElement('div');
      node.className = 'spine';
      node.setAttribute('style', el.getAttribute('style') || '');
      node.style.setProperty('--mm', s + 'px');
      node.style.setProperty('--top', (top * s).toFixed(2) + 'px');
      var im = el.querySelector('img');
      if (im) {
        im = im.cloneNode(false);
        im.loading = 'eager';
        node.appendChild(im);
      }
      var cast = document.createElement('span');
      cast.className = 'focus__cast';
      node.appendChild(cast);
      box.appendChild(node);
      var nr = node.getBoundingClientRect();
      var W = nr.width, H = nr.height;

      var cx = sl.l + sl.w / 2, mid = vw / 2;
      /* 側面の見える幅。画面の中央からの隔たりに比べる（中央の本は側面がほとんど見えない） */
      var sw = Math.min(SIDE, SIDE * Math.abs(cx - mid) / (vw * 0.42));
      var right = cx < mid;
      if (sw < 2.5) sw = 0;

      var L = cx - W / 2;
      L = clamp(L, EDGE_X + (right ? 0 : sw), vw - EDGE_X - W - (right ? sw : 0));
      var T = sl.t + FIX * sl.h - FIX * H;
      T = clamp(T, EDGE_Y, vh - EDGE_Y - H);

      var side = null;
      if (sw && b.cover) {
        /* 側面は表紙の絵を奥へ縮めたもの。引き出したぶん（奥行きの 35%）を、見える幅に収める。
           奥の端は、画面の中央（目の高さ）へ向かってすぼまる */
        side = document.createElement('span');
        side.className = 'focus__side ' + (right ? 'is-right' : 'is-left');
        side.setAttribute('aria-hidden', 'true');
        var near = right ? L + W : L;
        var f = sw / Math.max(60, Math.abs(mid - near));
        var yv = vh * 0.45 - T;                   /* 目の高さ（本の上の端から） */
        var a = (yv * f).toFixed(2), z = (H + (yv - H) * f).toFixed(2);
        var w = sw.toFixed(2);
        side.style.width = w + 'px';
        side.style.backgroundImage = 'url("' + b.cover + '")';
        side.style.backgroundSize = (sw / DEPTH).toFixed(2) + 'px 100%';
        side.style.backgroundPosition = right ? 'left top' : 'right top';
        var poly = right
          ? 'polygon(0 0, ' + w + 'px ' + a + 'px, ' + w + 'px ' + z + 'px, 0 100%)'
          : 'polygon(0 ' + a + 'px, ' + w + 'px 0, ' + w + 'px 100%, 0 ' + z + 'px)';
        side.style.webkitClipPath = poly;
        side.style.clipPath = poly;
        node.appendChild(side);
      }

      box.style.left = L + 'px'; box.style.top = T + 'px';
      box.style.width = W + 'px'; box.style.height = H + 'px';
      /* 本の抜けたすき間。棚の上の本と同じところ */
      hole.style.left = sl.l + 'px'; hole.style.top = sl.t + 'px';
      hole.style.width = sl.w + 'px'; hole.style.height = sl.h + 'px';
      /* かけた倍率を書いておく（tests/verify.js が引き出す大きさの決まりどおりかを読む） */
      root.setAttribute('data-scale', s.toFixed(3));
      return { L: L, T: T, W: W, H: H, s: s, sl: sl, node: node, side: side, cast: cast };
    }

    /* 引き出した本を、棚の上の姿に重ねる変形。軸は上から 71% の点（.focus__book の transform-origin）。
       g をかけると、その点を動かさずに少しだけ大きくする（頭に指をかけ、手前へ傾けたところ）。
       lifted のときは、なぞったりマウスを乗せたりして持ち上がっていた姿に重ねる */
    function onShelf(g, lifted) {
      var sl = at.sl;
      var sc = sl.w / at.W;
      var tx = sl.l - at.L - at.W / 2 * (1 - sc) + (lifted ? sl.lx : 0);
      var ty = sl.t - at.T - FIX * at.H * (1 - sc) + (lifted ? sl.ly : 0);
      return 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) scale(' + (sc * (g || 1)).toFixed(4) + ')';
    }

    /* 引き出したまま画面が送られたら、本と空いたところも棚といっしょに動かす（層は画面に固定なので）。
       閉じる動きの途中も同じ。止まった先が、そのときの棚の本の場所になる */
    function follow() {
      if (!at || page.shown()) return;
      var d = window.pageYOffset - y0;
      box.style.top = (at.T - d) + 'px';
      hole.style.top = (at.sl.t - d) + 'px';
    }

    function stop() {
      anims.forEach(function (a) { a.cancel(); });
      anims = [];
    }
    /* 動きは最後まで持っておき（止めた姿を残すものがある）、片づけるときにまとめて外す */
    function track(list, then) {
      anims = list;
      var a = list[0];
      a.onfinish = function () { if (anims[0] === a && then) then(); };
    }

    /* 1回目。本を引き出す（平置きの本は、そのまま商品詳細へ） */
    function open(el) {
      var k = el.getAttribute('data-book');
      var b = BOOKS[k];
      if (!b || page.shown()) return;
      if (el.classList.contains('flat')) { visit(el); return; }
      if (src) done(true);
      hintDone();
      pick(null);

      src = el; key = k;
      /* 層の名前は書名（書名は画面に出さないが、読み上げでは名乗る） */
      root.setAttribute('aria-label', b.title);
      box.setAttribute('aria-label', '「' + b.title + '」の商品ページを開く');
      box.innerHTML = '';
      root.classList.remove('is-open', 'is-leaving');
      root.classList.toggle('by-key', byKey);
      root.hidden = false;

      at = layout(el, b);
      el.classList.add('is-taken');
      since = Date.now();
      y0 = window.pageYOffset;
      w0 = root.clientWidth;

      var list;
      if (reduced.matches) {
        /* 棚の自分の場所から、短く手前へ出るだけ。浮かび上がる（透けた姿から現れる）のではなく、
           本そのものが出てくる。側面を見せる動きも、傾ける動きもない（側面と影は薄く現れるだけ） */
        var so = { duration: T_SOFT, fill: 'forwards' };
        list = [
          box.animate([{ transform: onShelf(1, true) }, { transform: 'none' }],
            { duration: T_SOFT, easing: 'cubic-bezier(.2,.7,.3,1)' }),
          hole.animate([{ opacity: 0 }, { opacity: 1 }], so),
          at.cast.animate([{ opacity: 0 }, { opacity: 1 }], so)
        ];
        if (at.side) list.push(at.side.animate([{ opacity: 0 }, { opacity: 1 }], so));
      } else {
        var o = { duration: T_OPEN };
        var tip = 'perspective(' + Math.round(at.H * 2.2) + 'px) ';
        list = [
          /* 本。棚の姿（持ち上がっていたらその姿）のまま頭に指がかかり（わずかに手前へ）、
             そこから手前へすっと出て止まる */
          box.animate([
            { transform: onShelf(1, true), offset: 0, easing: EASE_HOOK },
            { transform: onShelf(1.02), offset: HOOK, easing: EASE_PULL },
            { transform: 'none', offset: 1 }
          ], o),
          /* 頭が手前へ傾き、引き出すあいだに起き直る。軸は本の足もと。
             遠近は本の高さに比べて決め、背の高い本も低い本も、頭が同じだけ（4% ほど）手前へ来る */
          at.node.animate([
            { transform: tip + 'rotateX(0deg)', offset: 0, easing: 'ease-out' },
            { transform: tip + 'rotateX(-5deg)', offset: HOOK, easing: 'ease-in-out' },
            { transform: tip + 'rotateX(0deg)', offset: 0.62 },
            { transform: tip + 'rotateX(0deg)', offset: 1 }
          ], o),
          /* 影は、本が棚から離れるほど遠く、やわらかくなる */
          at.cast.animate([
            { opacity: 0, transform: 'translate(-8px,-10px) scale(.9)', offset: 0 },
            { opacity: 0.25, transform: 'translate(-6px,-8px) scale(.92)', offset: HOOK, easing: EASE_PULL },
            { opacity: 1, transform: 'none', offset: 1 }
          ], o),
          /* すき間は、本が抜けはじめたところから暗くなる */
          hole.animate([{ opacity: 0 }, { opacity: 0, offset: HOOK * 0.5 }, { opacity: 1, offset: 0.6 }, { opacity: 1 }],
            Object.assign({ fill: 'forwards' }, o))
        ];
        /* 側面は、引き出したぶんだけ見えてくる */
        if (at.side) list.push(at.side.animate([
          { transform: 'scaleX(0)', offset: 0 },
          { transform: 'scaleX(0)', offset: HOOK, easing: EASE_PULL },
          { transform: 'none', offset: 1 }
        ], o));
      }
      track(list);
      /* 幕（ぼかし）は、本が動いているあいだに立ち上げる */
      window.requestAnimationFrame(function () {
        if (src === el && !root.classList.contains('is-leaving')) root.classList.add('is-open');
      });
      /* 指で引き出したときも焦点は移す（読み上げが、引き出した本から読めるように）。
         そのときは焦点の枠を出さない（focusVisible）。枠が出ると、その先の商品詳細の
         「棚にもどる」にも枠が引き継がれる */
      box.focus({ preventScroll: true, focusVisible: byKey });
    }

    /* 棚へもどす。引き出した本は、いまの姿から棚の空いたところへ押しもどされる */
    function close() {
      if (!src || root.classList.contains('is-leaving')) return;
      var el = src;
      root.classList.remove('is-open');
      root.classList.add('is-leaving');
      /* 引き出す途中で閉じたときは、いまの姿から戻す */
      var cur = function (e, p) { return window.getComputedStyle(e)[p]; };
      var now = { box: cur(box, 'transform'), node: cur(at.node, 'transform'),
                  cast: cur(at.cast, 'transform'), castOp: cur(at.cast, 'opacity'),
                  side: at.side ? cur(at.side, 'transform') : null, sideOp: at.side ? cur(at.side, 'opacity') : null,
                  hole: cur(hole, 'opacity') };
      stop();
      /* 戻す先は、いまの棚の本の場所。引き出したときに測った場所のままだと、画面を送って閉じたとき、
         本は棚が動く前の場所へ戻り、そのあと棚の本が別のところに現れる。
         引き出したときの画面の位置（y0）での値に直しておく（follow が画面の送りを足す） */
      var sl = slot(el), d = window.pageYOffset - y0;
      at.sl = { l: sl.l, t: sl.t + d, w: sl.w, h: sl.h, lx: 0, ly: 0 };
      hole.style.left = at.sl.l + 'px';
      follow();
      var list;
      if (reduced.matches) {
        /* 短く、棚の自分の場所へ押しもどす。消えていくのではなく、本そのものが戻る */
        var so = { duration: T_SOFT_CLOSE, fill: 'forwards' };
        list = [
          box.animate([{ transform: now.box }, { transform: onShelf() }],
            { duration: T_SOFT_CLOSE, easing: EASE_BACK, fill: 'forwards' }),
          hole.animate([{ opacity: now.hole }, { opacity: now.hole, offset: 0.7 }, { opacity: 0 }], so),
          at.cast.animate([{ opacity: now.castOp }, { opacity: 0 }], so)
        ];
        if (at.side) list.push(at.side.animate([{ opacity: now.sideOp }, { opacity: 0 }], so));
      } else {
        var o = { duration: T_CLOSE, easing: EASE_BACK, fill: 'forwards' };
        list = [
          box.animate([{ transform: now.box }, { transform: onShelf() }], o),
          at.node.animate([{ transform: now.node }, { transform: 'none' }], o),
          at.cast.animate([{ transform: now.cast, opacity: now.castOp }, { transform: 'translate(-8px,-10px) scale(.9)', opacity: 0 }], o),
          /* すき間は、本が収まりきるまで暗いまま */
          hole.animate([{ opacity: now.hole }, { opacity: now.hole, offset: 0.7 }, { opacity: 0 }], o)
        ];
        if (at.side) list.push(at.side.animate([{ transform: now.side }, { transform: 'scaleX(0)', offset: 0.85 }, { transform: 'scaleX(0)' }], o));
      }
      track(list, function () { if (src === el) done(false); });
    }

    /* 片づける。keep のときは焦点を動かさない（商品詳細へ進んだとき、別の本を引き出すとき） */
    function done(keep) {
      var el = src;
      if (!el) return;
      window.clearTimeout(later);
      stop();
      src = null; key = null; at = null;
      el.classList.remove('is-taken');
      if (!keep) settleFocus(el, root);
      root.hidden = true;
      root.classList.remove('is-open', 'is-leaving');
      root.removeAttribute('data-scale');
      root.removeAttribute('aria-label');
      box.innerHTML = '';
      box.removeAttribute('style');
      hole.removeAttribute('style');
    }

    /* 2回目。商品詳細を開く。引き出した本は、商品詳細が出きってから棚へ戻す
       （先に戻すと、商品詳細が現れるあいだ、後ろに元の棚が透けて見える） */
    function go() {
      if (!src || root.classList.contains('is-leaving')) return;
      var el = src;
      root.classList.add('is-leaving');
      page.open(key, el);
      later = window.setTimeout(function () { if (src === el) done(true); },
        reduced.matches ? 0 : 480);
    }

    /* 平置きの本。そのまま商品詳細を開く。押した手応えは CSS の :active だけ（待たせない） */
    function visit(el) {
      if (src) done(true);
      hintDone();
      page.open(el.getAttribute('data-book'), el);
    }

    /* 指を離した位置。指で触れる端末のブラウザは、ボタンの近くをたたくと、
       click をそのボタンに寄せて届ける。引き出した本のすぐ外（画面の隅の上の帯など）を
       たたいても商品詳細に進んでしまうので、どこをたたいたかは指を離した位置で決める */
    var lift = null;
    root.addEventListener('pointerup', function (e) {
      lift = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY, t: Date.now() } : null;
    });
    root.addEventListener('click', function (e) {
      if (!src || root.classList.contains('is-leaving')) return;
      /* 引き出してすぐのタップは受けない。二度たたきの2回目や、
         指を離したあとに届く click が、そのまま商品詳細を開かないように */
      if (Date.now() - since < GUARD) return;
      var hit = e.target;
      if (lift && Date.now() - lift.t < 700) hit = document.elementFromPoint(lift.x, lift.y) || hit;
      lift = null;
      if (hit.closest('.focus__close')) { close(); return; }
      /* 先へ進むのは、引き出した本（見えない押し幅を含む）だけ */
      if (hit.closest('.focus__book')) { go(); return; }
      /* それ以外（ぼかした棚、ほかの本、上の帯のあたり）は、棚へもどす */
      close();
    });
    document.addEventListener('keydown', function (e) {
      /* 商品詳細へ進むところ（is-leaving）では、もう焦点は商品詳細にある。Tab を横取りしない */
      if (!src || root.hidden || root.classList.contains('is-leaving')) return;
      root.classList.add('by-key');
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'Tab') {
        /* 焦点は、引き出した本と「棚にもどる」のあいだだけを回る */
        e.preventDefault();
        (document.activeElement === box ? shut : box).focus({ preventScroll: true });
      }
    }, true);
    /* 引き出したまま画面を送ったら、棚へもどす。画面は止めない。
       本は棚といっしょに動き、棚の自分の場所へ戻る */
    window.addEventListener('scroll', function () {
      if (!src) return;
      follow();
      if (!root.classList.contains('is-leaving') &&
          Math.abs(window.pageYOffset - y0) > DRIFT) close();
    }, { passive: true });
    /* 画面の向きが変わったら、置き場所が合わなくなるので片づける。
       高さだけの変化（スマートフォンの URL バーの出入り）では閉じない */
    window.addEventListener('resize', function () {
      if (src && root.clientWidth !== w0) done(false);
    });
    /* 履歴をたどったとき（進む操作で商品詳細が開き直したときなど）は、引き出した本を片づける。
       商品詳細の popstate が先に動くので、商品詳細が開いていれば焦点はそちらに残す */
    window.addEventListener('popstate', function () {
      if (src) done(page.shown());
    });

    /* 狙いが外れたとき、いちばん近い本を拾う（マウス）。
       いちばん薄い本でも背は10px前後しかない。
       段の中で当たったなら、横の距離がいちばん近い本を引き出す。
       見た目には何も足していない（本を太らせずに、狙いだけ広げる）。 */
    function nearest(e) {
      var row = e.target.closest && e.target.closest('.case .row');
      if (!row) return null;
      var books = row.querySelectorAll('.spine[data-book]');
      var best = null, bestD = 26;   /* これより離れていたら拾わない */
      for (var i = 0; i < books.length; i++) {
        var b = books[i];
        if (b.classList.contains('is-over')) continue;
        var r = b.getBoundingClientRect();
        if (!r.width) continue;
        var d = e.clientX < r.left ? r.left - e.clientX
              : e.clientX > r.right ? e.clientX - r.right : 0;
        if (d < bestD) { bestD = d; best = b; }
      }
      return best;
    }

    /* --- 指でなぞって選ぶ ---------------------------------------
       背表紙は実物どおりの比で描いているので、薄い絵本の背は数mm。
       指の腹より細く、書名の文字も小さい。
       書店で背表紙を指でなぞるように、棚の上を横になぞると、
       指の下の本が少し手前に出て、書名が大きく出る。
       指を離すと、その本を棚から引き出す（1回目と同じ。商品詳細へは進まない）。
       指を棚の上下へ外してから離せば、何もせずにやめられる。
       縦に動かしたときはページを送る（棚に touch-action:pan-y）。 */
    var tag = document.createElement('div');
    tag.className = 'pick-tag';
    tag.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tag);

    var picked = null;          /* いま札を出している本 */
    var touch = null;           /* なぞっている指 */
    var quietUntil = 0;         /* 指を離した直後に届く click を無視する */
    var OFF = 36;               /* 棚の上下にこれだけ外して離したら、引き出さない */

    function shelfBooks(row) {
      return Array.prototype.filter.call(
        row.querySelectorAll('.spine[data-book]'),
        function (b) { return !b.classList.contains('is-over'); });
    }
    /* 指の横位置にいちばん近い本。指は本の上端より上にあってもよい */
    function bookAt(row, x) {
      var list = shelfBooks(row), best = null, bestD = Infinity;
      for (var i = 0; i < list.length; i++) {
        var r = list[i].getBoundingClientRect();
        var d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        if (d < bestD) { bestD = d; best = list[i]; }
      }
      return best;
    }
    /* 指が棚の上にあるか。上下に OFF 以上外れたら、選ぶのをやめたとみなす */
    function onRow(row, y) {
      var r = row.getBoundingClientRect();
      return y >= r.top - OFF && y <= r.bottom + OFF;
    }
    function pick(b) {
      if (picked === b) return;
      if (picked) picked.classList.remove('is-picked');
      picked = b;
      if (!b) { tag.classList.remove('is-on'); return; }
      b.classList.add('is-picked');
      var info = BOOKS[b.getAttribute('data-book')];
      tag.textContent = info ? info.title : '';
      place(b);
    }
    function place(b) {
      /* 札は本の上に置く。幅は書名の長さで決まり、置く位置には左右されない
         （CSS の width:max-content）。書名を入れ替えた直後の幅で位置を決め、
         画面の端からはみ出さないよう左右を詰める。三角の先だけが本を指す */
      var r = b.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var w = tag.offsetWidth, h = tag.offsetHeight, edge = 10;
      var x = Math.min(Math.max(cx, w / 2 + edge), window.innerWidth - w / 2 - edge);
      /* 上の帯に隠れないよう、札の上端が帯より下に来るところまでで止める */
      var bar = document.querySelector('.topbar');
      var floor = (bar ? bar.getBoundingClientRect().bottom : 0) + h + 14;
      tag.style.left = x + 'px';
      tag.style.top = Math.max(r.top, floor) + 'px';
      tag.style.setProperty('--tip', Math.min(Math.max(50 + (cx - x) / w * 100, 8), 92) + '%');
      tag.classList.add('is-on');
    }

    document.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      var row = e.target.closest && e.target.closest('.case .row');
      if (!row) return;
      hintDone();
      touch = { id: e.pointerId, row: row, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, on: false };
      /* すぐに札を出すと、縦に送ろうとしただけでも本が動いてしまう。
         少し待って、指がほとんど動いていなければ出す。横に動いたら、すぐ出す */
      touch.timer = window.setTimeout(function () {
        if (!touch || touch.on) return;
        if (Math.abs(touch.ly - touch.y) > 4 || Math.abs(touch.lx - touch.x) > 4) return;
        touch.on = true;
        pick(bookAt(touch.row, touch.x));
      }, 180);
    }, { passive: true });

    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse') {
        /* マウスでは、指している本に書名を出す（何も開かない） */
        var row = e.target.closest && e.target.closest('.case .row');
        pick(row ? bookAt(row, e.clientX) : null);
        return;
      }
      if (!touch || e.pointerId !== touch.id) return;
      var dx = e.clientX - touch.x, dy = e.clientY - touch.y;
      touch.lx = e.clientX; touch.ly = e.clientY;
      if (!touch.on) {
        /* 縦の動きが勝ったら、ページを送る指。札は出さない */
        if (Math.abs(dy) > 4 && Math.abs(dy) >= Math.abs(dx)) { window.clearTimeout(touch.timer); return; }
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
          touch.on = true;
          window.clearTimeout(touch.timer);
        }
      }
      if (!touch.on) return;
      /* 棚の上下へ外したら札を下げる。戻れば、また出す */
      pick(onRow(touch.row, e.clientY) ? bookAt(touch.row, e.clientX) : null);
    }, { passive: true });

    function endTouch() {
      if (touch) window.clearTimeout(touch.timer);
      touch = null;
      pick(null);
    }
    document.addEventListener('pointerup', function (e) {
      if (!touch || e.pointerId !== touch.id) return;
      var b = null;
      if (onRow(touch.row, e.clientY)) b = touch.on ? picked : bookAt(touch.row, e.clientX);
      endTouch();
      /* 指を離したあとに届く click で、二度引き出さないように。
         引き出さずにやめたときも、あとから届く click で本を引き出さないように */
      quietUntil = Date.now() + 600;
      if (b) open(b);
    });
    /* 縦に送り始めると、指は棚から外れる */
    document.addEventListener('pointercancel', function (e) {
      if (touch && e.pointerId === touch.id) endTouch();
    });
    /* 長押しで、端末の画像のメニューが開かないように */
    document.addEventListener('contextmenu', function (e) {
      if (e.target.closest && e.target.closest('.case .row') &&
          (touch || (e.pointerType && e.pointerType !== 'mouse'))) e.preventDefault();
    });
    /* キーボードで本を選んだときも、書名を出す。
       指やマウスで閉じたときは、本へ焦点を返さない（settleFocus）。
       :focus-visible はキーボード操作のときだけ付く */
    document.addEventListener('focusin', function (e) {
      var b = e.target.closest && e.target.closest('.case .spine[data-book]');
      if (b && b.matches(':focus-visible')) pick(b);
    });
    document.addEventListener('focusout', function (e) {
      if (e.target.closest && e.target.closest('.case .spine')) pick(null);
    });
    window.addEventListener('scroll', function () {
      if (touch) return;
      /* キーボードで選んでいる本は、札を置き直す（Tab で本が画面の中へ送られたとき） */
      if (picked && picked === document.activeElement) place(picked);
      else pick(null);
    }, { passive: true });
    window.addEventListener('resize', function () { if (!touch) pick(null); });

    /* --- 引き出せることを、一度だけ知らせる ----------------------
       指で触れる端末で、最初の棚が見えてきたときに、短く出して消す。
       一度でも棚に触れたら、もう出さない。 */
    var hint = null;
    function hintDone() {
      try { window.localStorage.setItem('shelf-hint', '1'); } catch (err) { /* 保存できない端末 */ }
      if (hint) { hint.classList.remove('is-on'); hint = null; }
    }
    (function () {
      var seen = false;
      try { seen = window.localStorage.getItem('shelf-hint') === '1'; } catch (err) { /* 保存できない端末 */ }
      if (seen || !window.matchMedia('(pointer:coarse)').matches || !('IntersectionObserver' in window)) return;
      var first = document.querySelector('.case .row');
      if (!first) return;
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting || entries[0].intersectionRatio < 0.6) return;
        io.disconnect();
        hint = document.createElement('p');
        hint.className = 'shelf-hint';
        hint.setAttribute('aria-hidden', 'true');
        hint.textContent = '本をタップすると、棚から引き出されます';
        first.parentNode.appendChild(hint);
        window.requestAnimationFrame(function () { if (hint) hint.classList.add('is-on'); });
        window.setTimeout(function () {
          if (!hint) return;
          var h = hint;
          h.classList.remove('is-on');
          hint = null;
          window.setTimeout(function () { h.remove(); }, 600);
          try { window.localStorage.setItem('shelf-hint', '1'); } catch (err) { /* 保存できない端末 */ }
        }, 3600);
      }, { threshold: [0, 0.6] });
      io.observe(first);
    })();

    /* マウスのクリック（と、指で平置きの本をタップしたとき）。背表紙は引き出し、平置きの本は商品詳細を開く */
    document.addEventListener('click', function (e) {
      if (Date.now() < quietUntil) return;
      if (root.contains(e.target)) return;
      var hit = e.target.closest('.case .spine[data-book], .case .flat[data-book]') || nearest(e);
      if (hit) open(hit);
    });
    /* キーボード。Enter か Space で本を引き出す（平置きの本は商品詳細を開く）。
       ここで既定の動きを止めておく。止めないと、引き出した本（ボタン）に焦点が移ったあと、
       同じキーでそのまま商品詳細が開いてしまう */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var hit = e.target.closest && e.target.closest('.case .spine[data-book], .case .flat[data-book]');
      if (hit) { e.preventDefault(); open(hit); }
    });
  }

  /* --- 試し読み ---------------------------------------------
     見開きを左右にめくり、指でひろげて拡大する。
     商品詳細の「試し読み」から開き、閉じると元の状態（商品詳細）に戻る。

     指の操作は自前で受ける。端末まかせの拡大だと、
     画面全体が拡大されて棚まで動いてしまうため。 */
  function peek() {
    var root = document.getElementById('peek');
    if (!root) return;

    var stage = document.getElementById('peek-stage');
    var track = document.getElementById('peek-track');
    var pages = track.querySelectorAll('.peek__page');
    var now = document.getElementById('peek-now');
    var hint = document.getElementById('peek-hint');
    var prev = root.querySelector('.peek__nav--prev');
    var next = root.querySelector('.peek__nav--next');

    var MAX = 4;            /* これ以上は粗が出るだけなので伸ばさない */
    var page = 0;           /* いま見ている見開き */
    var scale = 1, tx = 0, ty = 0;
    var pointers = new Map();
    var startDist = 0, startScale = 1, startMid = null;
    var dragFrom = null, dragged = false;
    var wheelStop = 0;      /* ホイールと二度叩きの、動きの終わりを待つ */

    /* 指が触れている間は、見開きを別の層に預けたまま動かす。
       指にはよく付いてくるが、層に預けた絵は一度描いたものを
       引き伸ばして貼るため、拡大するほど文字がにじむ。
       手が離れたら層から降ろし、いまの倍率で描き直させる。
       読んでいる間はこちらの見え方になる。 */
    function draw(animate, live) {
      /* 見開きは画面いっぱいの大きな面なので、押しても急には動かない */
      track.style.transition = animate ? 'transform .46s var(--ease-carry)' : 'none';
      track.style.transform =
        'translate3d(' + (-page * 100) + '%,0,0)';
      var pg = pages[page];
      pg.style.transition = animate ? 'transform .28s var(--ease-rise)' : 'none';
      pg.style.transform =
        (live ? 'translate3d(' + tx + 'px,' + ty + 'px,0)'
              : 'translate(' + tx + 'px,' + ty + 'px)') +
        ' scale(' + scale + ')';
      stage.classList.toggle('is-zoomed', scale > 1.02);
      now.textContent = page + 1;
      prev.disabled = page === 0;
      next.disabled = page === pages.length - 1;
    }

    /* 拡大したまま端が浮かないよう、寄せ幅を制限する */
    function clamp() {
      var r = stage.getBoundingClientRect();
      var img = pages[page].querySelector('img');
      var ir = img.getBoundingClientRect();
      var w = (ir.width * scale - r.width) / 2;
      var h = (ir.height * scale - r.height) / 2;
      tx = Math.max(-Math.max(w, 0), Math.min(Math.max(w, 0), tx));
      ty = Math.max(-Math.max(h, 0), Math.min(Math.max(h, 0), ty));
    }

    function reset() { scale = 1; tx = 0; ty = 0; }

    function go(d) {
      var n = page + d;
      if (n < 0 || n >= pages.length) return;
      pages[page].style.transform = '';
      page = n; reset(); draw(true);
    }

    function mid() {
      var a = Array.from(pointers.values());
      return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
    }
    function dist() {
      var a = Array.from(pointers.values());
      return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
    }

    stage.addEventListener('pointerdown', function (e) {
      stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        startDist = dist(); startScale = scale; startMid = mid();
      } else {
        dragFrom = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
        dragged = false;
      }
      if (hint) hint.classList.add('is-gone');
    });

    stage.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {           /* つまんで拡大 */
        var k = dist() / (startDist || 1);
        scale = Math.max(1, Math.min(MAX, startScale * k));
        var m = mid();
        tx += m.x - startMid.x; ty += m.y - startMid.y;
        startMid = m;
        clamp(); draw(false, true);
        return;
      }
      if (!dragFrom) return;
      var dx = e.clientX - dragFrom.x, dy = e.clientY - dragFrom.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) dragged = true;
      if (scale > 1.02) {                  /* 拡大中は中を動かす */
        tx = dragFrom.tx + dx; ty = dragFrom.ty + dy;
        clamp(); draw(false, true);
      } else {                             /* 等倍のときは指に付いてくる */
        track.style.transition = 'none';
        track.style.transform =
          'translate3d(calc(' + (-page * 100) + '% + ' + dx + 'px),0,0)';
      }
    });

    function release(e) {
      if (!pointers.has(e.pointerId)) return;
      var wasPinch = pointers.size === 2;
      pointers.delete(e.pointerId);
      if (wasPinch) { startDist = 0; if (pointers.size === 0) draw(false); return; }

      if (dragFrom && scale <= 1.02) {
        var dx = e.clientX - dragFrom.x;
        var w = stage.getBoundingClientRect().width;
        if (Math.abs(dx) > Math.min(90, w * 0.16)) go(dx < 0 ? 1 : -1);
        else draw(true);
      }
      dragFrom = null;
      if (pointers.size === 0 && scale > 1.02) draw(false);
    }
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);

    /* 二本指のない環境（パソコン）でも拡大できるように */
    stage.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
      e.preventDefault();
      scale = Math.max(1, Math.min(MAX, scale * (e.deltaY < 0 ? 1.12 : 0.89)));
      if (scale <= 1.02) { tx = 0; ty = 0; }
      clamp(); draw(false, true);
      window.clearTimeout(wheelStop);
      wheelStop = window.setTimeout(function () { draw(false); }, 180);
      if (hint) hint.classList.add('is-gone');
    }, { passive: false });

    stage.addEventListener('dblclick', function () {
      scale = scale > 1.02 ? 1 : 2.2;
      if (scale === 1) { tx = 0; ty = 0; }
      clamp(); draw(true, true);
      window.clearTimeout(wheelStop);
      wheelStop = window.setTimeout(function () { draw(false); }, 260);
    });

    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });

    function open() {
      page = 0; reset();
      root.hidden = false;
      if (hint) hint.classList.remove('is-gone');
      draw(false);
      window.requestAnimationFrame(function () { root.classList.add('is-open'); });
      document.body.classList.add('peek-open');
      root.querySelector('.peek__close').focus({ preventScroll: true, focusVisible: byKey });
      window.setTimeout(function () { if (hint) hint.classList.add('is-gone'); }, 3200);
    }
    /* quiet … 焦点を動かさない（戻る操作で、下の商品詳細ごと閉じるとき） */
    function close(quiet) {
      if (root.hidden) return;
      root.classList.remove('is-open');
      /* 下に商品詳細が開いているあいだは、後ろの棚は止めたまま */
      if (quiet === true || !above(['item', 'doc', 'cart', 'menu'])) {
        document.body.classList.remove('peek-open');
      }
      window.setTimeout(function () {
        root.hidden = true;
        pages[page].style.transform = '';
        /* 閉じたら商品詳細の「試し読み」へ戻す。棚まで戻してしまわない */
        if (quiet === true) return;
        var act = document.querySelector('#item:not([hidden]) .item__act--read');
        if (act) act.focus({ preventScroll: true, focusVisible: byKey });
      }, reduced.matches ? 0 : 300);
    }

    /* 試し読みは、商品詳細の「試し読み」から開く */
    document.addEventListener('click', function (e) {
      if (e.target.closest('.item__act--read')) { open(); return; }
      if (e.target.closest('[data-peek-close]')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (root.hidden) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    }, true);

    return { close: close };
  }

  /* --- 商品詳細 ---------------------------------------------
     Shopify では商品ごとに自動で作られる画面（別のページ）。
     棚で本を引き出し、引き出した本をもう一度タップすると開く。平置きの本はタップするとすぐに開く。
     「棚にもどる」（上と下の二か所）で、開く前と同じ位置の棚にもどる。
     開くたびに履歴を1つ積む。ブラウザの戻るや、スマートフォンの戻る操作でも
     棚にもどる（本物の商品ページは別の URL なので、戻る操作で棚にもどる。それと同じ）。
     本を引き出しただけ（1回目）では、履歴は積まない。 */
  function item(reader) {
    var root = document.getElementById('item');
    var raw = document.getElementById('book-data');
    if (!root || !raw) return null;
    var BOOKS = JSON.parse(raw.textContent);
    var body = root.querySelector('.item__body');
    var key = null;
    var from = null;       /* 開いた棚の本。キーボードで閉じたら、焦点をここへ返す */
    var y = 0;             /* 開いたときの画面の位置。閉じたらここにもどす */
    var closing = false, hideTimer = 0;
    var popping = false;   /* こちらで履歴を戻したときの popstate。もう閉じてあるので何もしない */
    var openedAt = 0;      /* 開いた時刻 */
    var GUARD = 450;       /* 開いてすぐのタップは受けない */
    var hooks = [];        /* 開いたときに知らせる先（カートが「カートに入れる」の言葉を合わせる） */

    function set(sel, txt) { root.querySelector(sel).textContent = txt; }

    /* 棚にもどる位置は、こちらで戻す（開いたときの位置 y）。ブラウザにも戻させると、
       住所欄に売り場の印（「棚をのぞく」で付く #theme-1 など）があるとき、戻る操作で
       開く前の位置ではなく、その看板まで跳んでしまう。
       ブラウザの位置の戻し方は履歴ごとに持つので、履歴を積む前に棚の履歴で止め、
       積んだ商品詳細の履歴ではすぐ元に戻し（止めたのが引き継がれるため）、
       棚の履歴へ戻ってきたら棚の履歴も元に戻す。止めたままだと、読み込み直したとき
       （商品詳細を開いたままの読み込み直しも）に位置が先頭へ戻ってしまう */
    function own(on) {
      try {
        if ('scrollRestoration' in window.history) window.history.scrollRestoration = on ? 'manual' : 'auto';
      } catch (err) { /* 履歴を使えない環境 */ }
    }

    function fill(b) {
      var img = root.querySelector('.item__img');
      img.src = b.cover; img.alt = b.title + ' の表紙';
      set('.item__title', b.title);
      set('.item__author', b.author);
      root.querySelector('.item__price').innerHTML =
        b.price.toLocaleString('ja-JP') + '円<span>税込</span>';
      root.querySelector('.item__desc').innerHTML =
        b.desc.map(function (t) { return '<p>' + t + '</p>'; }).join('');
      set('.item__s-title', b.title);
      set('.item__s-author', b.author);
      set('.item__s-pub', b.pub);
      set('.item__s-kata', b.kata);
      set('.item__s-pages', b.pages + 'ページ');
      set('.item__s-price', b.price.toLocaleString('ja-JP') + '円（税込）');
    }

    /* again … 履歴をたどって開き直すとき（進む操作、読み込み直したとき）。履歴は積まない */
    function open(k, el, again) {
      var b = BOOKS[k];
      if (!b) return;
      window.clearTimeout(hideTimer);
      if (root.hidden || closing) y = window.pageYOffset;
      closing = false; popping = false;
      key = k;
      if (el) from = el;
      fill(b);
      hooks.forEach(function (fn) { fn(k); });
      openedAt = Date.now();
      root.hidden = false;
      body.scrollTop = 0;
      window.requestAnimationFrame(function () { root.classList.add('is-open'); });
      document.body.classList.add('peek-open');
      root.querySelector('.item__back').focus({ preventScroll: true, focusVisible: byKey });
      if (!again) {
        own(true);
        try { window.history.pushState({ item: k }, ''); } catch (err) { /* 履歴を使えない環境 */ }
        own(false);
      }
    }

    /* 見た目を閉じる。棚は開く前と同じ位置のまま */
    function hide() {
      if (root.hidden || closing) return false;
      closing = true;
      root.classList.remove('is-open');
      document.body.classList.remove('peek-open');
      if (Math.abs(window.pageYOffset - y) > 1) window.scrollTo(0, y);
      var back = from;
      hideTimer = window.setTimeout(function () {
        root.hidden = true;
        closing = false;
        key = null;
        settleFocus(back, root);
      }, reduced.matches ? 0 : 300);
      return true;
    }

    /* 「棚にもどる」。積んだ履歴も1つ戻しておく（戻る操作と同じ道を通す） */
    function close() {
      if (!hide()) return;
      var st = window.history.state;
      if (st && st.item) {
        popping = true;
        window.history.back();
      }
    }

    window.addEventListener('popstate', function (e) {
      var st = e.state;
      /* 棚の履歴へ戻ってきた。ブラウザの位置の戻し方を元に戻すのは、戻す処理
         （popstate のすぐあと）が済んでから */
      if (!(st && st.item)) window.setTimeout(function () { own(false); }, 0);
      if (popping) { popping = false; return; }
      /* 進む操作で商品詳細の履歴へ来たときは、開き直す */
      if (st && st.item && BOOKS[st.item]) {
        if (root.hidden || closing) open(st.item, null, true);
        return;
      }
      /* 戻る操作。上に試し読みが重なっていれば、それもいっしょに閉じる */
      if (!root.hidden && !closing) {
        if (reader) reader.close(true);
        hide();
      }
    });

    /* 開いてすぐのタップは受けない。引き出した本や平置きの本をすばやく二度たたいたとき、
       2回目がそのまま「カートに入れる」「試し読み」「棚にもどる」に当たらないように。
       カートや試し読みはページ全体で click を受けるので、それより先（捕まえる段階）で止める */
    root.addEventListener('click', function (e) {
      if (Date.now() - openedAt < GUARD) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-item-close]')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !root.hidden && !closing &&
          !above(['peek', 'cart', 'doc'])) { e.stopPropagation(); close(); }
    }, true);

    /* 読み込み直したときに、商品詳細の履歴にいたら、商品詳細を開き直す */
    var st0 = window.history.state;
    if (st0 && st0.item && BOOKS[st0.item]) open(st0.item, null, true);

    return {
      open: open,
      close: close,
      shown: function () { return !root.hidden && !closing; },
      key: function () { return root.hidden || closing ? null : key; },
      onOpen: function (fn) { hooks.push(fn); }
    };
  }

  /* --- 手応えの表示 ----------------------------------------- */
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    window.requestAnimationFrame(function () { el.classList.add('is-on'); });
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      el.classList.remove('is-on');
      window.setTimeout(function () { el.hidden = true; }, 300);
    }, 2200);
  }

  /* --- 固定ページ -------------------------------------------
     要件定義書 2-7 のページ構成。フッターの導線から開く。 */
  function docs() {
    var root = document.getElementById('doc');
    if (!root) return;
    var body = root.querySelector('.doc__body');

    function open(key) {
      var found = false;
      root.querySelectorAll('.doc__page').forEach(function (pg) {
        var on = pg.getAttribute('data-page') === key;
        pg.hidden = !on;
        if (on) found = true;
      });
      if (!found) return;
      root.hidden = false;
      body.scrollTop = 0;
      window.requestAnimationFrame(function () { root.classList.add('is-open'); });
      document.body.classList.add('peek-open');
      root.querySelector('.doc__back').focus({ preventScroll: true });
    }
    function close() {
      root.classList.remove('is-open');
      document.body.classList.remove('peek-open');
      window.setTimeout(function () { root.hidden = true; },
        reduced.matches ? 0 : 300);
    }

    document.addEventListener('click', function (e) {
      var link = e.target.closest('[data-doc]');
      if (link) { e.preventDefault(); open(link.getAttribute('data-doc')); return; }
      if (e.target.closest('[data-doc-close]')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !root.hidden && !above(['peek', 'cart'])) {
        e.stopPropagation(); close();
      }
    }, true);
  }

  /* --- カート -----------------------------------------------
     決済と配送の入力は Shopify 標準（要件定義書 2-6）。
     ここは、そこへ渡るまでの見え方をつくる。
     商品詳細からも、棚へもどらずにカートを見て購入へ進める（9/30 のご依頼）。
     商品詳細の右上に上の帯と同じカートを置き、「カートに入れる」は入れたあと「カートを見る」に変える。
     カートに入っている本の商品詳細を開いたときも、はじめから「カートを見る」。
     カートは商品詳細の上に開き、閉じると商品詳細にもどる。 */
  function cart(page) {
    var root = document.getElementById('cart');
    var raw = document.getElementById('book-data');
    if (!root || !raw) return;
    var BOOKS = JSON.parse(raw.textContent);
    var list = document.getElementById('cart-list');
    var empty = document.getElementById('cart-empty');
    var sub = document.getElementById('cart-sub');
    var go = document.getElementById('cart-go');
    var badge = document.getElementById('cart-n');
    var badge2 = document.getElementById('item-cart-n');
    var buy = document.querySelector('.item__act--buy');
    var items = {};        /* key -> 冊数 */
    var addedAt = 0;       /* 「カートに入れる」を押した時刻 */
    var AGAIN = 400;       /* 入れてすぐのタップでは、カートを開かない（二度たたきの2回目） */
    var opener = null;     /* カートを開いたボタン。キーボードで閉じたら、焦点をここへ返す */

    function count() {
      var n = 0;
      for (var k in items) n += items[k];
      return n;
    }
    function yen(v) { return v.toLocaleString('ja-JP') + '円'; }

    /* 商品詳細の「カートに入れる」を、開いている本がカートに入っているかに合わせる */
    function sync(k) {
      if (!buy) return;
      if (k === undefined) k = page ? page.key() : null;
      var has = !!(k && items[k]);
      var txt = has ? 'カートを見る' : 'カートに入れる';
      if (buy.textContent !== txt) buy.textContent = txt;
      buy.classList.toggle('is-in', has);
    }

    function draw() {
      var n = count();
      /* 数は、ボタンの名前にも入れる。ボタンの名前があると、読み上げは中の数を読まない */
      [badge, badge2].forEach(function (e) {
        if (!e) return;
        e.textContent = n;
        e.hidden = n === 0;
        e.parentNode.setAttribute('aria-label', n ? 'カートを見る（' + n + '冊）' : 'カートを見る');
      });
      empty.hidden = n > 0;
      go.disabled = n === 0;

      var total = 0, html = '';
      for (var k in items) {
        var b = BOOKS[k], q = items[k];
        total += b.price * q;
        html +=
          '<li class="cart__row" data-key="' + k + '">' +
            '<div class="cart__thumb"><img src="' + b.cover + '" alt=""></div>' +
            '<div class="cart__info">' +
              '<p class="cart__name">' + b.title + '</p>' +
              '<p class="cart__meta">' + b.pub + '／' + yen(b.price) + '（税込）</p>' +
              '<div class="cart__qty">' +
                '<button type="button" data-q="-1" aria-label="ひとつ減らす">−</button>' +
                '<span>' + q + '</span>' +
                '<button type="button" data-q="1" aria-label="ひとつ増やす">＋</button>' +
                '<button type="button" class="cart__del" data-del>取り消す</button>' +
              '</div>' +
            '</div>' +
          '</li>';
      }
      list.innerHTML = html;
      sub.textContent = yen(total);
      sync();
    }

    function add(key) {
      if (!BOOKS[key]) return;
      items[key] = (items[key] || 0) + 1;
      draw();
      toast('「' + BOOKS[key].title + '」をカートに入れました');
    }

    function open(from) {
      opener = from || null;
      root.hidden = false;
      window.requestAnimationFrame(function () { root.classList.add('is-open'); });
      document.body.classList.add('peek-open');
      root.querySelector('.cart__close').focus({ preventScroll: true });
    }
    function close() {
      if (root.hidden) return;
      root.classList.remove('is-open');
      /* 商品詳細の上で開いていたときは、後ろの棚は止めたまま（商品詳細にもどる） */
      if (!above(['item', 'doc', 'menu'])) document.body.classList.remove('peek-open');
      var back = opener;
      opener = null;
      window.setTimeout(function () {
        root.hidden = true;
        settleFocus(back, root);
      }, reduced.matches ? 0 : 320);
    }

    /* 「カートに入れる」は商品詳細にある。入れるのは、商品詳細に開いている本。
       入れたあとは「カートを見る」になり、押すとカートが開く */
    document.addEventListener('click', function (e) {
      var act = e.target.closest('.item__act--buy');
      if (act) {
        var k = page ? page.key() : null;
        if (!k) return;
        if (!items[k]) { add(k); addedAt = Date.now(); }
        else if (Date.now() - addedAt > AGAIN) open(act);
        return;
      }
      var btn = e.target.closest('#cart-open, #item-cart');
      if (btn) { open(btn); return; }
      if (e.target.closest('[data-cart-close]')) { close(); return; }

      var row = e.target.closest('.cart__row');
      if (!row) return;
      var key = row.getAttribute('data-key');
      if (e.target.closest('[data-del]')) { delete items[key]; draw(); return; }
      var q = e.target.closest('[data-q]');
      if (q) {
        items[key] += parseInt(q.getAttribute('data-q'), 10);
        if (items[key] < 1) delete items[key];
        draw();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !root.hidden && !above(['peek'])) {
        e.stopPropagation(); close();
      }
    }, true);
    /* 戻る操作で商品詳細が閉じたら、その上に開いていたカートもいっしょに閉じる（試し読みと同じ）。
       閉じないと、棚の上にカートだけが残り、後ろの棚も止まらずに動く。
       商品詳細の popstate が先に動く（先に登録してある）ので、ここでは閉じたあとの様子を見る */
    window.addEventListener('popstate', function () {
      if (!root.hidden && !(page && page.shown())) close();
    });

    go.addEventListener('click', function () {
      toast('この先はShopifyの購入手続きの画面へ進みます');
    });

    if (page) page.onOpen(sync);
    draw();
  }

  /* --- 上の帯のメニュー -------------------------------------
     固定ページはフッターにもあるが、棚の続く画面では下まで遠い。
     売り場の一覧は本文から拾うので、売り場が増えても直さずに済む。 */
  function menu() {
    var root = document.getElementById('menu');
    if (!root) return;
    var list = document.getElementById('menu-markets');

    var html = '';
    document.querySelectorAll('.market__sign').forEach(function (h, i) {
      var id = h.id || ('theme-' + (i + 1));
      h.id = id;
      html += '<li><a href="#' + id + '" data-goto="' + id + '">' +
              h.textContent + '</a></li>';
    });
    list.innerHTML = html;

    function open() {
      root.hidden = false;
      window.requestAnimationFrame(function () { root.classList.add('is-open'); });
      document.body.classList.add('peek-open');
      root.querySelector('.menu__close').focus({ preventScroll: true });
    }
    function close() {
      root.classList.remove('is-open');
      /* ここから固定ページを開いたときは、後ろの棚を止めたままにする */
      if (!above(['peek', 'cart', 'doc', 'item'])) {
        document.body.classList.remove('peek-open');
      }
      window.setTimeout(function () { root.hidden = true; },
        reduced.matches ? 0 : 320);
    }

    document.addEventListener('click', function (e) {
      if (e.target.closest('#menu-open')) { open(); return; }
      if (e.target.closest('[data-menu-close]')) { close(); return; }

      var go = e.target.closest('[data-goto]');
      if (go) {
        e.preventDefault();
        var t = document.getElementById(go.getAttribute('data-goto'));
        var sec = t && t.closest('.market');
        close();
        if (sec) {
          /* 売り場は見えるときに 18px 上へ動く。
             先に現しておかないと、寄せた先がその分ずれる */
          /* 引き出しが引き込むのを待たない。戸が閉まりながら景色が動くほうが、
             ひと続きの動作に見える。位置は変形を含めない値で取るので、
             売り場が現れる途中でも寄せた先はずれない。 */
          sec.classList.add('is-in');
          glide(sec);
        }
        return;
      }
      /* 固定ページはメニューからも開く。重ねずに、こちらを閉じてから */
      if (e.target.closest('#menu [data-doc]') && !root.hidden) close();

      /* 探しやすさは、含めるかどうかをご検討いただいている段階 */
      if (e.target.closest('.topbar__search')) {
        toast('本をさがす機能は、ご検討中の項目です');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !root.hidden &&
          !above(['peek', 'cart', 'doc', 'item'])) {
        e.stopPropagation(); close();
      }
    }, true);
  }

  /* --- 画面の送り -------------------------------------------
     節の頭へ一瞬で飛ぶと、読み手は自分がどこへ来たのか分からない。
     距離に応じた時間をかけ、止まった状態から動き出して、
     止まった状態へ戻す。動きを減らす設定では、これまでどおり即座に移る。 */

  /* 位置は変形を含めない値で取る。現れる途中の売り場は
     18px ぶん下に置かれているので、見た目の位置で測ると
     現れ終わったあとに寄せた先がずれる。 */
  function layoutTop(el) {
    var y = 0;
    while (el) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  }

  /* いま走っている送りの番号。新しい送りが始まったら古いほうは降りる */
  var gliding = 0;
  /* 上の帯の出し入れ。topbar() が作り、送りのあいだはこちらが決める */
  var bar = null;

  function glide(target) {
    var root = document.documentElement;
    /* 売り場へ寄せるときは、看板の列（.market__head）を基準にする。
       売り場の頭には帯のぶんの余白があり、看板の文字は列の中ほどにあるため */
    var mark = target.classList.contains('market')
      ? (target.querySelector('.market__head') || target)
      : (target.closest('.market__head') || target);
    var sign = mark.classList.contains('market__head');
    /* 個別に譲りたい要素があれば scroll-margin-top で上に空けられる */
    var margin = parseFloat(window.getComputedStyle(mark).scrollMarginTop) || 0;
    var max = Math.max(0, root.scrollHeight - window.innerHeight);
    var from = window.pageYOffset;
    var top = layoutTop(mark);
    /* 下へ送るときは、帯を引っ込めながら送る。看板の列は画面の上端に来る
       （帯のぶん下で止めると、引っ込めて空けた高さを棚と平台が使えない）。
       上へ送るときは帯が出てくるので、看板の列は帯のすぐ下に、ほかは
       html の scroll-padding-top（帯の高さと少しの間）だけ手前で止める */
    var to = Math.max(0, Math.min(max, top - margin));
    var down = to >= from - 1;
    /* 帯の出し入れを先に決める。帯を引っ込めているあいだは scroll-padding-top も
       小さくしてあるので、上へ送るときは帯を出してから間合いを読む */
    if (bar) bar.steer(down, to);
    if (!down) {
      var gap = sign && bar ? bar.height()
        : parseFloat(window.getComputedStyle(root).scrollPaddingTop) || 0;
      to = Math.max(0, Math.min(max, top - Math.max(gap, margin)));
    }
    var dist = to - from;
    /* 毎コマこちらが動かすあいだ、様式側の滑らかな送りが入ると二重になる。
       動かしているあいだだけ外し、終わったら戻す */
    root.style.scrollBehavior = 'auto';
    if (reduced.matches || Math.abs(dist) < 2) {
      window.scrollTo(0, to);
      root.style.scrollBehavior = '';
      if (bar) bar.release();
      return;
    }
    /* 遠いほど長く。ただし待たされないところで頭を打つ */
    var ms = Math.min(1100, 400 + Math.abs(dist) * 0.3);
    var id = ++gliding;
    /* 送り終わったら、帯の出し入れを読み手の送りに返す */
    function end() { gliding++; root.style.scrollBehavior = ''; if (bar) bar.release(); }
    /* 送っているあいだに読み手が指や輪を動かしたら、そちらを優先する。
       途中で引き戻されるのは、動かないより気持ちが悪い */
    function give() { if (id === gliding) end(); }
    window.addEventListener('wheel', give, { passive: true, once: true });
    window.addEventListener('touchstart', give, { passive: true, once: true });
    var t0 = 0;
    (function step(now) {
      if (id !== gliding) return;
      if (!t0) t0 = now;
      var k = Math.min(1, (now - t0) / ms);
      /* 両端で速さが０、途中がいちばん速い。歩き出して立ち止まる調子 */
      var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      window.scrollTo(0, from + dist * e);
      if (k < 1) window.requestAnimationFrame(step);
      else end();
    })(0);
  }

  /* 節の頭への案内は、すべてここを通す。
     行き先を持たない href="#" は対象にしない（先頭へ飛んでしまうため）。 */
  function anchors() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a || a.hasAttribute('data-goto') || a.hasAttribute('data-doc')) return;
      var id = a.getAttribute('href').slice(1);
      if (!id) return;
      var t = document.getElementById(id);
      if (!t) return;
      e.preventDefault();
      /* 住所欄は行き先に合わせておく。履歴は増やさない */
      if (window.history.replaceState) window.history.replaceState(null, '', '#' + id);
      glide(t);
    });
  }

  /* --- 上の帯 -----------------------------------------------
     帯は固定してあるので、森を抜けた先では木の壁や棚の上に重なる。
     明るい面に文字が乗ると読めないため、そこから地を敷く。
     読めるかどうかの話なので、動きを減らす設定でも動かす。

     店内を下へ読み進めるあいだは、帯を上へ引っ込める。棚と平台を一画面に収めたいが、
     帯の高さ（標準的な iPhone で 84px ほど）がちょうどその足りない分にあたるため（9/29 のご依頼）。
     少しでも上へ戻せば、すぐに出す。
     出したままにするのは、森が見えているあいだ（ページの先頭を含む）、
     覆い（メニュー・カート・商品詳細・試し読み・固定ページ・引き出した本の層）を開いているあいだ、
     キーボードで帯の中を操作しているあいだ。
     覆いを閉じたあとも出したままにしておき、次に下へ送ったときに引っ込める。
     ただし引き出した本の層だけは、棚にもどったら開く前の出し入れに戻す。本を見て棚に
     もどっただけで、上へ戻してもいないのに帯が看板の列にかぶるのを防ぐ
     （商品詳細へ進んだときは、商品詳細の決まりに従う）。
     出し入れは画面の大きさによらない（スマートフォンもパソコンも同じ）。 */
  function topbar() {
    var el = document.querySelector('.topbar');
    var hero = document.querySelector('.hero');
    if (!el || !hero) return;
    var layer = document.getElementById('focus');

    var h = 0;
    /* 寄せ先を帯の下から始めるため、実寸を CSS へ渡す。
       切り欠きのある端末は余白が増えるので、決め打ちにできない。
       引っ込めているあいだも高さは変わらない（ずらしているだけなので） */
    function measure() {
      h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--bar', h.toFixed(1) + 'px');
      /* 縦棒の幅。覆いを開いたときに帯だけ広がるのを止める用。
         止めているあいだは縦棒が無いので、測り直さない */
      if (!document.body.classList.contains('peek-open')) {
        document.documentElement.style.setProperty('--gutter',
          (window.innerWidth - document.documentElement.clientWidth) + 'px');
      }
    }

    /* 数 px の揺れ（指を離したあとの小さな戻り、URL バーの出入り）では動かさない。
       同じ向きに続けて送った量を足していき、下へ DOWN を超えたら引っ込め、
       上へ UP を超えたら出す。上へは小さく、戻したいと思った指にすぐ応える */
    var DOWN = 12, UP = 8;
    var away = false;       /* 引っ込めている */
    var run = 0;            /* 同じ向きに続けて送った量（下が正） */
    var lastY = 0;
    var steering = false;   /* 画面の送り（glide）が出し入れを決めているあいだ */

    /* いまの位置。iOS の端での跳ね返り（先頭より上・末尾より下）は、端に丸めて数えない。
       末尾で跳ね返るたびに帯が出てくるのを防ぐ */
    function where() {
      var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      return Math.max(0, Math.min(max, window.pageYOffset));
    }
    function put(off) {
      if (away === off) return;
      away = off;
      el.classList.toggle('is-away', off);
      /* 帯の下に空ける間合い（styles/layout.css の scroll-padding-top）も、引っ込めているあいだは
         小さくする。帯の無いところで帯のぶんを空けようとして、タブ送りで画面が動かないように */
      document.documentElement.classList.toggle('bar-away', off);
    }
    /* 滑らせずに、その場で出し入れする */
    function snap(off) {
      if (away === off) return;
      el.classList.add('is-still');
      put(off);
      void el.offsetWidth;    /* 動かないまま位置を決めてから、滑らせる設定に戻す */
      el.classList.remove('is-still');
    }
    /* 出したままにしておくとき */
    function held() {
      /* 覆い。どれも開くと body に peek-open を付ける（後ろの棚を止めるため） */
      if (document.body.classList.contains('peek-open')) return true;
      /* キーボードで帯の中を操作している。指やマウスで押したあとに焦点が残っていても
         数えない（残ったままだと、下へ送っても引っ込まなくなる） */
      var a = document.activeElement;
      return byKey && !!a && a !== document.body && el.contains(a);
    }

    /* 引き出した本の層。peek-open を付けないので、層そのものを見る（棚へ戻る途中は数えない）。
       層は帯ごとぼかして覆う（styles/shelf.css の .focus）ので、開いても帯の出し入れは変えない。
       帯を出すと、ぼかしの向こうで帯が現れては消え、本を見ている目の端がちらつく。
       棚にもどったときは、開く前の出し入れのまま */
    var before = null;      /* 層を開く前に引っ込めていたか。層を開いていないときは null */
    function layerUp() {
      return !!layer && !layer.hidden && !layer.classList.contains('is-leaving');
    }
    function onLayer() {
      if (layerUp()) {
        if (before === null) before = away;
        return;
      }
      if (before === null) return;
      var was = before;
      before = null;
      run = 0; lastY = where();
      /* 商品詳細へ進んだときは、そちらの決まり（開いているあいだも閉じたあとも出す）に従う */
      if (held()) { put(false); return; }
      snap(was && hero.getBoundingClientRect().bottom <= 0);
    }

    /* キーボードで焦点を移すと、焦点の先を見せるためにブラウザが画面を送ることがある。
       その送りでは出し入れしない。上へ戻したと数えて帯を出すと、焦点の先に帯がかぶる */
    var moved = 0;
    document.addEventListener('focusin', function (e) {
      if (byKey && !el.contains(e.target)) moved = Date.now();
    }, true);

    var ticking = false;
    function apply() {
      ticking = false;
      var edge = hero.getBoundingClientRect().bottom;
      /* 森が帯の下から抜けたら、地を敷く */
      el.classList.toggle('is-lit', edge <= h);
      var y = where(), dy = y - lastY;
      lastY = y;
      if (steering) return;
      /* 森がまだ画面に見えているうち（ページの先頭を含む）は、出したまま */
      if (edge > 0 || held()) { run = 0; put(false); return; }
      /* 引き出した本の層を開いているあいだは、層のほう（onLayer）が決める */
      if (layerUp()) { run = 0; return; }
      /* キーボードで焦点を移した拍子の送りでは、出し入れしない */
      if (Date.now() - moved < 120) { run = 0; return; }
      if (!dy) return;
      run = (dy > 0) === (run > 0) ? run + dy : dy;
      if (run > DOWN) put(true);
      else if (run < -UP) put(false);
    }
    function ask() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(apply);
    }

    measure();
    lastY = where();
    apply();
    window.addEventListener('scroll', ask, { passive: true });
    window.addEventListener('resize', function () {
      measure();
      /* URL バーの出入りで画面の高さが変わると、末尾の近くでは丸めた位置が動く。
         送った量には数えない */
      lastY = where();
      ask();
    }, { passive: true });

    /* 覆いが開いたら出す。開いても画面は動かない（後ろを止める）ので、開いたことを見て出す */
    if ('MutationObserver' in window) {
      var seen = new MutationObserver(function () {
        onLayer();
        if (!steering && held()) { run = 0; put(false); }
      });
      seen.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      if (layer) seen.observe(layer, { attributes: true, attributeFilter: ['hidden', 'class'] });
    }
    /* キーボードで帯に来たら出す。引っ込めたまま Shift+Tab で戻ってきても、
       どこに焦点があるかが見えるように */
    el.addEventListener('focusin', function () { run = 0; put(false); });

    bar = {
      height: function () { return h; },
      /* 画面の送り（glide）の始めに呼ぶ。下へ送る先で森が画面から出ているなら先に引っ込め、
         上へ送るなら出す。送り終わる（release）までは、向きで出し入れしない。
         送りの途中の揺れや、止まる間際の小さな戻りで、帯が出入りしないように */
      steer: function (down, to) {
        steering = true; run = 0;
        var edge = hero.getBoundingClientRect().bottom - (to - window.pageYOffset);
        put(down && edge <= 0 && !held());
      },
      release: function () { steering = false; run = 0; lastY = where(); }
    };
  }

  function boot() {
    modality();         /* ほかより先に。閉じたときの焦点の返し方がこれで決まる */
    anchors();          /* 動きの設定に関わらず必ず通す。設定次第で即座に移る */
    fitShelves();       /* 動きの設定に関わらず必ず行う */
    topbar();           /* 同上。読めるかどうかの話なので */
    var reader = peek();
    var page = item(reader);
    shelf(page);        /* 動きの設定に関わらず必ず通す。動きではなく機能なので */
    docs();
    cart(page);
    menu();
    start();
  }

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('load', fitShelves);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
