/* 綴りの森 — 見た目と動きの検査
 *
 *   node tests/verify.js
 *
 * 一時フォルダに置いていたら三度消えたので、リポジトリに入れた。
 * tools/build.sh は載せるものを列挙する方式なので、これは配信されない。
 *
 * 本棚は部材を組んで描いているので、段の底がそのまま棚板の上になる。
 */
const { chromium } = require('playwright');
const path = require('path');

const URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

/* 背の低い画面を必ず含める。3種類だけ見ていたころ、
   375x667・1366x768・1280x720・1024x768 で売り場が一画面に
   収まらなくなっていたのを、まるごと見落としていた。 */
const VIEWS = [
  { n: 'small', w: 320, h: 568 },
  { n: 'phone', w: 390, h: 844 },
  { n: 'phone-short', w: 375, h: 667 },
  /* 実機の Safari はブラウザの帯のぶん見える高さが短い。
     ヘッドレスの 390x844 だけを見ていて、実機で本が小さくなるのを見落とした */
  { n: 'iphone-safari', w: 390, h: 664 },
  { n: 'se-safari', w: 375, h: 548 },
  { n: 'phone-land', w: 844, h: 390 },
  { n: 'tablet', w: 834, h: 1112 },
  { n: 'laptop-short', w: 1366, h: 768 },
  { n: 'desktop', w: 1440, h: 900 },
  { n: 'wide', w: 1920, h: 955 },
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
      const root = getComputedStyle(document.documentElement);
      const px = v => parseFloat(v) || 0;
      const out = {
        docW: document.documentElement.scrollWidth, winW: window.innerWidth,
        sign: document.querySelectorAll('.signcard').length,
        oldParts: document.querySelectorAll('.platform, .case__box').length,
        /* 1mm あたりの長さ。背表紙の幅 ÷ 厚み(mm) から読む */
        mm: 0, mmFloor: 1.12,
        markets: [],
      };
      document.querySelectorAll('.market').forEach(mk => {
        const c = mk.querySelector('.case'), cr = c.getBoundingClientRect();
        const tiers = [...c.querySelectorAll('.tier')];
        const tier = tiers[0], tr = tier.getBoundingClientRect();
        const rows = tiers.map(t => t.querySelector('.row'));
        const deck = c.querySelector('.deck'), dr = deck.getBoundingClientRect();
        const base = c.querySelector('.case__base').getBoundingClientRect();
        const floor = c.querySelector('.case__floor').getBoundingClientRect();
        const post = getComputedStyle(c, '::before');
        const sp = [...c.querySelectorAll('.tier .spine')].filter(vis);
        const fl = [...deck.querySelectorAll('.flat')].filter(vis);
        /* 区画ごとの埋まり具合。いちばん空いている区画で見る */
        const fills = rows.map(r => {
          let u = 0;
          [...r.querySelectorAll('.spine')].filter(vis).forEach(e => {
            const s = getComputedStyle(e);
            u += px(s.width) + px(s.marginLeft) + px(s.marginRight);
          });
          return u / r.getBoundingClientRect().width;
        });
        /* 背の幅 ÷ 厚み。本ごとに同じなら、厚みは実物どおりの比 */
        const per = {};
        sp.forEach(e => {
          const t = px(e.style.getPropertyValue('--t'));
          if (t >= 5 && !per[t]) per[t] = px(getComputedStyle(e).width) / t;
        });
        const pv = Object.values(per);
        const mean = pv.reduce((a, x) => a + x, 0) / (pv.length || 1);
        if (!out.mm) out.mm = mean;
        /* 背表紙の写真が歪んでいないか。画面上の縦横比 ÷ 写真の縦横比。
           写真そのものの切り出しが実寸比から ±6% 以内なので、それ以内なら可 */
        const skew = sp.map(e => {
          const im = e.querySelector('img');
          if (!im || !im.naturalWidth) return 1;
          const s = getComputedStyle(im);
          const r = (px(s.width) / px(s.height)) / (im.naturalWidth / im.naturalHeight);
          return Math.max(r, 1 / r);
        });
        const cut = sp.filter(e => {
          const r = e.getBoundingClientRect(), rr = e.closest('.row').getBoundingClientRect();
          return (r.left < rr.left - .5 && r.right > rr.left + .5) ||
                 (r.left < rr.right - .5 && r.right > rr.right + .5);
        }).length;
        /* 参考画像と同じ並び（4冊ひと組）か、まっすぐ立っているか */
        const UNIT = ['monte', 'suika', 'aya', 'kagaku'];
        const inOrder = rows.every(r => {
          const l = [...r.querySelectorAll('.spine')].filter(vis).map(e => e.dataset.book);
          const s0 = UNIT.indexOf(l[0]);
          return l.every((k, i) => k === UNIT[(s0 + i) % 4]);
        });
        const upright = sp.every(e => { const t = getComputedStyle(e).transform; return t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'; });
        out.markets.push({
          h: Math.round(mk.getBoundingClientRect().height),
          caseW: Math.round(cr.width),
          /* 柱が床まで通っているか：柱の下端＝台輪の下端＝床の上端 */
          postBottom: +(cr.top + px(post.top) + px(post.height)).toFixed(1),
          boardBottom: +[...c.querySelectorAll('.case__board')].pop().getBoundingClientRect().bottom.toFixed(1),
          legs: /post-left.*post-right/.test(getComputedStyle(c.querySelector('.case__base')).backgroundImage),
          baseBottom: +base.bottom.toFixed(1), floorTop: +floor.top.toFixed(1),
          postH: px(post.height), caseH: cr.height,
          deckInCase: c.contains(deck),
          /* 棚板に立っているか：本の底が段の底に揃う */
          bottomGap: +Math.max(...sp.map(e => Math.abs(e.closest('.tier').getBoundingClientRect().bottom - e.getBoundingClientRect().bottom))).toFixed(1),
          overTop: sp.some(e => e.getBoundingClientRect().top < e.closest('.tier').getBoundingClientRect().top - 1),
          fill: Math.round(100 * Math.min(...fills)),
          tiers: tiers.length, dividers: c.querySelectorAll('.bay').length, inOrder, upright,
          perRow: rows.map(r => [...r.querySelectorAll('.spine')].filter(vis).length),
          n: sp.length, cut,
          ratioSpread: pv.length < 2 ? 0 : +((Math.max(...pv) - Math.min(...pv)) / mean).toFixed(3),
          skew: +Math.max(...skew).toFixed(3),
          minW: Math.min(...sp.map(e => px(getComputedStyle(e).width))),
          /* 平台 */
          flatN: fl.length,
          flatIn: fl.every(e => {
            const r = e.getBoundingClientRect();
            return r.top >= dr.top - 1 && r.bottom <= dr.bottom + 1 && r.left >= dr.left - 1 && r.right <= dr.right + 1;
          }),
          flatTilted: fl.length > 0 && getComputedStyle(fl[0]).transform !== 'none',
          flatEdge: fl.length ? px(getComputedStyle(fl[0], '::after').height) : 0,
          flatFaces: fl.length ? fl[0].querySelectorAll('.flat__spine,.flat__fore').length : 0,
          flatMinW: fl.length ? Math.min(...fl.map(e => e.offsetWidth)) : 0,
          deckBottom: Math.round(dr.bottom - mk.getBoundingClientRect().top),
          shelfBottom: Math.round([...c.querySelectorAll('.case__board')].pop().getBoundingClientRect().bottom - mk.getBoundingClientRect().top),
          /* 光の斑（白いモヤ）が戻っていないか */
          dapple: [...mk.querySelectorAll('*')].concat([mk]).some(e =>
            ['::before', '::after', ''].some(ps => /komorebi/.test(getComputedStyle(e, ps || null).backgroundImage))),
        });
      });
      return out;
    });

    t(m.docW <= m.winW + 1, `${vp.n}: 横のはみ出しなし (${m.docW}/${m.winW})`);
    t(bad.length === 0, `${vp.n}: 画像すべて読める${bad.length ? ' — ' + [...new Set(bad)].join(',') : ''}`);
    t(m.sign === 0, `${vp.n}: 立て札が消えている`);
    t(m.oldParts === 0, `${vp.n}: 別の什器だった平台・絵の什器が残っていない`);
    const phone = vp.w < 600;
    const land = vp.w > vp.h && vp.h <= 500;
    m.markets.forEach((k, i) => {
      const n = `${vp.n} 売り場${i + 1}`;
      t(k.caseW >= vp.w - 1, `${n}: 本棚が画面の幅いっぱい`);
      /* 本棚は床に立つ（「上の本棚が宙にういているようにみえます」） */
      /* 参考画像と同じ組み方。柱は本棚の上の部分（最後の棚板まで）で止まり、
         平台はその手前へせり出す。平台の下は脚で支え、台輪が床に接する */
      t(Math.abs(k.postBottom - k.boardBottom) <= 1,
        `${n}: 柱は最後の棚板まで。平台は柱より手前にせり出す (柱${k.postBottom}/棚板${k.boardBottom})`);
      t(k.legs && Math.abs(k.baseBottom - k.floorTop) <= 1,
        `${n}: 平台の下は脚で支え、本棚が床に立つ (台輪${k.baseBottom}/床${k.floorTop})`);
      t(k.deckInCase, `${n}: 平台は本棚の下部がせり出したもの（一つの家具）`);
      /* 段の数は以前の構成のとおり。1つめの売り場は2段、2つめは1段 */
      t(k.tiers === (i === 0 ? 2 : 1), `${n}: 段は${i === 0 ? 2 : 1}つ (${k.tiers})`);
      t(k.dividers === 0, `${n}: 棚は仕切らず、画面の幅いっぱいに1続き`);
      /* スマートフォンの1段は12冊程度（國分様への回答「1段12冊程度」） */
      if (phone && !land) t(k.perRow.every(x => x >= 12 && x <= 13),
        `${n}: スマートフォンの1段は12冊程度 (${k.perRow.join('・')}冊)`);
      t(k.inOrder, `${n}: 参考画像と同じ並び（4冊ひと組の繰り返し）`);
      t(k.upright, `${n}: 本はまっすぐ立っている`);
      t(k.bottomGap <= 1.5, `${n}: 本が棚板に立っている (ずれ ${k.bottomGap}px)`);
      t(!k.overTop, `${n}: 本が段からはみ出していない`);
      t(k.cut === 0, `${n}: 柱ぎわで本が切れていない`);
      t(k.fill >= 85, `${n}: 段が本で埋まっている (${k.fill}%)`);
      /* 厚みは実物どおりの比（必須条件⑤）。一律の誇張もかけない */
      t(k.ratioSpread <= 0.02, `${n}: 厚みの比が実物どおり (ずれ ${(k.ratioSpread * 100).toFixed(1)}%)`);
      t(k.skew <= 1.07, `${n}: 背表紙の写真が引き伸ばされていない (${k.skew}倍)`);
      /* いちばん薄いデモの本（11mm）でも 12px 以上。選ぶのは指でなぞって確かめる。
         横向きのスマートフォンは段を見える高さに合わせるので、ここは見ない */
      if (!land) t(k.minW >= 14, `${n}: いちばん薄い本も指で選べる幅 (${k.minW.toFixed(1)}px)`);
      /* 平台の冊数。要件定義書 2-3「3〜4冊」。天板の広いパソコンだけ8冊 */
      const want = vp.w >= 1500 ? 8 : vp.w >= 1100 ? 6 : vp.w >= 360 ? 4 : 3;
      t(k.flatN === want, `${n}: 平台に${want}冊 (${k.flatN}冊)`);
      t(k.flatIn, `${n}: 平置きが平台の天板の内側に載っている`);
      t(k.flatTilted, `${n}: 平置きが寝ている`);
      t(k.flatEdge > 1, `${n}: 平置きに厚みがある (小口 ${k.flatEdge}px)`);
      t(k.flatFaces === 2, `${n}: 平置きに背と小口の面がある`);
      t(k.flatMinW >= 44, `${n}: 平台のいちばん小さい本も表紙が見え、指で押せる (${k.flatMinW}px)`);
      t(!k.dapple, `${n}: 光の斑（白いモヤ）が無い`);
      /* 本の大きさ。押しやすさを優先し、スマートフォンの1段が12冊程度になる大きさ。
         パソコン・タブレットも同じ大きさ（厚みも高さもスマートフォンと同じ）。
         本棚が縦に長くなるのは承知のうえ（依頼主のご指示） */
      if (vp.w >= 390) t(Math.abs(m.mm - 1.66) < 0.01, `${n}: 本の大きさはスマートフォンと同じ 1.66px/mm (${m.mm.toFixed(3)})`);
    });
    await p.close();
  }
}

