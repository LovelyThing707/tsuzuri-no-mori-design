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

  /* --- 引き抜き ---------------------------------------------
     棚の本をタップすると、その本が棚から抜けて手前に出る。
     背表紙の位置から表紙の位置へ飛ばし、一続きの動きに見せる。 */
  function pullOut() {
    var root = document.getElementById('pull');
    var raw = document.getElementById('book-data');
    if (!root || !raw) return;

    var BOOKS = JSON.parse(raw.textContent);
    var panel = root.querySelector('.pull__panel');
    var cover = root.querySelector('.pull__cover');
    var last = null;      /* どの本から抜いたか。閉じるときに戻す */

    function fill(b) {
      cover.src = b.cover;
      cover.alt = b.title + ' の表紙';
      root.querySelector('.pull__title').textContent = b.title;
      root.querySelector('.pull__author').textContent = b.author;
      root.querySelector('.pull__lead').textContent = b.lead;
      root.querySelector('.pull__pub').textContent = b.pub;
      root.querySelector('.pull__form').textContent = b.kata + '／' + b.pages + 'ページ';
      root.querySelector('.pull__price').innerHTML =
        b.price.toLocaleString('ja-JP') + '円<span>税込</span>';
    }

    /* 棚の本から、表紙の位置へ飛ぶ影武者を作る */
    function fly(from, toRect, img, done) {
      var r = from.getBoundingClientRect();
      var el = document.createElement('div');
      el.className = 'pull-fly';
      el.style.left = r.left + 'px';
      el.style.top = r.top + 'px';
      el.style.width = r.width + 'px';
      el.style.height = r.height + 'px';
      el.style.backgroundImage = 'url("' + img + '")';
      document.body.appendChild(el);
      var dx = (toRect.left + toRect.width / 2) - (r.left + r.width / 2);
      var dy = (toRect.top + toRect.height / 2) - (r.top + r.height / 2);
      var end = 'translate(' + dx + 'px,' + dy + 'px) scale(' +
            (toRect.width / r.width) + ',' + (toRect.height / r.height) + ')';
      /* 棚の本は手で引き出される。弾き出されないよう、静止から動き出す。
         最後は表紙へ溶かす。差し替えが一瞬だと、そこで動きが切れて見える。 */
      el.animate([
        { transform: 'translate(0,0) scale(1,1)', opacity: 1, offset: 0 },
        { transform: end, opacity: 1, offset: 0.82 },
        { transform: end, opacity: 0, offset: 1 }
      ], { duration: 560, easing: 'cubic-bezier(.30,.06,.18,1)' })
        .addEventListener('finish', function () {
          el.remove();
          done();
        });
    }

    function open(el) {
      var key = el.getAttribute('data-book');
      var b = BOOKS[key];
      if (!b) return;
      last = el;
      fill(b);

      root.hidden = false;
      /* 表紙の行き先を先に測る */
      var to = cover.getBoundingClientRect();
      if (!to.width) { root.classList.add('is-open'); return; }

      if (reduced.matches) { root.classList.add('is-open'); return; }
      root.classList.remove('is-open');
      /* 棚の本は抜けたので、その場からは消しておく */
      el.style.visibility = 'hidden';
      fly(el, to, b.spine, function () {});
      /* 幕と札は、本が動いているあいだに立ち上げる。
         本が着いてから出すと、二つの動きが順番待ちに見える。 */
      window.requestAnimationFrame(function () { root.classList.add('is-open'); });
    }

    function close() {
      root.classList.remove('is-open');
      var back = last;
      window.setTimeout(function () {
        root.hidden = true;
        if (back) { back.style.visibility = ''; back.focus({ preventScroll: true }); }
        last = null;
      }, reduced.matches ? 0 : 320);
    }

    /* 狙いが外れたとき、いちばん近い本を拾う。
       いちばん薄い本でも背は10px前後しかない。指の腹はそれより広く、
       本と本のあいだや、背の低い本の上の空きに当たることがある。
       段の中で当たったなら、横の距離がいちばん近い本を開く。
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
       指の下の本が少し手前に出て、書名が大きく出る。離すとその本を開く。
       指を棚の上下へ外してから離せば、開かずにやめられる。
       本の見た目は変えずに、どの本でも確実に選べるようにする。
       縦に動かしたときはページを送る（棚に touch-action:pan-y）。 */
    var tag = document.createElement('div');
    tag.className = 'pick-tag';
    tag.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tag);

    var picked = null;          /* いま札を出している本 */
    var touch = null;           /* なぞっている指 */
    var quietUntil = 0;         /* 指で開いた直後の click を無視する */
    var OFF = 36;               /* 棚の上下にこれだけ外して離したら、開かない */

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
    function onShelf(row, y) {
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
        /* マウスでは、指している本に書名を出す */
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
      pick(onShelf(touch.row, e.clientY) ? bookAt(touch.row, e.clientX) : null);
    }, { passive: true });

    function endTouch() {
      if (touch) window.clearTimeout(touch.timer);
      touch = null;
      pick(null);
    }
    document.addEventListener('pointerup', function (e) {
      if (!touch || e.pointerId !== touch.id) return;
      var b = null;
      if (onShelf(touch.row, e.clientY)) b = touch.on ? picked : bookAt(touch.row, e.clientX);
      endTouch();
      if (b) { quietUntil = Date.now() + 600; open(b); }
      /* 開かずにやめたときも、あとから届く click で本が開かないように */
      else quietUntil = Date.now() + 600;
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
       指やマウスで開いた本を閉じると、棚の本へフォーカスが戻る。
       そのときは出さない（:focus-visible はキーボード操作のときだけ付く） */
    document.addEventListener('focusin', function (e) {
      var b = e.target.closest && e.target.closest('.case .spine[data-book]');
      if (b && b.matches(':focus-visible')) pick(b);
    });
    document.addEventListener('focusout', function (e) {
      if (e.target.closest && e.target.closest('.case .spine')) pick(null);
    });
    window.addEventListener('scroll', function () { if (!touch) pick(null); }, { passive: true });
    window.addEventListener('resize', function () { if (!touch) pick(null); });

    /* --- なぞれることを、一度だけ知らせる ------------------------
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
        hint.textContent = '棚を指でなぞると、書名が出ます';
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

    document.addEventListener('click', function (e) {
      /* 指で開いた直後に届く click。二度開かないように */
      if (Date.now() < quietUntil) return;
      var hit = e.target.closest('.spine[data-book], .flat[data-book]') || nearest(e);
      if (hit) { open(hit); return; }
      if (e.target.closest('[data-close]')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !root.hidden) { close(); return; }
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var hit = e.target.closest && e.target.closest('.spine[data-book], .flat[data-book]');
      if (hit) { e.preventDefault(); open(hit); }
    });
  }


  /* --- 試し読み ---------------------------------------------
     見開きを左右にめくり、指でひろげて拡大する。
     閉じると元の状態（引き抜きの画面）に戻る。

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
      root.querySelector('.peek__close').focus({ preventScroll: true });
      window.setTimeout(function () { if (hint) hint.classList.add('is-gone'); }, 3200);
    }
    function close() {
      root.classList.remove('is-open');
      document.body.classList.remove('peek-open');
      window.setTimeout(function () {
        root.hidden = true;
        pages[page].style.transform = '';
        /* 閉じたら引き抜きの画面へ戻す。棚まで戻してしまわない */
        var act = document.querySelector('.pull__act--read');
        if (act) act.focus({ preventScroll: true });
      }, reduced.matches ? 0 : 300);
    }

    document.addEventListener('click', function (e) {
      if (e.target.closest('.pull__act--read')) { open(); return; }
      if (e.target.closest('[data-peek-close]')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (root.hidden) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    }, true);
  }

  /* --- 商品詳細 ---------------------------------------------
     Shopify では商品ごとに自動で作られる画面。
     引き抜きの「商品の詳細を見る」から入り、閉じると表紙に戻る。 */
  function item() {
    var root = document.getElementById('item');
    var raw = document.getElementById('book-data');
    if (!root || !raw) return;
    var BOOKS = JSON.parse(raw.textContent);
    var body = root.querySelector('.item__body');
    var key = null;

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

    function open(k) {
      var b = BOOKS[k];
      if (!b) return;
      key = k;
      fill(b);
      root.hidden = false;
      body.scrollTop = 0;
      window.requestAnimationFrame(function () { root.classList.add('is-open'); });
      document.body.classList.add('peek-open');
      root.querySelector('.item__back').focus({ preventScroll: true });
    }
    function close() {
      root.classList.remove('is-open');
      document.body.classList.remove('peek-open');
      /* 本文の終わりからも閉じられるので、焦点は入口だった
         「商品の詳細を見る」に返す。閉じたあと宙に浮かせない */
      var more = document.querySelector('.pull__more');
      var pull = document.getElementById('pull');
      window.setTimeout(function () {
        root.hidden = true;
        if (more && pull && !pull.hidden) more.focus({ preventScroll: true });
      }, reduced.matches ? 0 : 300);
    }

    document.addEventListener('click', function (e) {
      if (e.target.closest('.pull__more')) {
        e.preventDefault();
        var cover = document.querySelector('.pull__cover');
        var src = cover ? cover.getAttribute('src') : '';
        /* 引き抜きで開いている本をそのまま引き継ぐ */
        for (var k in BOOKS) if (BOOKS[k].cover === src) { open(k); break; }
        return;
      }
      if (e.target.closest('[data-item-close]')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !root.hidden &&
          !above(['peek', 'cart', 'doc'])) { e.stopPropagation(); close(); }
    }, true);

    /* 商品詳細からも試し読みへ */
    root.querySelector('.item__act--read').addEventListener('click', function () {
      var act = document.querySelector('.pull__act--read');
      if (act) act.click();
    });
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
  function cart() {
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

    /* いま開いている本を、表紙の画像から割り出す */
    function current() {
      var src = null;
      var it = document.getElementById('item');
      if (it && !it.hidden) src = it.querySelector('.item__img').getAttribute('src');
      else {
        var pl = document.getElementById('pull');
        if (pl && !pl.hidden) src = pl.querySelector('.pull__cover').getAttribute('src');
      }
      if (!src) return null;
      for (var k in BOOKS) if (BOOKS[k].cover === src) return k;
      return null;
    }

    document.addEventListener('click', function (e) {
      if (e.target.closest('.pull__act--buy, .item__act--buy')) {
        var k = current();
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
    anchors();          /* 動きの設定に関わらず必ず通す。設定次第で即座に移る */
    fitShelves();       /* 動きの設定に関わらず必ず行う */
    topbar();           /* 同上。読めるかどうかの話なので */
    pullOut();          /* 同上。動きではなく機能なので */
    peek();
    item();
    docs();
    cart();
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
