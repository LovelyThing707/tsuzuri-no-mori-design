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

  function boot() {
    fitShelves();       /* 動きの設定に関わらず必ず行う */
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
