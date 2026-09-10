/* 綴りの森 — 見た目と動きの検査
 *
 *   node tests/verify.js
 *
 * 一時フォルダに置いていたら三度消えたので、リポジトリに入れた。
 * tools/build.sh は載せるものを列挙する方式なので、これは配信されない。
 *
 * 数字（棚板の位置など）は、什器の絵を実測して得た値。
 * 絵を差し替えたときは、まず測り直してここを更新すること。
 */
const { chromium } = require('playwright');
const path = require('path');

const URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

/* 絵を実測した「棚板の上面」。本の底はこの帯に収まっていなければならない */
const BOARD = {
  'case--2shelf': [[45.0, 45.6], [94.9, 95.4]],
  'case--1shelf': [[89.9, 90.4]],
};

const VIEWS = [
  { n: 'phone', w: 390, h: 844 },
  { n: 'tablet', w: 834, h: 1112 },
  { n: 'desktop', w: 1440, h: 900 },
];
/* 引き抜き・試し読みを見る画面。横長で縦の短いものを必ず含める
   （見開きが下にはみ出したのはこの形だった） */
const SCREEN_VIEWS = [
  { n: 'phone', w: 390, h: 844 },
  { n: 'laptop', w: 1906, h: 874 },
  { n: 'desktop', w: 1440, h: 900 },
];

const ok = [], fail = [];
const t = (c, l) => (c ? ok : fail).push(l);

async function settle(p) {
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(500);
}

/* ---- 1. 棚と平台 ------------------------------------------------ */
async function shelf(b) {
  for (const vp of VIEWS) {
    const p = await b.newPage({ viewport: { width: vp.w, height: vp.h }, reducedMotion: 'reduce' });
    const bad = [];
    p.on('response', r => { if (r.status() >= 400) bad.push(r.url().split('/').pop()); });
    await p.goto(URL, { waitUntil: 'networkidle' });
    await settle(p);

    const m = await p.evaluate(() => {
      const vis = e => getComputedStyle(e).display !== 'none';
      const out = {
        cases: [], docW: document.documentElement.scrollWidth, winW: window.innerWidth,
        gaps: [], flatOver: 0, sign: document.querySelectorAll('.signcard').length,
      };
      document.querySelectorAll('.case').forEach(c => {
        const cr = c.getBoundingClientRect();
        out.cases.push({
          cls: [...c.classList].find(x => x.startsWith('case--')),
          w: Math.round(cr.width),
          tiers: [...c.querySelectorAll('.tier')].map(ti => {
            const tr = ti.getBoundingClientRect();
            const sp = [...ti.querySelectorAll('.spine')].filter(vis);
            const cut = sp.filter(e => {
              const r = e.getBoundingClientRect();
              return (r.left < tr.left - .5 && r.right > tr.left + .5) ||
                     (r.left < tr.right - .5 && r.right > tr.right + .5);
            }).length;
            return {
              cut,
              bottomPct: +(100 * (Math.max(...sp.map(e => e.getBoundingClientRect().bottom)) - cr.top) / cr.height).toFixed(2),
              overTop: sp.some(e => e.getBoundingClientRect().top < tr.top - 1),
              uniqW: new Set(sp.map(e => +e.getBoundingClientRect().width.toFixed(1))).size,
              minW: Math.min(...sp.map(e => +e.getBoundingClientRect().width.toFixed(1))),
            };
          }),
        });
      });
      document.querySelectorAll('.platform').forEach(pl => {
        const c = pl.previousElementSibling, pr = pl.getBoundingClientRect();
        if (c && c.classList.contains('case')) out.gaps.push(+(pr.top - c.getBoundingClientRect().bottom).toFixed(1));
        const fl = [...pl.querySelectorAll('.flat')].filter(vis);
        /* 本の底が天板の手前の端より内側にあること（またぐと台に刺さって見える） */
        out.flatOver = Math.max(out.flatOver,
          Math.max(...fl.map(e => e.getBoundingClientRect().bottom)) - (pr.top + pr.height * 0.44));
        out.flatN = fl.length;
        out.tilted = getComputedStyle(fl[0]).transform !== 'none';
        out.edge = getComputedStyle(fl[0], '::after').height;
        out.faces = fl[0].querySelectorAll('.flat__spine,.flat__fore').length;
      });
      out.marketH = Math.round(document.querySelector('.market').getBoundingClientRect().height);
      return out;
    });

    t(m.docW <= m.winW + 1, `${vp.n}: 横のはみ出しなし (${m.docW}/${m.winW})`);
    t(bad.length === 0, `${vp.n}: 画像すべて読める${bad.length ? ' — ' + [...new Set(bad)].join(',') : ''}`);
    t(m.sign === 0, `${vp.n}: 立て札が消えている`);
    t(m.gaps.every(g => g <= 1), `${vp.n}: 棚と平台がくっついている (${m.gaps.join(',')}px)`);
    t(m.flatOver <= 0, `${vp.n}: 平置きが天板の内側に載っている`);
    t(m.tilted, `${vp.n}: 平置きが寝ている`);
    t(parseFloat(m.edge) > 1, `${vp.n}: 平置きに厚みがある (小口 ${m.edge})`);
    t(m.faces === 2, `${vp.n}: 平置きに背と小口の面がある (${m.faces})`);
    if (vp.n === 'phone') {
      t(m.flatN === 4, `phone: 平置き4冊 (${m.flatN})`);
      t(m.marketH <= vp.h, `phone: 1テーマが一画面に収まる (${m.marketH}/${vp.h}px)`);
    }
    m.cases.forEach(c => {
      t(c.w >= vp.w - 1, `${vp.n} ${c.cls}: 棚が画面いっぱい`);
      c.tiers.forEach((ti, i) => {
        const [lo, hi] = BOARD[c.cls][i];
        t(ti.bottomPct >= lo - 0.8 && ti.bottomPct <= hi + 0.8,
          `${vp.n} ${c.cls} 段${i + 1}: 本が棚板に接地 (${ti.bottomPct}%)`);
        t(!ti.overTop, `${vp.n} ${c.cls} 段${i + 1}: 本が段からはみ出していない`);
        t(ti.cut === 0, `${vp.n} ${c.cls} 段${i + 1}: 柱ぎわで本が切れていない`);
        t(ti.uniqW >= 4, `${vp.n} ${c.cls} 段${i + 1}: 背幅が4種以上`);
        t(ti.minW >= 20, `${vp.n} ${c.cls} 段${i + 1}: いちばん薄い本でも ${ti.minW}px`);
      });
    });
    await p.close();
  }
}

