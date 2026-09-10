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

    var ticking = false;
    function apply() {
      var y = window.pageYOffset;
      if (y > hero.offsetHeight) { ticking = false; return; }
      scene.style.transform = 'translate3d(0,' + (y * 0.16).toFixed(1) + 'px,0) scale(1.06)';
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(apply);
    }, { passive: true });
    apply();
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

  /* --- 棚に入りきらない本を下げる ----------------------------
     棚は柱で幅が決まっている。入りきらない本をそのままにすると、
     柱のきわで本が縦に切れてしまう。入る冊数だけを残す。
     見た目の正しさなので、動きを減らす設定でも必ず動かす。 */
  function fitShelves() {
    var rows = document.querySelectorAll('.case .row');
    Array.prototype.forEach.call(rows, function (row) {
      var books = row.querySelectorAll('.spine');
      Array.prototype.forEach.call(books, function (b) { b.classList.remove('is-over'); });
      var avail = row.getBoundingClientRect().width - 4;
      var used = 0, full = false;
      Array.prototype.forEach.call(books, function (b) {
        if (full) { b.classList.add('is-over'); return; }
        var w = parseFloat(window.getComputedStyle(b).width) || b.offsetWidth;
        if (used + w <= avail) { used += w; }
        else { full = true; b.classList.add('is-over'); }
      });
    });
  }

  var fitTimer;
  function onResize() {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitShelves, 120);
  }

  function start() {
    if (reduced.matches) return;
    parallax();
    reveal();
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
      el.animate([
        { transform: 'translate(0,0) scale(1,1)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' +
            (toRect.width / r.width) + ',' + (toRect.height / r.height) + ')', opacity: 1 }
      ], { duration: 420, easing: 'cubic-bezier(.22,.7,.24,1)' })
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
      fly(el, to, b.spine, function () { root.classList.add('is-open'); });
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

    document.addEventListener('click', function (e) {
      var hit = e.target.closest('.spine[data-book], .flat[data-book]');
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

    function draw(animate) {
      track.style.transition = animate ? 'transform .34s cubic-bezier(.22,.7,.24,1)' : 'none';
      track.style.transform =
        'translate3d(' + (-page * 100) + '%,0,0)';
      var pg = pages[page];
      pg.style.transition = animate ? 'transform .2s ease-out' : 'none';
      pg.style.transform =
        'translate3d(' + tx + 'px,' + ty + 'px,0) scale(' + scale + ')';
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
        clamp(); draw(false);
        return;
      }
      if (!dragFrom) return;
      var dx = e.clientX - dragFrom.x, dy = e.clientY - dragFrom.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) dragged = true;
      if (scale > 1.02) {                  /* 拡大中は中を動かす */
        tx = dragFrom.tx + dx; ty = dragFrom.ty + dy;
        clamp(); draw(false);
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
      if (wasPinch) { startDist = 0; return; }

      if (dragFrom && scale <= 1.02) {
        var dx = e.clientX - dragFrom.x;
        var w = stage.getBoundingClientRect().width;
        if (Math.abs(dx) > Math.min(90, w * 0.16)) go(dx < 0 ? 1 : -1);
        else draw(true);
      }
      dragFrom = null;
    }
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);

    /* 二本指のない環境（パソコン）でも拡大できるように */
    stage.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
      e.preventDefault();
      scale = Math.max(1, Math.min(MAX, scale * (e.deltaY < 0 ? 1.12 : 0.89)));
      if (scale <= 1.02) { tx = 0; ty = 0; }
      clamp(); draw(false);
      if (hint) hint.classList.add('is-gone');
    }, { passive: false });

    stage.addEventListener('dblclick', function () {
      scale = scale > 1.02 ? 1 : 2.2;
      if (scale === 1) { tx = 0; ty = 0; }
      clamp(); draw(true);
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
     引き抜きの「商品の詳細を見る」から入り、閉じると棚に戻る。 */
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
      window.setTimeout(function () { root.hidden = true; },
        reduced.matches ? 0 : 300);
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
          document.getElementById('peek').hidden) { e.stopPropagation(); close(); }
    }, true);

    /* 商品詳細からも試し読みへ */
    root.querySelector('.item__act--read').addEventListener('click', function () {
      var act = document.querySelector('.pull__act--read');
      if (act) act.click();
    });
  }

  function boot() {
    fitShelves();       /* 動きの設定に関わらず必ず行う */
    pullOut();          /* 同上。動きではなく機能なので */
    peek();
    item();
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