/* ---- 1b. 指でなぞって選ぶ -------------------------------------- */
async function picking(b) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await settle(p);
  const top = await p.evaluate(() => document.querySelector('.market').getBoundingClientRect().top + window.scrollY);
  await p.evaluate(y => window.scrollTo(0, y), top);
  await p.waitForTimeout(300);
  const r = await p.evaluate(async () => {
    const row = document.querySelector('.case .row');
    const books = [...row.querySelectorAll('.spine')].filter(e => getComputedStyle(e).display !== 'none');
    const ia = books.findIndex(e => e.dataset.book === 'kagaku');
    const a = books[ia].getBoundingClientRect(), z = books[books.length - 2].getBoundingClientRect();
    const y = a.bottom - 40;
    const ev = (ty, x) => (document.elementFromPoint(x, y) || row).dispatchEvent(new PointerEvent(ty,
      { pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true }));
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const tag = () => document.querySelector('.pick-tag');
    const BOOKS = JSON.parse(document.getElementById('book-data').textContent);
    ev('pointerdown', a.left + a.width / 2 - 4);
    ev('pointermove', a.left + a.width / 2 + 4);
    await wait(60);
    const first = { on: tag().classList.contains('is-on'), text: tag().textContent,
                    want: BOOKS[books[ia].dataset.book].title, lifted: books[ia].classList.contains('is-picked') };
    const zx = z.left + z.width / 2;
    ev('pointermove', zx);
    await wait(60);
    const second = { text: tag().textContent, want: BOOKS[books[books.length - 2].dataset.book].title,
                     one: row.querySelectorAll('.is-picked').length };
    ev('pointerup', zx);
    await wait(900);
    const pull = document.getElementById('pull');
    return { first, second, opened: !pull.hidden,
             title: document.querySelector('.pull__title').textContent, off: !tag().classList.contains('is-on') };
  });
  t(r.first.on && r.first.text === r.first.want, `なぞる: 指の下の本の書名が出る (${r.first.text})`);
  t(r.first.lifted, 'なぞる: 指の下の本が棚から少し出る');
  t(r.second.text === r.second.want && r.second.one === 1, `なぞる: 指を動かすと隣の本へ移る (${r.second.text})`);
  t(r.opened && r.title === r.second.want, `なぞる: 指を離すと、その本が開く (${r.title})`);
  t(r.off, 'なぞる: 開いたあと書名の札は消える');
  t(errs.length === 0, `なぞる: スクリプトの誤りなし${errs.length ? ' — ' + errs[0] : ''}`);
  await p.close();
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
    /* 影武者の動きは 560ms。固定の待ち時間で見ていると、
       機械が混んでいるときだけ落ちる。消えるまで待つ。 */
    await sp.click();
    await p.waitForFunction(() => !document.querySelector('.pull-fly'), null, { timeout: 5000 })
      .catch(() => {});
    await p.waitForTimeout(250);

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

