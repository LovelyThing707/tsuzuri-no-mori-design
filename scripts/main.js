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

  function boot() {
    fitShelves();       /* 動きの設定に関わらず必ず行う */
    pullOut();          /* 同上。動きではなく機能なので */
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