/* ---- 2. 引き抜きと試し読み --------------------------------------- */
async function screens(b) {
  for (const vp of SCREEN_VIEWS) {
    const p = await b.newPage({ viewport: { width: vp.w, height: vp.h }, hasTouch: true });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL, { waitUntil: 'networkidle' });
    await settle(p);

    t(await p.evaluate(() => document.getElementById('pull').hidden), `${vp.n}: 引き抜きは最初は閉じている`);

    const sp = await p.$('.spine[data-book]');
    await sp.scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
    const key = await sp.getAttribute('data-book');
    await sp.click(); await p.waitForTimeout(800);

    let s = await p.evaluate(() => {
      const r = document.getElementById('pull');
      return {
        open: !r.hidden && r.classList.contains('is-open'),
        title: r.querySelector('.pull__title').textContent,
        price: r.querySelector('.pull__price').textContent,
        cover: r.querySelector('.pull__cover').getAttribute('src'),
        acts: r.querySelectorAll('.pull__act').length,
        fly: document.querySelectorAll('.pull-fly').length,
      };
    });
    t(s.open, `${vp.n}: 背表紙をタップで開く`);
    t(s.title.length > 0, `${vp.n}: 書名が入る（${s.title}）`);
    t(/円/.test(s.price), `${vp.n}: 価格が入る（${s.price}）`);
    t(s.cover.includes(key), `${vp.n}: タップした本の表紙`);
    t(s.acts === 2, `${vp.n}: 導線が2つ`);
    t(s.fly === 0, `${vp.n}: 飛ばした影武者が残っていない`);

    /* 試し読み */
    await p.click('.pull__act--read'); await p.waitForTimeout(700);
    s = await p.evaluate(() => {
      const r = document.getElementById('peek');
      return {
        open: !r.hidden && r.classList.contains('is-open'),
        now: document.getElementById('peek-now').textContent,
        all: document.getElementById('peek-all').textContent,
        prevOff: r.querySelector('.peek__nav--prev').disabled,
        imgW: document.querySelector('.peek__page img').naturalWidth,
        locked: document.body.classList.contains('peek-open'),
        /* 横長の画面で下にはみ出していたことがある。場に収まっているか */
        fits: true,
        over: (function () {
          var st = document.getElementById('peek-stage').getBoundingClientRect();
          var im = document.querySelector('.peek__page img').getBoundingClientRect();
          return Math.round(im.bottom - st.bottom);
        })(),
      };
    });
    t(s.open, `${vp.n}: 試し読みが開く`);
    t(s.now === '1' && s.all === '2', `${vp.n}: 1 / 2 と出る`);
    t(s.prevOff, `${vp.n}: 最初は「前へ」が使えない`);
    t(s.imgW === 2400, `${vp.n}: 見開きが長辺2400px (${s.imgW})`);
    t(s.over <= 0, `${vp.n}: 見開きが場に収まっている (余白 ${-s.over}px)`);
    t(s.locked, `${vp.n}: 試し読み中は後ろが動かない`);

    await p.click('.peek__nav--next'); await p.waitForTimeout(600);
    s = await p.evaluate(() => ({
      now: document.getElementById('peek-now').textContent,
      nextOff: document.querySelector('.peek__nav--next').disabled,
    }));
    t(s.now === '2' && s.nextOff, `${vp.n}: めくると 2 / 2 で止まる`);

    await p.mouse.move(vp.w / 2, vp.h / 2);
    for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -300); await p.waitForTimeout(80); }
    await p.waitForTimeout(300);
    const z = await p.evaluate(() => {
      const pg = document.querySelectorAll('.peek__page')[1];
      const m = getComputedStyle(pg).transform.match(/matrix\(([^,]+)/);
      return { scale: m ? parseFloat(m[1]) : 1, zoomed: document.getElementById('peek-stage').classList.contains('is-zoomed') };
    });
    t(z.scale > 1.5 && z.zoomed, `${vp.n}: つまんで拡大できる (${z.scale.toFixed(2)}倍)`);

    await p.keyboard.press('Escape'); await p.waitForTimeout(600);
    s = await p.evaluate(() => ({
      peek: document.getElementById('peek').hidden,
      pull: document.getElementById('pull').hidden,
      locked: document.body.classList.contains('peek-open'),
    }));
    t(s.peek, `${vp.n}: 試し読みを閉じられる`);
    t(!s.pull, `${vp.n}: 閉じると引き抜きの画面に戻る`);
    t(!s.locked, `${vp.n}: 後ろのスクロールが戻る`);

    await p.keyboard.press('Escape'); await p.waitForTimeout(600);
    s = await p.evaluate(() => ({
      hidden: document.getElementById('pull').hidden,
      gone: [...document.querySelectorAll('.spine,.flat')].filter(e => e.style.visibility === 'hidden').length,
    }));
    t(s.hidden, `${vp.n}: 引き抜きも閉じられる`);
    t(s.gone === 0, `${vp.n}: 抜いた本が棚に戻る`);

    /* 商品詳細 */
    await p.$eval('.spine[data-book]', e => e.click());
    await p.waitForTimeout(700);
    await p.click('.pull__more'); await p.waitForTimeout(700);
    s = await p.evaluate(() => {
      const it = document.getElementById('item');
      return {
        open: !it.hidden && it.classList.contains('is-open'),
        title: it.querySelector('.item__title').textContent,
        price: it.querySelector('.item__price').textContent,
        specs: it.querySelectorAll('.item__spec > div').length,
        paras: it.querySelectorAll('.item__desc p').length,
        acts: it.querySelectorAll('.item__act').length,
        cover: it.querySelector('.item__img').getAttribute('src'),
        docW: document.documentElement.scrollWidth, winW: window.innerWidth,
      };
    });
    t(s.open, `${vp.n}: 商品詳細が開く`);
    t(s.title.length > 0, `${vp.n}: 商品詳細に書名（${s.title}）`);
    t(/円/.test(s.price), `${vp.n}: 商品詳細に価格`);
    t(s.specs === 6, `${vp.n}: 書誌が6項目（書名・著者訳者・出版社・判型・ページ数・価格）`);
    t(s.paras >= 2, `${vp.n}: 紹介文が入る（${s.paras}段落）`);
    t(s.acts === 2, `${vp.n}: カートに入れる／試し読み`);
    t(s.cover.includes(key), `${vp.n}: 引き抜きで開いた本を引き継ぐ`);
    t(s.docW <= s.winW + 1, `${vp.n}: 商品詳細で横にはみ出さない`);

    await p.click('[data-item-close]'); await p.waitForTimeout(600);
    t(await p.evaluate(() => document.getElementById('item').hidden), `${vp.n}: 商品詳細を閉じられる`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);

    const fl = await p.$('.flat[data-book]');
    await fl.scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
    await fl.click(); await p.waitForTimeout(700);
    t(await p.evaluate(() => !document.getElementById('pull').hidden), `${vp.n}: 平置きをタップでも開く`);
    await p.mouse.click(8, 8); await p.waitForTimeout(600);
    t(await p.evaluate(() => document.getElementById('pull').hidden), `${vp.n}: 覆いの端で閉じる`);

    t(errs.length === 0, `${vp.n}: JSエラーなし${errs.length ? ' — ' + errs[0] : ''}`);
    await p.close();
  }
}