/* ---- 3. 固定ページとカート ---------------------------------------
   固定ページは要件定義書 2-7、カートは 2-6。
   決済そのものは Shopify 標準なので、そこへ渡るまでを見る。 */
const DOCS = [
  { k: 'about',    n: '綴りの森について' },
  { k: 'blog',     n: 'お知らせ' },
  { k: 'contact',  n: 'お問い合わせ' },
  { k: 'tokusho',  n: '特定商取引法に基づく表記' },
  { k: 'privacy',  n: 'プライバシーポリシー' },
];

async function pages(b) {
  const yen = v => +v.replace(/[^\d]/g, '');

  for (const vp of [{ n: 'phone', w: 390, h: 844 }, { n: 'desktop', w: 1440, h: 900 }]) {
    const p = await b.newPage({ viewport: { width: vp.w, height: vp.h }, hasTouch: true });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL, { waitUntil: 'networkidle' });

    t(await p.evaluate(() => document.getElementById('doc').hidden),
      `${vp.n}: 固定ページは最初は閉じている`);

    /* --- 固定ページ --- */
    for (const d of DOCS) {
      await p.$eval(`footer [data-doc="${d.k}"]`, e => e.click());
      await p.waitForTimeout(450);
      const s = await p.evaluate(() => {
        const r = document.getElementById('doc');
        const on = [...r.querySelectorAll('.doc__page')].filter(e => !e.hidden);
        return {
          open: !r.hidden && r.classList.contains('is-open'),
          shown: on.length,
          key: on.length ? on[0].getAttribute('data-page') : '',
          title: on.length ? on[0].querySelector('.doc__title').textContent : '',
          text: on.length ? on[0].textContent.replace(/\s+/g, '').length : 0,
          top: r.querySelector('.doc__body').scrollTop,
          locked: document.body.classList.contains('peek-open'),
          docW: document.documentElement.scrollWidth, winW: window.innerWidth,
        };
      });
      t(s.open && s.shown === 1 && s.key === d.k, `${vp.n}: ${d.n} が開く（1枚だけ）`);
      t(s.title === d.n, `${vp.n}: ${d.n} の見出し`);
      t(s.text > 120, `${vp.n}: ${d.n} に中身がある（${s.text}字）`);
      t(s.top === 0, `${vp.n}: ${d.n} は先頭から表示`);
      t(s.locked, `${vp.n}: ${d.n} の裏の棚は動かない`);
      t(s.docW <= s.winW + 1, `${vp.n}: ${d.n} で横にはみ出さない`);
      await p.click('[data-doc-close]'); await p.waitForTimeout(400);
      t(await p.evaluate(() => document.getElementById('doc').hidden),
        `${vp.n}: ${d.n} を閉じられる`);
    }

    /* いただく箇所が、そのまま依頼一覧になっているか */
    await p.$eval('footer [data-doc="tokusho"]', e => e.click());
    await p.waitForTimeout(400);
    let s = await p.evaluate(() => {
      const pg = document.querySelector('[data-page="tokusho"]');
      return { rows: pg.querySelectorAll('.doc__kv > div').length,
               need: pg.querySelectorAll('.doc__need').length };
    });
    t(s.rows === 11, `${vp.n}: 特商法が11項目（${s.rows}）`);
    t(s.need >= 6, `${vp.n}: いただく箇所に印がある（${s.need}件）`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    t(await p.evaluate(() => document.getElementById('doc').hidden),
      `${vp.n}: 固定ページはEscapeで閉じる`);

    await p.$eval('footer [data-doc="contact"]', e => e.click());
    await p.waitForTimeout(400);
    s = await p.evaluate(() => {
      const f = document.querySelector('[data-page="contact"] .doc__form');
      return { fields: f.querySelectorAll('input,select,textarea').length,
               send: !!f.querySelector('.doc__send') };
    });
    t(s.fields === 4, `${vp.n}: お問い合わせが4項目（${s.fields}）`);
    t(s.send, `${vp.n}: お問い合わせに送信の導線`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);

    /* --- カート --- */
    s = await p.evaluate(() => ({
      hidden: document.getElementById('cart').hidden,
      badge: document.getElementById('cart-n').hidden,
    }));
    t(s.hidden && s.badge, `${vp.n}: カートは最初は空で、数も出ない`);

    /* 書名の長い本で、帯が画面の外へはみ出していた */
    const longest = await p.evaluate(() => {
      const d = JSON.parse(document.getElementById('book-data').textContent);
      return Object.keys(d).sort((a, b) => d[b].title.length - d[a].title.length)[0];
    });
    const lb = await p.$(`.spine[data-book="${longest}"]`);
    await lb.scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
    await lb.click(); await p.waitForTimeout(800);
    await p.click('.pull__act--buy'); await p.waitForTimeout(350);
    s = await p.evaluate(() => {
      const r = document.getElementById('toast').getBoundingClientRect();
      return { l: Math.round(r.left), rt: Math.round(r.right), w: window.innerWidth };
    });
    t(s.l >= -1 && s.rt <= s.w + 1,
      `${vp.n}: 書名が長くても手応えの帯が収まる（${s.l}〜${s.rt} / ${s.w}）`);
    /* 一度空に戻してから先へ */
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.click('#cart-open'); await p.waitForTimeout(500);
    await p.$$eval('.cart__row [data-del]', es => es.forEach(e => e.click()));
    await p.waitForTimeout(250);
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);

    const sp = await p.$('.spine[data-book]');
    await sp.scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
    const key = await sp.getAttribute('data-book');
    /* 影武者の動きは 560ms。固定の待ち時間で見ていると、
       機械が混んでいるときだけ落ちる。消えるまで待つ。 */
    await sp.click();
    await p.waitForFunction(() => !document.querySelector('.pull-fly'), null, { timeout: 5000 })
      .catch(() => {});
    await p.waitForTimeout(250);
    await p.click('.pull__act--buy'); await p.waitForTimeout(400);

    s = await p.evaluate(() => {
      const to = document.getElementById('toast');
      return { toast: !to.hidden && to.classList.contains('is-on'),
               msg: to.textContent,
               n: document.getElementById('cart-n').textContent,
               shown: !document.getElementById('cart-n').hidden };
    });
    t(s.toast, `${vp.n}: カートに入れた手応えが出る`);
    t(/カートに入れました/.test(s.msg), `${vp.n}: 何を入れたか分かる（${s.msg}）`);
    t(s.shown && s.n === '1', `${vp.n}: 上の帯に1と出る`);

    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.click('#cart-open'); await p.waitForTimeout(500);
    s = await p.evaluate(() => {
      const r = document.getElementById('cart');
      const row = r.querySelector('.cart__row');
      return {
        open: !r.hidden && r.classList.contains('is-open'),
        rows: r.querySelectorAll('.cart__row').length,
        cover: row ? row.querySelector('img').getAttribute('src') : '',
        name: row ? row.querySelector('.cart__name').textContent : '',
        sub: document.getElementById('cart-sub').textContent,
        empty: document.getElementById('cart-empty').hidden,
        go: document.getElementById('cart-go').disabled,
        onscreen: r.querySelector('.cart__panel').getBoundingClientRect().right
                    <= window.innerWidth + 1,
        docW: document.documentElement.scrollWidth, winW: window.innerWidth,
      };
    });
    t(s.open, `${vp.n}: カートが開く`);
    /* 書名が長いと、ここが縦に折れたり端で切れたりしていた */
    const del = await p.evaluate(() => {
      const e = document.querySelector('.cart__del');
      const r = e.getBoundingClientRect();
      const rw = e.closest('.cart__row').getBoundingClientRect();
      return { h: Math.round(r.height), w: Math.round(r.width),
               over: Math.round(r.right - rw.right),
               fs: parseFloat(getComputedStyle(e).fontSize) };
    });
    t(del.h <= del.fs * 2 && del.w >= del.fs * 3.5 && del.over <= 1,
      `${vp.n}: 「取り消す」が1行で収まる（${del.w}×${del.h}px はみ出し${del.over}）`);
    t(s.rows === 1 && s.cover.includes(key), `${vp.n}: 入れた本が入っている（${s.name}）`);
    t(/^[\d,]+円$/.test(s.sub), `${vp.n}: 小計が出る（${s.sub}）`);
    t(s.empty && !s.go, `${vp.n}: 中身があれば購入手続きへ進める`);
    t(s.onscreen && s.docW <= s.winW + 1, `${vp.n}: カートが画面に収まる`);

    const one = s.sub;
    await p.click('.cart__row [data-q="1"]'); await p.waitForTimeout(250);
    s = await p.evaluate(() => ({
      q: document.querySelector('.cart__qty span').textContent,
      sub: document.getElementById('cart-sub').textContent,
      n: document.getElementById('cart-n').textContent,
    }));
    t(s.q === '2' && s.n === '2', `${vp.n}: 冊数を増やせる`);
    t(yen(s.sub) === yen(one) * 2, `${vp.n}: 小計が冊数に付いてくる（${s.sub}）`);

    await p.click('.cart__row [data-q="-1"]'); await p.waitForTimeout(250);
    t(await p.evaluate(() => document.querySelector('.cart__qty span').textContent) === '1',
      `${vp.n}: 冊数を減らせる`);

    await p.click('.cart__row [data-del]'); await p.waitForTimeout(250);
    s = await p.evaluate(() => ({
      rows: document.querySelectorAll('.cart__row').length,
      empty: document.getElementById('cart-empty').hidden,
      go: document.getElementById('cart-go').disabled,
      badge: document.getElementById('cart-n').hidden,
    }));
    t(s.rows === 0 && !s.empty, `${vp.n}: 取り消すと空になる`);
    t(s.go && s.badge, `${vp.n}: 空なら購入手続きへは進めない`);

    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    t(await p.evaluate(() => document.getElementById('cart').hidden),
      `${vp.n}: カートはEscapeで閉じる`);

    /* 別の本を足したら、行が分かれるか */
    const spines = await p.$$('.spine[data-book]');
    let other = null;
    for (const e of spines) {
      if ((await e.getAttribute('data-book')) !== key) { other = e; break; }
    }
    for (const e of [sp, other]) {
      await e.scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
      await e.click(); await p.waitForTimeout(700);
      await p.click('.pull__act--buy'); await p.waitForTimeout(300);
      await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    }
    await p.click('#cart-open'); await p.waitForTimeout(500);
    s = await p.evaluate(() => ({
      rows: document.querySelectorAll('.cart__row').length,
      n: document.getElementById('cart-n').textContent,
    }));
    t(s.rows === 2 && s.n === '2', `${vp.n}: 別の本は別の行になる`);

    /* 閉じ方。狭い画面ではカートが画面いっぱいに出るので、
       覆いの端がない。そのときは✕で閉じられればよい */
    const scrim = await p.evaluate(() => {
      const el = document.elementFromPoint(8, 8);
      return !!(el && el.classList.contains('cart__scrim'));
    });
    if (scrim) {
      await p.mouse.click(8, 8); await p.waitForTimeout(500);
      t(await p.evaluate(() => document.getElementById('cart').hidden),
        `${vp.n}: 覆いの端でカートが閉じる`);
    } else {
      await p.click('.cart__close'); await p.waitForTimeout(500);
      t(await p.evaluate(() => document.getElementById('cart').hidden),
        `${vp.n}: ✕でカートが閉じる`);
    }

    t(errs.length === 0,
      `${vp.n}: 固定ページとカートでJSエラーなし${errs.length ? ' — ' + errs[0] : ''}`);
    await p.close();
  }
}

