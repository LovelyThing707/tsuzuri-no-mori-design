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

  /* --- 本を手に取る ------------------------------------------
     棚の本をタップすると、その本が少し前に出てピントが合い、ほかの本はぼやける。
     背表紙は書名が読める大きさまで拡大し、横に書名と著者名を文字で添える（1回目）。
     拡大した本か、添えた書名をもう一度タップすると、商品詳細が開く（2回目）。
     それ以外のところをタップすると、棚にもどる。
     以前は指を離しただけで本が開き、途中で指が離れただけでも先の画面へ
     進んでしまっていた（國分様のご指摘）。先へ進むのは、拡大した本を
     もう一度タップしたときだけにする。
     平置きの本も同じ二段。表紙を起こして大きく見せ、書名は表紙の下に添える。
     マウスでは、指している本が少し出て書名の札が出る（何も開かない）。クリックで手に取る。
     キーボードでは Enter で手に取り、もう一度 Enter で商品詳細、Escape で棚にもどる。 */
  function shelf(page) {
    var root = document.getElementById('focus');
    var raw = document.getElementById('book-data');
    if (!root || !raw || !page) return;

    var BOOKS = JSON.parse(raw.textContent);
    var box = root.querySelector('.focus__book');
    var cap = root.querySelector('.focus__cap');
    var shut = root.querySelector('.focus__close');

    /* 拡大の決まり。縦と横に同じ倍率 s をかけ、実物どおりの比のまま大きくする。
       s = min(4, min(画面の高さ − 上下 24px, 680px) ÷ 棚の上での背表紙の高さ)
       文庫は書名の字が小さいので 4倍まで、背の高い絵本は画面に収まるところまで。
       写真を引き伸ばすのではなく、大きな --mm で描き直す（写真の細かさのまま描ける） */
    var EDGE = 24;        /* 画面の端から空ける */
    var TALL = 680;       /* 拡大した本の高さの上限 */
    var SMAX = 4;         /* 倍率の上限。これより大きくすると写真の粗が出る */
    var GAP = 16;         /* 本と、添える書名のあいだ */
    var GUARD = 450;      /* 開いてすぐのタップは受けない。二度たたきで先へ進まないように */
    var DRIFT = 12;       /* 手に取ったまま、これより画面を送ったら棚にもどる */
    var T_OPEN = 460, T_CLOSE = 260, T_FADE = 160;

    var src = null;       /* 手に取っている棚の本 */
    var key = null;
    var at = null;        /* 拡大した本の置き場所（閉じるときは、ここから棚へ戻す） */
    var since = 0;        /* 手に取った時刻 */
    var y0 = 0;           /* 手に取ったときの画面の位置 */
    var w0 = 0;           /* 手に取ったときの画面の幅 */
    var anim = null;
    var later = 0;

    /* ぼかしが重い端末（メモリの少ない端末）と、透け感を減らす設定では、暗くするだけにする */
    if ((navigator.deviceMemory && navigator.deviceMemory <= 2) ||
        window.matchMedia('(prefers-reduced-transparency: reduce)').matches) {
      root.classList.add('is-plain');
    }

    function css(name, d) {
      var v = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue(name));
      return isNaN(v) ? d : v;
    }

    /* 棚の上での本の姿。平置きの本は寝かせてあるので、起こしたときの大きさ
       （変形を含めない幅と高さ）と、足もと（手前の辺）の位置で表す */
    function slot(el) {
      var r = el.getBoundingClientRect();
      var flat = el.classList.contains('flat');
      var cs = window.getComputedStyle(el);
      return { flat: flat, cx: r.left + r.width / 2, bottom: r.bottom,
               w: flat ? parseFloat(cs.width) : r.width,
               h: flat ? parseFloat(cs.height) : r.height };
    }

    /* 拡大した本を、棚の上の姿に重ねる変形。軸は本の足もと（.focus__book の transform-origin）。
       平置きの本は、棚と同じ傾きと遠近で寝かせる。
       lift のときは、棚の中で少し持ち上げ、わずかに大きくした姿にする */
    function onShelf(sl, lift) {
      var dx = sl.cx - (at.L + at.W / 2), dy = sl.bottom - (at.T + at.H);
      var g = lift ? 1.06 : 1;
      var kx = sl.w / at.W * g, ky = sl.h / at.H * g;
      var t = 'translate(' + dx.toFixed(2) + 'px,' + (dy - (lift ? 10 : 0)).toFixed(2) + 'px) ' +
              'scale(' + kx.toFixed(4) + ',' + ky.toFixed(4) + ')';
      if (sl.flat) {
        var tilt = css('--flat-tilt', 54), persp = css('--flat-persp', 700);
        /* 縮めたぶん、遠近の強さも同じ比で縮める（棚の本と同じ見え方になる） */
        t += ' perspective(' + (persp / (sl.w / at.W)).toFixed(1) + 'px)' +
             ' rotateX(' + (lift ? tilt * 0.55 : tilt).toFixed(1) + 'deg)';
      }
      return t;
    }

    /* 置き場所を決める。本は棚の自分の列の近くに置き（画面の端から 24px より内側）、
       書名はゆとりのある側に添える。横に 120px 取れないほど太い本と、平置きの本は、
       書名を本の下に置く */
    function layout(el, b, sl) {
      var vw = root.clientWidth, vh = root.clientHeight;
      var room = Math.min(vh - 2 * EDGE, TALL);
      var node, W, H, s, capW, side;

      function measure() {
        var r = node.getBoundingClientRect();
        W = r.width; H = r.height;
      }
      function below() {
        capW = Math.min(300, vw - 2 * EDGE);
        cap.className = 'focus__cap is-below';
        cap.style.setProperty('--capw', capW + 'px');
        return cap.offsetHeight;
      }

      if (!sl.flat) {
        s = Math.min(SMAX, room / sl.h);
        node = document.createElement('div');
        node.className = 'spine';
        node.setAttribute('style', el.getAttribute('style') || '');
        node.style.setProperty('--mm', s + 'px');
        var im = el.querySelector('img');
        if (im) {
          im = im.cloneNode(false);
          im.loading = 'eager';
          node.appendChild(im);
        }
        box.appendChild(node);
        measure();
        capW = Math.min(260, vw - W - 2 * EDGE - GAP);
        side = capW >= 120;
      } else {
        node = document.createElement('img');
        node.className = 'focus__cover';
        node.alt = '';
        node.src = b.cover;
        box.appendChild(node);
        side = false;
      }

      var L, T, CL, CT, ch;
      if (side) {
        /* 本の左右で、ゆとりのある側に書名を置く */
        var right = (vw - (sl.cx + W / 2)) >= (sl.cx - W / 2);
        cap.className = 'focus__cap' + (right ? '' : ' is-left');
        cap.style.setProperty('--capw', capW + 'px');
        ch = cap.offsetHeight;
        L = right ? clamp(sl.cx - W / 2, EDGE, vw - EDGE - capW - GAP - W)
                  : clamp(sl.cx - W / 2, EDGE + capW + GAP, vw - EDGE - W);
        T = Math.max(EDGE, (vh - H) / 2);
        CL = right ? L + W + GAP : L - GAP - capW;
        CT = clamp(T + H / 2 - ch / 2, EDGE, vh - EDGE - ch);
      } else {
        ch = below();
        var fit = room - GAP - ch;
        if (!sl.flat) {
          /* 太い本。書名を下に置くぶん、倍率を下げて画面に収める */
          if (H > fit) {
            s = s * fit / H;
            node.style.setProperty('--mm', s + 'px');
            measure();
          }
        } else {
          /* 平置きの本。表紙を起こし、実物どおりの縦横比で、画面に収まる大きさにする */
          var ratio = b.h / b.w;
          W = Math.min(vw * 0.72, vw - 2 * EDGE, fit / ratio, SMAX * sl.w);
          H = W * ratio;
          s = W / sl.w;
        }
        /* 書名は本の真下、中心をそろえて置く。本が画面の端に近いときは、
           書名が画面に収まるところまで本のほうを内側へ寄せる（書名だけを寄せると、中心がずれる） */
        var half = Math.max(W, capW) / 2;
        var c = clamp(sl.cx, EDGE + half, vw - EDGE - half);
        L = c - W / 2;
        T = Math.max(EDGE, (vh - H - GAP - ch) / 2);
        CL = c - capW / 2;
        CT = T + H + GAP;
      }

      box.style.left = L + 'px'; box.style.top = T + 'px';
      box.style.width = W + 'px'; box.style.height = H + 'px';
      cap.style.left = CL + 'px'; cap.style.top = CT + 'px';
      /* かけた倍率を書いておく（tests/verify.js が拡大の決まりどおりかを読む） */
      root.setAttribute('data-scale', s.toFixed(3));
      return { L: L, T: T, W: W, H: H, s: s };
    }

    /* 1回目。本を手に取る */
    function open(el) {
      var k = el.getAttribute('data-book');
      var b = BOOKS[k];
      if (!b || page.shown()) return;
      if (src) done(true);
      hintDone();
      pick(null);

      src = el; key = k;
      root.querySelector('.focus__title').textContent = b.title;
      root.querySelector('.focus__author').textContent = b.author;
      box.setAttribute('aria-label', '「' + b.title + '」の商品ページを開く');
      box.innerHTML = '';
      root.classList.remove('is-open', 'is-leaving');
      root.classList.toggle('by-key', byKey);
      root.hidden = false;

      var sl = slot(el);
      at = layout(el, b, sl);
      el.classList.add('is-taken');
      since = Date.now();
      y0 = window.pageYOffset;
      w0 = root.clientWidth;

      if (reduced.matches) {
        /* 動きを減らす設定では、飛ばさずに短く浮かび上がらせるだけ */
        anim = root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T_FADE });
      } else {
        /* 棚の姿から始め、その場で少し持ち上がって大きくなり、手前の位置へ来る */
        anim = box.animate([
          { transform: onShelf(sl), offset: 0 },
          { transform: onShelf(sl, true), offset: 0.22 },
          { transform: 'none', offset: 1 }
        ], { duration: T_OPEN, easing: 'cubic-bezier(.30,.06,.18,1)' });
      }
      var a = anim;
      a.onfinish = function () { if (anim === a) anim = null; };
      /* 幕と書名は、本が動いているあいだに立ち上げる */
      window.requestAnimationFrame(function () {
        if (src === el && !root.classList.contains('is-leaving')) root.classList.add('is-open');
      });
      /* 指で手に取ったときも焦点は移す（読み上げが、手に取った本から読めるように）。
         そのときは焦点の枠を出さない（focusVisible）。枠が出ると、その先の商品詳細の
         「棚にもどる」にも枠が引き継がれる */
      box.focus({ preventScroll: true, focusVisible: byKey });
    }

    /* 棚にもどる。手に取った本は、棚の空いたところへ戻っていく */
    function close() {
      if (!src || root.classList.contains('is-leaving')) return;
      var el = src;
      root.classList.remove('is-open');
      root.classList.add('is-leaving');
      if (reduced.matches) {
        if (anim) anim.cancel();
        anim = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T_FADE * 0.75, fill: 'forwards' });
      } else {
        /* 開く途中で閉じたときは、いまの姿から戻す */
        var now = anim ? window.getComputedStyle(box).transform : 'none';
        if (anim) anim.cancel();
        /* 終わりで速さを落とし、棚の空いたところへ静かに収める（開くときと同じ曲線）。
           速さを増したまま着くと、最後に棚の本へ跳んだように見える */
        anim = box.animate([{ transform: now }, { transform: onShelf(slot(el)) }],
          { duration: T_CLOSE, easing: 'cubic-bezier(.30,.06,.18,1)', fill: 'forwards' });
      }
      anim.onfinish = function () { if (src === el) done(false); };
    }

    /* 片づける。keep のときは焦点を動かさない（商品詳細へ進んだとき、別の本を手に取るとき） */
    function done(keep) {
      var el = src;
      if (!el) return;
      window.clearTimeout(later);
      if (anim) { anim.cancel(); anim = null; }
      src = null; key = null; at = null;
      el.classList.remove('is-taken');
      if (!keep) settleFocus(el, root);
      root.hidden = true;
      root.classList.remove('is-open', 'is-leaving');
      root.removeAttribute('data-scale');
      box.innerHTML = '';
      box.removeAttribute('style');
    }

    /* 2回目。商品詳細を開く。手に取った本は、商品詳細が出きってから棚へ戻す
       （先に戻すと、商品詳細が現れるあいだ、後ろに元の棚が透けて見える） */
    function go() {
      if (!src || root.classList.contains('is-leaving')) return;
      var el = src;
      root.classList.add('is-leaving');
      page.open(key, el);
      later = window.setTimeout(function () { if (src === el) done(true); },
        reduced.matches ? 0 : 480);
    }

    /* 指を離した位置。指で触れる端末のブラウザは、ボタンの近くをたたくと、
       click をそのボタンに寄せて届ける。拡大した本のすぐ外（画面の隅の上の帯など）を
       たたいても商品詳細に進んでしまうので、どこをたたいたかは指を離した位置で決める */
    var lift = null;
    root.addEventListener('pointerup', function (e) {
      lift = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY, t: Date.now() } : null;
    });
    root.addEventListener('click', function (e) {
      if (!src || root.classList.contains('is-leaving')) return;
      /* 開いてすぐのタップは受けない。二度たたきの2回目や、
         指を離したあとに届く click が、そのまま商品詳細を開かないように */
      if (Date.now() - since < GUARD) return;
      var hit = e.target;
      if (lift && Date.now() - lift.t < 700) hit = document.elementFromPoint(lift.x, lift.y) || hit;
      lift = null;
      if (hit.closest('.focus__close')) { close(); return; }
      /* 先へ進むのは、拡大した本と、添えた文字（書名・著者名・「この本のページへ」）だけ。
         文字の横の空いたところは、ぼかした棚と同じく棚にもどる */
      if (hit.closest('.focus__book, .focus__title, .focus__author, .focus__go')) { go(); return; }
      /* それ以外（ぼかした棚、ほかの本、上の帯のあたり）は、棚にもどる */
      close();
    });
    document.addEventListener('keydown', function (e) {
      /* 商品詳細へ進むところ（is-leaving）では、もう焦点は商品詳細にある。Tab を横取りしない */
      if (!src || root.hidden || root.classList.contains('is-leaving')) return;
      root.classList.add('by-key');
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'Tab') {
        /* 焦点は、手に取った本と「棚にもどる」のあいだだけを回る */
        e.preventDefault();
        (document.activeElement === box ? shut : box).focus({ preventScroll: true });
      }
    }, true);
    /* 手に取ったまま画面を送ったら、棚にもどる。画面は止めない */
    window.addEventListener('scroll', function () {
      if (src && !root.classList.contains('is-leaving') &&
          Math.abs(window.pageYOffset - y0) > DRIFT) close();
    }, { passive: true });
    /* 画面の向きが変わったら、置き場所が合わなくなるので片づける。
       高さだけの変化（スマートフォンの URL バーの出入り）では閉じない */
    window.addEventListener('resize', function () {
      if (src && root.clientWidth !== w0) done(false);
    });
    /* 履歴をたどったとき（進む操作で商品詳細が開き直したときなど）は、手に取った本を片づける。
       商品詳細の popstate が先に動くので、商品詳細が開いていれば焦点はそちらに残す */
    window.addEventListener('popstate', function () {
      if (src) done(page.shown());
    });

    /* 狙いが外れたとき、いちばん近い本を拾う（マウス）。
       いちばん薄い本でも背は10px前後しかない。
       段の中で当たったなら、横の距離がいちばん近い本を手に取る。
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
       指を離すと、その本を手に取る（1回目と同じ。商品詳細へは進まない）。
       指を棚の上下へ外してから離せば、何もせずにやめられる。
       縦に動かしたときはページを送る（棚に touch-action:pan-y）。 */
    var tag = document.createElement('div');
    tag.className = 'pick-tag';
    tag.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tag);

    var picked = null;          /* いま札を出している本 */
    var touch = null;           /* なぞっている指 */
    var quietUntil = 0;         /* 指を離した直後に届く click を無視する */
    var OFF = 36;               /* 棚の上下にこれだけ外して離したら、手に取らない */

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
      /* 指を離したあとに届く click で、二度手に取らないように。
         手に取らずにやめたときも、あとから届く click で本を手に取らないように */
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

    /* --- 手に取れることを、一度だけ知らせる ----------------------
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
        hint.textContent = '本をタップすると、大きく表示されます';
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

    /* マウスのクリック（と、指で平置きの本をタップしたとき）。本を手に取る */
    document.addEventListener('click', function (e) {
      if (Date.now() < quietUntil) return;
      if (root.contains(e.target)) return;
      var hit = e.target.closest('.case .spine[data-book], .case .flat[data-book]') || nearest(e);
      if (hit) open(hit);
    });
    /* キーボード。Enter か Space で本を手に取る。
       ここで既定の動きを止めておく。止めないと、手に取った本（ボタン）に焦点が移ったあと、
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
     棚で本を手に取り、拡大した本をもう一度タップすると開く。
     「棚にもどる」（上と下の二か所）で、開く前と同じ位置の棚にもどる。
     開くたびに履歴を1つ積む。ブラウザの戻るや、スマートフォンの戻る操作でも
     棚にもどる（本物の商品ページは別の URL なので、戻る操作で棚にもどる。それと同じ）。
     本を手に取っただけ（1回目）では、履歴は積まない。 */
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

    function set(sel, txt) { root.querySelector(sel).textContent = txt; }

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
      openedAt = Date.now();
      root.hidden = false;
      body.scrollTop = 0;
      window.requestAnimationFrame(function () { root.classList.add('is-open'); });
      document.body.classList.add('peek-open');
      root.querySelector('.item__back').focus({ preventScroll: true, focusVisible: byKey });
      if (!again) {
        try { window.history.pushState({ item: k }, ''); } catch (err) { /* 履歴を使えない環境 */ }
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
      if (popping) { popping = false; return; }
      var st = e.state;
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

    /* 開いてすぐのタップは受けない。拡大した本をすばやく二度たたいたとき、
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
      key: function () { return root.hidden || closing ? null : key; }
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
     ここは、そこへ渡るまでの見え方をつくる。 */
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
    var items = {};        /* key -> 冊数 */

    function count() {
      var n = 0;
      for (var k in items) n += items[k];
      return n;
    }
    function yen(v) { return v.toLocaleString('ja-JP') + '円'; }

    function draw() {
      var n = count();
      badge.textContent = n;
      badge.hidden = n === 0;
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
    }

    function add(key) {
      if (!BOOKS[key]) return;
      items[key] = (items[key] || 0) + 1;
      draw();
      toast('「' + BOOKS[key].title + '」をカートに入れました');
    }

    function open() {
      root.hidden = false;
      window.requestAnimationFrame(function () { root.classList.add('is-open'); });
      document.body.classList.add('peek-open');
      root.querySelector('.cart__close').focus({ preventScroll: true });
    }
    function close() {
      root.classList.remove('is-open');
      document.body.classList.remove('peek-open');
      window.setTimeout(function () { root.hidden = true; },
        reduced.matches ? 0 : 320);
    }

    /* 「カートに入れる」は商品詳細にある。入れるのは、商品詳細に開いている本 */
    document.addEventListener('click', function (e) {
      if (e.target.closest('.item__act--buy')) {
        var k = page ? page.key() : null;
        if (k) add(k);
        return;
      }
      if (e.target.closest('#cart-open')) { open(); return; }
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

    go.addEventListener('click', function () {
      toast('この先はShopifyの購入手続きの画面へ進みます');
    });

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

  function glide(target) {
    var root = document.documentElement;
    /* 上に空ける量。帯の高さは html の scroll-padding-top が持ち、
       個別に譲りたい要素があれば scroll-margin-top で上書きできる */
    var gap = Math.max(
      parseFloat(window.getComputedStyle(root).scrollPaddingTop) || 0,
      parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0);
    var max = Math.max(0, root.scrollHeight - window.innerHeight);
    var from = window.pageYOffset;
    var to = Math.max(0, Math.min(max, layoutTop(target) - gap));
    var dist = to - from;
    /* 毎コマこちらが動かすあいだ、様式側の滑らかな送りが入ると二重になる。
       動かしているあいだだけ外し、終わったら戻す */
    root.style.scrollBehavior = 'auto';
    if (reduced.matches || Math.abs(dist) < 2) {
      window.scrollTo(0, to);
      root.style.scrollBehavior = '';
      return;
    }
    /* 遠いほど長く。ただし待たされないところで頭を打つ */
    var ms = Math.min(1100, 400 + Math.abs(dist) * 0.3);
    var id = ++gliding;
    /* 送っているあいだに読み手が指や輪を動かしたら、そちらを優先する。
       途中で引き戻されるのは、動かないより気持ちが悪い */
    function give() { if (id === gliding) { gliding++; root.style.scrollBehavior = ''; } }
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
      else { gliding++; root.style.scrollBehavior = ''; }
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
     読めるかどうかの話なので、動きを減らす設定でも動かす。 */
  function topbar() {
    var bar = document.querySelector('.topbar');
    var hero = document.querySelector('.hero');
    if (!bar || !hero) return;

    var h = 0;
    /* 寄せ先を帯の下から始めるため、実寸を CSS へ渡す。
       切り欠きのある端末は余白が増えるので、決め打ちにできない */
    function measure() {
      h = bar.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--bar', h.toFixed(1) + 'px');
      /* 縦棒の幅。覆いを開いたときに帯だけ広がるのを止める用。
         止めているあいだは縦棒が無いので、測り直さない */
      if (!document.body.classList.contains('peek-open')) {
        document.documentElement.style.setProperty('--gutter',
          (window.innerWidth - document.documentElement.clientWidth) + 'px');
      }
    }

    var ticking = false;
    function apply() {
      /* 森が帯の下から抜けたら、地を敷く */
      bar.classList.toggle('is-lit', hero.getBoundingClientRect().bottom <= h);
      ticking = false;
    }
    function ask() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(apply);
    }

    measure();
    apply();
    window.addEventListener('scroll', ask, { passive: true });
    window.addEventListener('resize', function () { measure(); ask(); }, { passive: true });
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