/* ---- 3. どの画面幅でも崩れないか --------------------------------- */
async function widths(b) {
  const p = await b.newPage({ reducedMotion: 'reduce' });
  const ws = [];
  for (let w = 320; w <= 1920; w += 20) ws.push(w);
  ws.push(767, 768, 769, 1199, 1200, 1201);
  ws.sort((a, c) => a - c);
  const bad = [];
  for (const w of ws) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(55);
    const r = await p.evaluate(() => {
      let cut = 0, vmax = 0, gmax = 0;
      document.querySelectorAll('.case .tier').forEach(ti => {
        const tr = ti.getBoundingClientRect();
        ti.querySelectorAll('.spine').forEach(e => {
          if (getComputedStyle(e).display === 'none') return;
          const r = e.getBoundingClientRect();
          if ((r.left < tr.left - .5 && r.right > tr.left + .5) ||
              (r.left < tr.right - .5 && r.right > tr.right + .5)) cut++;
          vmax = Math.max(vmax, tr.top - r.top);
        });
      });
      document.querySelectorAll('.platform').forEach(pl => {
        const c = pl.previousElementSibling;
        if (c && c.classList.contains('case'))
          gmax = Math.max(gmax, pl.getBoundingClientRect().top - c.getBoundingClientRect().bottom);
      });
      return { cut, vmax: +vmax.toFixed(1), gmax: +gmax.toFixed(1),
               docW: document.documentElement.scrollWidth, winW: window.innerWidth };
    });
    if (r.cut || r.vmax > 1 || r.gmax > 1 || r.docW > r.winW + 1)
      bad.push(`${w}px 切れ${r.cut} 上へ${r.vmax} 隙間${r.gmax} doc${r.docW}/${r.winW}`);
  }
  t(bad.length === 0, `320〜1920px の${ws.length}幅で崩れなし` + (bad.length ? ' — ' + bad.slice(0, 4).join(' / ') : ''));
  await p.close();
}

(async () => {
  const b = await chromium.launch();
  await shelf(b);
  await screens(b);
  await widths(b);
  await b.close();
  fail.forEach(l => console.log('  FAIL  ' + l));
  console.log(`${ok.length} passed, ${fail.length} failed`);
  process.exit(fail.length ? 1 : 0);
})();