/* ---- 4. 上の帯のメニュー ------------------------------------------
   売り場と固定ページへの案内。棚の続く画面ではフッターまで遠い。 */
async function nav(b) {
  for (const vp of [{ n: 'phone', w: 390, h: 844 }, { n: 'desktop', w: 1440, h: 900 }]) {
    const p = await b.newPage({ viewport: { width: vp.w, height: vp.h }, hasTouch: true });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL, { waitUntil: 'networkidle' });

    t(await p.evaluate(() => document.getElementById('menu').hidden),
      `${vp.n}: メニューは最初は閉じている`);

    await p.click('#menu-open'); await p.waitForTimeout(600);
    let s = await p.evaluate(() => {
      const r = document.getElementById('menu');
      return {
        open: !r.hidden && r.classList.contains('is-open'),
        markets: [...document.querySelectorAll('#menu-markets a')].map(a => a.textContent),
        signs: [...document.querySelectorAll('.market__sign')].map(h => h.textContent),
        pages: document.querySelectorAll('#menu [data-doc]').length,
        left: Math.round(document.querySelector('.menu__panel').getBoundingClientRect().left),
        lock: document.body.classList.contains('peek-open'),
      };
    });
    t(s.open, `${vp.n}: メニューが開く`);
    t(s.markets.length === s.signs.length &&
      s.markets.every((m, i) => m === s.signs[i]),
      `${vp.n}: 売り場が本文どおり並ぶ（${s.markets.join('／')}）`);
    t(s.pages === 5, `${vp.n}: 固定ページが5つ（${s.pages}）`);
    t(s.left === 0 && s.lock, `${vp.n}: 左から出て、後ろの棚は動かない`);

    /* メニューから固定ページへ。ページが上にかぶさり、棚は止めたまま */
    await p.click('#menu [data-doc="tokusho"]'); await p.waitForTimeout(700);
    s = await p.evaluate(() => {
      const on = [...document.querySelectorAll('.doc__page')].filter(e => !e.hidden);
      const z = e => +getComputedStyle(e).zIndex;
      return {
        doc: !document.getElementById('doc').hidden,
        key: on.length === 1 ? on[0].getAttribute('data-page') : '',
        menu: document.getElementById('menu').hidden,
        lock: document.body.classList.contains('peek-open'),
        over: z(document.getElementById('doc')) > z(document.getElementById('menu')),
      };
    });
    t(s.doc && s.key === 'tokusho', `${vp.n}: メニューから固定ページへ行ける`);
    t(s.over, `${vp.n}: 固定ページはメニューより上に出る`);
    t(s.lock, `${vp.n}: 固定ページのあいだ、棚は動かない`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    t(await p.evaluate(() => !document.body.classList.contains('peek-open')),
      `${vp.n}: 閉じたら棚が動くように戻る`);

    /* 売り場へ寄せる。看板が画面に入っているか */
    await p.click('#menu-open'); await p.waitForTimeout(600);
    await p.click('#menu-markets li:nth-child(2) a'); await p.waitForTimeout(1400);
    s = await p.evaluate(() => {
      const signs = [...document.querySelectorAll('.market__sign')];
      const r = signs[1].getBoundingClientRect();
      return { menu: document.getElementById('menu').hidden,
               lock: document.body.classList.contains('peek-open'),
               top: Math.round(r.top), h: window.innerHeight };
    });
    t(s.menu && !s.lock, `${vp.n}: 売り場を選ぶとメニューは閉じる`);
    t(s.top >= 0 && s.top < s.h * 0.4,
      `${vp.n}: 選んだ売り場の看板が画面に入る（上から${s.top}px）`);

    /* 覆いを押して閉じる。左から出るので、押すのは右の端 */
    await p.click('#menu-open'); await p.waitForTimeout(600);
    await p.mouse.click(vp.w - 8, 8); await p.waitForTimeout(600);
    t(await p.evaluate(() => document.getElementById('menu').hidden),
      `${vp.n}: 覆いの端でメニューが閉じる`);

    /* 探しやすさは、含めるかどうかをご検討いただいている段階 */
    await p.click('.topbar__search'); await p.waitForTimeout(400);
    s = await p.evaluate(() => {
      const e = document.getElementById('toast');
      return { on: !e.hidden && e.classList.contains('is-on'), msg: e.textContent };
    });
    t(s.on && s.msg.length > 0, `${vp.n}: さがすを押すと今の扱いが出る（${s.msg}）`);

    t(errs.length === 0,
      `${vp.n}: メニューでJSエラーなし${errs.length ? ' — ' + errs[0] : ''}`);
    await p.close();
  }
}

/* ---- 5. 今回のご指摘4件 ------------------------------------------
   拡大したときの粗さ／詳細の出口／上の帯／画面の送り。
   どれも「直したつもりで直っていない」が起きやすいので、
   直した中身そのものを留める。 */
async function fixes(b) {
  for (const vp of [{ n: 'phone', w: 390, h: 844, d: 3 },
                    { n: 'desktop', w: 1440, h: 900, d: 1 }]) {
    const p = await b.newPage({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: vp.d, hasTouch: true, isMobile: vp.d > 1,
    });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL, { waitUntil: 'networkidle' });

    /* --- 森の上の題字が読めるか -------------------------
       絵の明るい道が題字の後ろを通ることがある。文字だけ伏せて、
       地の画素を見る（器ごと伏せると、下の沈みまで消えてしまう） */
    const hb = await p.evaluate(() => {
      /* 要素ではなく、文字そのものが占める矩形を測る。
         見出しは幅いっぱいの箱なので、要素で測ると文字の無い左右の
         明るい木まで含めてしまい、読めているのに落ちる */
      const r = e => {
        const g = document.createRange();
        g.selectNodeContents(e);
        const b = g.getBoundingClientRect();
        g.detach && g.detach();
        return [b.x, b.y, b.width, b.height].map(Math.round);
      };
      const o = { name: r(document.querySelector('.hero__name')),
                  lead: r(document.querySelector('.hero__lead')) };
      document.querySelector('.hero__name').style.visibility = 'hidden';
      document.querySelector('.hero__lead').style.visibility = 'hidden';
      return o;
    });
    await p.waitForTimeout(120);
    const hh = Math.min(vp.h, 900);
    const hpng = (await p.screenshot({ clip: { x: 0, y: 0, width: vp.w, height: hh } }))
      .toString('base64');
    await p.evaluate(() => {
      document.querySelector('.hero__name').style.visibility = '';
      document.querySelector('.hero__lead').style.visibility = '';
    });
    const hc = await p.evaluate(async ({ png, boxes, w, h }) => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + png; });
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, w, h);
      const F = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const L = (r, g, b) => 0.2126 * F(r) + 0.7152 * F(g) + 0.0722 * F(b);
      const out = {};
      for (const [k, col] of [['name', [233, 224, 206]], ['lead', [210, 198, 174]]]) {
        const [x, y, bw, bh] = boxes[k];
        if (bw <= 0 || y + bh > h) { out[k] = null; continue; }
        const d = cx.getImageData(Math.max(0, x), Math.max(0, y), bw, bh).data;
        const L1 = L(col[0], col[1], col[2]); const rs = [];
        for (let i = 0; i < d.length; i += 4) {
          const L2 = L(d[i], d[i + 1], d[i + 2]);
          rs.push((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05));
        }
        rs.sort((a, b) => a - b);
        out[k] = +rs[Math.floor(rs.length * 0.01)].toFixed(2);
      }
      return out;
    }, { png: hpng, boxes: hb, w: vp.w, h: hh });
    t(hc.name === null || hc.name >= 4.5,
      `${vp.n}: 森の上の題字が読める（${hc.name}:1）`);
    t(hc.lead === null || hc.lead >= 4.5,
      `${vp.n}: 森の上の一文が読める（${hc.lead}:1）`);

    /* --- 上の帯は下りても残る --- */
    let s = await p.evaluate(() => {
      const bar = document.querySelector('.topbar');
      return { pos: getComputedStyle(bar).position,
               top: Math.round(bar.getBoundingClientRect().top),
               lit: bar.classList.contains('is-lit'),
               bar: getComputedStyle(document.documentElement).getPropertyValue('--bar').trim() };
    });
    t(s.pos === 'fixed', `${vp.n}: 上の帯が固定されている`);
    t(s.top === 0, `${vp.n}: 森の上でも上端にある`);
    t(!s.lit, `${vp.n}: 森の上では地を敷かない`);
    t(/^\d+(\.\d+)?px$/.test(s.bar), `${vp.n}: 帯の実寸がCSSへ渡っている（${s.bar}）`);

    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await p.waitForTimeout(700);
    s = await p.evaluate(() => {
      const bar = document.querySelector('.topbar');
      return { top: Math.round(bar.getBoundingClientRect().top),
               lit: bar.classList.contains('is-lit'),
               op: +getComputedStyle(bar, '::before').opacity };
    });
    t(s.top === 0, `${vp.n}: 下りても上端に残る`);
    t(s.lit && s.op > 0.9, `${vp.n}: 店内では地が敷かれる`);

    /* 帯の文字が、後ろの明るい面に負けていないか（WCAG 4.5:1）。
       見積もりではなく、実際の画素を見る。帯の中身だけを伏せて
       写し取り、文字の入る矩形の中でいちばん明るい点と比べる。 */
    const boxes = await p.evaluate(() => {
      const r = e => { const b = e.getBoundingClientRect();
        return [b.x, b.y, b.width, b.height].map(Math.round); };
      const out = [r(document.querySelector('.topbar__logo')),
                   r(document.querySelector('.topbar__menu')),
                   r(document.getElementById('cart-open'))];
      document.querySelectorAll('.topbar > *').forEach(e => { e.style.visibility = 'hidden'; });
      return out;
    });
    const barH = Math.ceil(await p.evaluate(() =>
      document.querySelector('.topbar').getBoundingClientRect().height));
    const png = (await p.screenshot({ clip: { x: 0, y: 0, width: vp.w, height: barH } }))
      .toString('base64');
    await p.evaluate(() => {
      document.querySelectorAll('.topbar > *').forEach(e => { e.style.visibility = ''; });
    });
    const ratio = await p.evaluate(async ({ png, boxes, w, h }) => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + png; });
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0, w, h);
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = (r, g, b) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      const L1 = lum(233, 224, 206);          /* --paper #E9E0CE */
      let worst = 21;
      for (const [bx, by, bw, bh] of boxes) {
        if (bw <= 0 || bh <= 0) continue;
        const d = cx.getImageData(Math.max(0, bx), Math.max(0, by),
                                  Math.min(bw, w - bx), Math.min(bh, h - by)).data;
        for (let i = 0; i < d.length; i += 4) {
          const L2 = lum(d[i], d[i + 1], d[i + 2]);
          const c = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          if (c < worst) worst = c;
        }
      }
      return worst;
    }, { png, boxes, w: vp.w, h: barH });
    t(ratio >= 4.5, `${vp.n}: 帯の文字が読める（最小 ${ratio.toFixed(2)}:1）`);

    /* --- 寄せ先が帯の下に隠れない --- */
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(400);
    const pad = await p.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop));
    t(pad > 80, `${vp.n}: 寄せる前に帯のぶん空ける（${Math.round(pad)}px）`);

    /* --- 画面の送りは、一瞬で飛ばない --- */
    const glide = await p.evaluate(() => new Promise(res => {
      const seen = [];
      let n = 0;
      const on = () => { seen.push(window.pageYOffset); };
      window.addEventListener('scroll', on, { passive: true });
      document.querySelector('.hero__scroll').click();
      const iv = setInterval(() => {
        if (++n < 60) return;
        clearInterval(iv);
        window.removeEventListener('scroll', on);
        res({ steps: new Set(seen).size, end: Math.round(window.pageYOffset) });
      }, 25);
    }));
    t(glide.steps > 8, `${vp.n}: 節へ送るとき、間をかけて動く（${glide.steps}こま）`);
    s = await p.evaluate(() => {
      const r = document.getElementById('theme-1').getBoundingClientRect();
      const bar = document.querySelector('.topbar').getBoundingClientRect();
      return { top: Math.round(r.top), bar: Math.round(bar.bottom) };
    });
    t(s.top >= s.bar, `${vp.n}: 送った先の看板が帯に隠れない（看板${s.top} / 帯${s.bar}）`);

    /* --- 試し読み。手を止めたら層から降りて描き直される --- */
    const sp = await p.$('.spine[data-book]');
    await sp.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
    await sp.click(); await p.waitForTimeout(1000);
    await p.click('.pull__act--read'); await p.waitForTimeout(900);
    await p.evaluate(() => {
      const st = document.getElementById('peek-stage');
      const r = st.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      st.setPointerCapture = () => {};
      const ev = (ty, id, x, y) => st.dispatchEvent(new PointerEvent(ty,
        { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: id === 1 }));
      ev('pointerdown', 1, cx - 40, cy); ev('pointerdown', 2, cx + 40, cy);
      ev('pointermove', 1, cx - 104, cy + 3); ev('pointermove', 2, cx + 104, cy + 3);
      ev('pointerup', 1, cx - 104, cy + 3); ev('pointerup', 2, cx + 104, cy + 3);
    });
    await p.waitForTimeout(450);
    s = await p.evaluate(() => {
      const pg = document.querySelectorAll('.peek__page')[0];
      return { tf: pg.style.transform,
               flat: pg.style.transform.indexOf('translate3d') === -1,
               zoomed: /scale\((\d+(\.\d+)?)\)/.test(pg.style.transform)
                 && +pg.style.transform.match(/scale\(([\d.]+)\)/)[1] > 1.5,
               shadow: getComputedStyle(pg.querySelector('img')).filter };
    });
    t(s.zoomed, `${vp.n}: つまむと拡大する（${s.tf}）`);
    t(s.flat, `${vp.n}: 手を止めた見開きは層から降りて描き直される`);
    t(s.shadow !== 'none', `${vp.n}: 見開きの影は残す（動かしている間の描き直しに要る）`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(600);

    /* --- 商品詳細の出口は二か所、言葉は同じ --- */
    await p.click('.pull__more'); await p.waitForTimeout(800);
    s = await p.evaluate(() => {
      const bd = document.querySelector('.item__body');
      bd.scrollTop = bd.scrollHeight;
      const cl = document.querySelector('.item__close');
      const end = document.querySelector('.item__end');
      const r = cl.getBoundingClientRect();
      return {
        top: document.querySelector('.item__back span').textContent,
        bottom: cl.querySelector('span').textContent,
        last: end === bd.lastElementChild,
        h: Math.round(r.height),
        barTop: Math.round(document.querySelector('.item__bar').getBoundingClientRect().top),
      };
    });
    t(s.top === '表紙にもどる', `${vp.n}: 上の出口が行き先どおりの言葉（${s.top}）`);
    t(s.bottom === s.top, `${vp.n}: 本文の終わりにも同じ出口`);
    t(s.last, `${vp.n}: その出口が本文のいちばん最後にある`);
    t(s.h >= 44, `${vp.n}: 出口が指で押せる大きさ（${s.h}px）`);
    t(s.barTop === 0, `${vp.n}: 読み進めても上の帯は流れ去らない`);

    await p.click('.item__close'); await p.waitForTimeout(700);
    s = await p.evaluate(() => ({
      item: document.getElementById('item').hidden,
      pull: !document.getElementById('pull').hidden,
      focus: document.activeElement.className,
    }));
    t(s.item && s.pull, `${vp.n}: 閉じると表紙にもどる`);
    t(/pull__more/.test(s.focus), `${vp.n}: 焦点が入口に返る（${s.focus}）`);

    t(errs.length === 0, `${vp.n}: 今回の修正でJSエラーなし${errs.length ? ' — ' + errs[0] : ''}`);
    await p.close();
  }

  /* --- 動きを減らす設定では、送りも遅れも出さない --- */
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => new Promise(res => {
    const seen = [];
    const on = () => seen.push(window.pageYOffset);
    window.addEventListener('scroll', on, { passive: true });
    document.querySelector('.hero__scroll').click();
    setTimeout(() => {
      window.removeEventListener('scroll', on);
      const d = getComputedStyle(document.querySelector('.pull__panel'));
      res({ steps: new Set(seen).size, delay: d.transitionDelay,
            moved: Math.round(window.pageYOffset) > 100 });
    }, 900);
  }));
  t(r.moved && r.steps <= 3, `動きを減らす設定では、送らずに移る（${r.steps}こま）`);
  t(!/0\.1[0-9]s|0\.[2-9]/.test(r.delay), `動きを減らす設定では、遅れも残さない（${r.delay}）`);
  await p.close();
}

/* ---- 6. どの画面幅でも崩れないか --------------------------------- */
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
      document.querySelectorAll('.case .row').forEach(row => {
        const tr = row.getBoundingClientRect();
        row.querySelectorAll('.spine').forEach(e => {
          if (getComputedStyle(e).display === 'none') return;
          const r = e.getBoundingClientRect();
          if ((r.left < tr.left - .5 && r.right > tr.left + .5) ||
              (r.left < tr.right - .5 && r.right > tr.right + .5)) cut++;
          vmax = Math.max(vmax, tr.top - r.top);
        });
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
  await picking(b);
  await screens(b);
  await pages(b);
  await nav(b);
  await fixes(b);
  await widths(b);
  await b.close();
  fail.forEach(l => console.log('  FAIL  ' + l));
  console.log(`${ok.length} passed, ${fail.length} failed`);
  process.exit(fail.length ? 1 : 0);
})();
