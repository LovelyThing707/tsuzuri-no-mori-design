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
/* 本を引き出す・商品詳細・試し読みを見る画面。横長で縦の短いものを必ず含める
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
      document.querySelectorAll('.market').forEach((mk, mi) => {
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
          const sp2 = [...r.querySelectorAll('.spine')].filter(vis);
          sp2.forEach(e => {
            const s = getComputedStyle(e);
            u += px(s.width) + px(s.marginLeft) + px(s.marginRight);
          });
          u += Math.max(0, sp2.length - 1) * px(getComputedStyle(r).columnGap);
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
        /* 参考画像と同じ並び（ひと組の繰り返し）か、まっすぐ立っているか。
           1つめの売り場は背の高い本（すいかのプール）を段に置かない見本なので3冊ひと組 */
        const UNIT = mi === 0 ? ['monte', 'aya', 'kagaku'] : ['monte', 'suika', 'aya', 'kagaku'];
        const inOrder = rows.every(r => {
          const l = [...r.querySelectorAll('.spine')].filter(vis).map(e => e.dataset.book);
          const s0 = UNIT.indexOf(l[0]);
          return l.every((k, i) => k === UNIT[(s0 + i) % UNIT.length]);
        });
        /* 段の高さ。その段で見えている本のうちいちばん背の高い本（120〜300mm に収める）の上に、
           本の高さの 7.3%（少なくとも 16mm）の空き */
        const tierFit = tiers.map(tr => {
          const s2 = [...tr.querySelectorAll('.spine')].filter(vis);
          const tall = Math.max(...s2.map(e => Math.min(300, Math.max(120, px(e.style.getPropertyValue('--h'))))));
          const r = tr.getBoundingClientRect();
          return { tall, h: +r.height.toFixed(2), want: tall + Math.max(16, Math.round(tall * 0.073)),
                   /* 本の天と段の上の端のあいだ（引き出す 3.5mm と天の見える余地） */
                   head: +Math.min(...s2.map(e => e.getBoundingClientRect().top - r.top)).toFixed(1) };
        });
        /* 平置きの倍率。表紙の幅 ÷ 判横(mm)。同じ平台の本はどれも同じ倍率 */
        const cs = getComputedStyle(c);
        const flatK = fl.map(e => px(getComputedStyle(e).width) / px(e.style.getPropertyValue('--w')));
        const flatN = +cs.getPropertyValue('--flat-n'), sumw = +cs.getPropertyValue('--sumw');
        const hmax = +cs.getPropertyValue('--flat-hmax');
        const flatRects = fl.map(e => e.getBoundingClientRect());
        /* 寝かせた本の下に、同じ形の箱を一時的に置いて測る（地の帯、影） */
        const probe = (f, h) => {
          const q = document.createElement('span');
          q.style.cssText = 'position:absolute;left:0;right:0;top:100%;height:' + h;
          f.appendChild(q); const r = q.getBoundingClientRect(); q.remove(); return r;
        };
        /* 本の左右の端は、手前の地の帯の下の角（遠近でいちばん広く写るところ）まで含める */
        const flatBand = fl.map(f => probe(f, 'calc(var(--fe) * var(--flat-band))'));
        /* 表紙の四隅を、計算後の変形で画面に写す。奥の辺と手前の辺の長さの比（台形の比）と、
           写った高さから、寝かせた角度を読む（遠近 p のとき、比 k = p/(p + H・sin 角度)、高さ = H・cos 角度・k） */
        const quads = fl.map(f => {
          const cs = getComputedStyle(f);
          const W = px(cs.width), H = px(cs.height);
          const o = cs.transformOrigin.split(' ').map(parseFloat);
          const M = new DOMMatrix(cs.transform);
          const P = (x, y) => { const q = M.transformPoint(new DOMPoint(x - o[0], y - o[1], 0, 1)); return [q.x / q.w + o[0], q.y / q.w + o[1]]; };
          const tl = P(0, 0), tr = P(W, 0), bl = P(0, H), br = P(W, H);
          const k = (tr[0] - tl[0]) / (br[0] - bl[0]);
          const r = f.getBoundingClientRect();
          return { k, tilt: Math.acos(Math.min(1, (bl[1] - tl[1]) / (H * k))) * 180 / Math.PI,
                   /* 手前の辺は変形の軸（足もと）にあるので、写した姿の下の端 */
                   front: r.bottom, lean: Math.max(Math.abs(tl[0] - bl[0]), Math.abs(tr[0] - br[0])) };
        });
        const postW = px(post.width);
        /* 影は箱の 84% ほどで消える（影の段階の終わり）。見える影の手前の端 */
        const lipTop = c.querySelector('.deck__lip').getBoundingClientRect().top;
        const shadowEnd = fl.map(f => probe(f, 'calc(' + getComputedStyle(f, '::before').height + ' * .84)').bottom - lipTop);
        const upright = sp.every(e => { const t = getComputedStyle(e).transform; return t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'; });
        /* 板の厚みと、箱の内側の面。背景の重ねを1枚ずつに分けて読む */
        const layers = v => {
          const o = []; let d = 0, s = '';
          for (const ch of v) {
            if (ch === '(') d++; else if (ch === ')') d--;
            if (ch === ',' && d === 0) { o.push(s.trim()); s = ''; } else s += ch;
          }
          o.push(s.trim()); return o;
        };
        const baseEl = c.querySelector('.case__base'), floorEl = c.querySelector('.case__floor');
        const bs = getComputedStyle(baseEl), fs = getComputedStyle(floorEl);
        const bImg = layers(bs.backgroundImage), bSize = layers(bs.backgroundSize), bPosY = layers(bs.backgroundPositionY);
        const fi = bImg.findIndex(v => /floor-boards/.test(v));
        const ceil = getComputedStyle(tiers[0], '::after');
        const faceImg = e => { const v = getComputedStyle(e[0], e[1]).backgroundImage; return /post-left/.test(v) && /post-right/.test(v); };
        out.markets.push({
          boardH: [...c.querySelectorAll('.case__board')].map(e => +e.getBoundingClientRect().height.toFixed(2)),
          crownH: +c.querySelector('.case__crown').getBoundingClientRect().height.toFixed(2),
          ceilOn: ceil.content !== 'none' && /case-ceiling/.test(ceil.backgroundImage) && /polygon/.test(ceil.clipPath),
          ceilH: px(ceil.height),
          tierFit, suikaInTiers: sp.some(e => e.dataset.book === 'suika'),
          flatK, flatNcss: flatN, sumw, hmax, winW: window.innerWidth,
          flatVisH: Math.max(...flatRects.map(r => r.height)),
          keystone: quads.map(q => +q.k.toFixed(3)), tilt: quads.map(q => +q.tilt.toFixed(1)),
          fronts: quads.map(q => +q.front.toFixed(1)), lean: Math.max(...quads.map(q => q.lean)),
          flatGaps: flatRects.slice(1).map((r, j) => r.left - flatRects[j].right),
          /* 左右の柱の内側の端と、端の本のあいだ（表紙の端／地の帯の下の角の、柱に近いほう） */
          flatEnds: fl.length ? [
            Math.min(flatRects[0].left, flatBand[0].left) - postW,
            window.innerWidth - postW - Math.max(flatRects[fl.length - 1].right, flatBand[fl.length - 1].right),
            flatRects[0].left - postW, window.innerWidth - postW - flatRects[fl.length - 1].right] : [],
          postW, shadowEnd,
          faces: faceImg([tiers[0], '::before']) && faceImg([deck, '::after']),
          legFaces: ['::before', '::after'].every(ps => {
            const s = getComputedStyle(baseEl, ps); return s.content !== 'none' && px(s.width) >= 8 && /polygon/.test(s.clipPath);
          }),
          /* 中ほどの脚の面の向きは --n（見えている区画の数）で決める */
          cubN: +bs.getPropertyValue('--n'),
          cubVis: [...baseEl.querySelectorAll('.cubby')].filter(e => getComputedStyle(e).display !== 'none').length,
          backPanel: /case-back/.test(bs.backgroundImage),
          floorJoin: fi >= 0 && /floor-boards/.test(fs.backgroundImage) && bSize[fi] === fs.backgroundSize &&
            Math.abs((baseEl.getBoundingClientRect().top + px(bPosY[fi])) - (floorEl.getBoundingClientRect().top + px(fs.backgroundPositionY))) <= 1,
          floorBand: getComputedStyle(floorEl, '::before').content !== 'none',
          h: Math.round(mk.getBoundingClientRect().height),
          caseW: Math.round(cr.width),
          /* 柱が床まで通っているか：柱の下端＝台輪の下端＝床の上端 */
          postBottom: +(cr.top + px(post.top) + px(post.height)).toFixed(1),
          boardBottom: +[...c.querySelectorAll('.case__board')].pop().getBoundingClientRect().bottom.toFixed(1),
          deckRectTop: +dr.top.toFixed(1), deckRectBottom: +dr.bottom.toFixed(1),
          /* 平台の天面の奥行き（背板のぶんを除く） */
          deckH: dr.height - px(getComputedStyle(deck, '::before').top),
          /* 最後の棚板と平台の天面のあいだに見える背板の高さ */
          wallH: /case-back/.test(getComputedStyle(deck).backgroundImage) ? px(getComputedStyle(deck, '::before').top) : 0,
          surfaceZ: +getComputedStyle(deck, '::before').zIndex, postZ: +post.zIndex,
          legs: /post-left.*post-right/.test(getComputedStyle(c.querySelector('.case__base')).backgroundImage),
          baseBottom: +base.bottom.toFixed(1), floorTop: +floor.top.toFixed(1),
          postH: px(post.height), caseH: cr.height,
          deckInCase: c.contains(deck),
          /* 棚板に立っているか：本の底が段の底に揃う */
          bottomGap: +Math.max(...sp.map(e => Math.abs(e.closest('.tier').getBoundingClientRect().bottom - e.getBoundingClientRect().bottom))).toFixed(1),
          overTop: sp.some(e => e.getBoundingClientRect().top < e.closest('.tier').getBoundingClientRect().top - 1),
          fill: Math.round(100 * Math.min(...fills)),
          tiers: tiers.length, dividers: c.querySelectorAll('.bay').length, inOrder, upright,
          gapPx: px(getComputedStyle(rows[0]).columnGap),
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
      /* 参考画像と同じ組み方。本棚の柱と背板は最後の棚板の下も続き、
         その手前に平台の天面がせり出す。平台の下は脚で支え、台輪が床に接する */
      t(Math.abs(k.deckRectTop - k.boardBottom) <= 1 && Math.abs(k.postBottom - k.deckRectBottom) <= 1,
        `${n}: 柱は最後の棚板の下も続き、平台まで下りる (柱${k.postBottom}/平台${k.deckRectBottom})`);
      /* 段の高さは段ごと。見えている本のうちいちばん背の高い本＋空き（A4判 319mm、A5判 226mm） */
      t(k.tierFit.every(f => Math.abs(f.h - f.want * m.mm) <= 1),
        `${n}: 段の高さは、見えている本のうちいちばん背の高い本に空きを足した高さ (${k.tierFit.map(f => f.h + '/' + (f.want * m.mm).toFixed(1)).join('・')}px)`);
      t(k.tierFit.every(f => f.head >= 3.5 * m.mm + 1),
        `${n}: 本の上に、引き出しても段に収まる空きがある (${k.tierFit.map(f => f.head).join('・')}px)`);
      /* 1つめの売り場は、背の高い本を段に置かない見本（2段とも A5判の高さ）。
         2つめの売り場は、背の高い本がある段（A4判の高さ）として残す */
      if (i === 0) t(!k.suikaInTiers && k.tierFit.every(f => f.want === 226),
        `${n}: 段に背の高い本を置かず、2段とも A5判の高さ (${k.tierFit.map(f => f.want).join('・')}mm)`);
      else t(k.suikaInTiers && k.tierFit.every(f => f.want === 319),
        `${n}: 背の高い本（すいかのプール）がある段は A4判の高さ (${k.tierFit.map(f => f.want).join('・')}mm)`);
      t(k.wallH >= 17, `${n}: 最後の棚板と平台の天面のあいだに、本棚の背板が見える (${k.wallH}px)`);
      t(k.surfaceZ > k.postZ, `${n}: 平台の天面は柱より手前にせり出す`);
      t(k.legs && Math.abs(k.baseBottom - k.floorTop) <= 1,
        `${n}: 平台の下は脚で支え、本棚が床に立つ (台輪${k.baseBottom}/床${k.floorTop})`);
      t(k.deckInCase, `${n}: 平台は本棚の下部がせり出したもの（一つの家具）`);
      /* 板は本と同じ縮尺の実寸の厚み。天板 21mm・棚板 24mm。
         画面の高さで決めていたころは、板が細い棒に見えるとのご指摘を受けた */
      t(k.boardH.every(h => Math.abs(h - 24 * m.mm) <= 1),
        `${n}: 棚板の小口は厚さ24mm (${k.boardH.join('・')}px / ${(24 * m.mm).toFixed(1)}px)`);
      t(Math.abs(k.crownH - 21 * m.mm) <= 1, `${n}: 天板の小口は厚さ21mm (${k.crownH}px / ${(21 * m.mm).toFixed(1)}px)`);
      /* 箱の内側が見える。天板の裏、左右の側板の内側の面、平台の下の脚の内側の面 */
      t(k.ceilOn && Math.abs(k.ceilH - 18 * m.mm) <= 1,
        `${n}: いちばん上の段に天板の裏が見え、両端を側板と斜めに留める (${k.ceilH}px)`);
      t(k.faces, `${n}: 段と平台の奥に、左右の側板の内側の面が見える`);
      t(k.legFaces, `${n}: 平台の下の外側の脚に、内側の面が見える`);
      t(k.cubN === k.cubVis, `${n}: 中ほどの脚の面の向きは、見えている区画の数に合う (${k.cubN}/${k.cubVis})`);
      /* 平台の下は抜けた空間。奥に背板、手前は本棚の前の床と一続きの床。黒い帯を敷かない */
      t(k.backPanel && k.floorJoin && !k.floorBand,
        `${n}: 平台の下の奥に背板があり、床は手前の床とつなぎ目なく続く`);
      /* 段の数は以前の構成のとおり。1つめの売り場は2段、2つめは1段 */
      t(k.tiers === (i === 0 ? 2 : 1), `${n}: 段は${i === 0 ? 2 : 1}つ (${k.tiers})`);
      t(k.dividers === 0, `${n}: 棚は仕切らず、画面の幅いっぱいに1続き`);
      t(k.gapPx >= 2, `${n}: 本と本のあいだに、すき間がある (${k.gapPx}px)`);
      /* 390px 幅のスマートフォンで1段およそ17冊。いちばん薄い本（すいかのプール）を
         段に置かない1つめの売り場は、1冊あたりが厚くなるぶん、およそ15冊 */
      if (vp.w === 390) {
        if (i === 0) t(k.perRow.every(x => x >= 14 && x <= 16),
          `${n}: 1段およそ15冊（薄い本を置かないぶん少ない） (${k.perRow.join('・')}冊)`);
        else t(k.perRow.every(x => x >= 16 && x <= 20),
          `${n}: 1段およそ17冊（すき間のぶん少し減る） (${k.perRow.join('・')}冊)`);
      }
      t(k.inOrder, `${n}: 参考画像と同じ並び（ひと組の繰り返し）`);
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
      if (!land) t(k.minW >= 10.5, `${n}: いちばん薄い本も見える幅 (${k.minW.toFixed(1)}px)`);
      /* 平台の冊数。要件定義書 2-3「3〜4冊」。スマートフォンは3冊（表紙を大きくするため）、
         タブレットは4冊、天板の広いパソコンは6〜8冊 */
      const want = vp.w >= 1500 ? 8 : vp.w >= 1100 ? 6 : vp.w >= 600 ? 4 : 3;
      t(k.flatN === want && k.flatNcss === want, `${n}: 平台に${want}冊 (${k.flatK.length}冊)`);
      /* 平置きの倍率はどの画面も背表紙の 0.65 倍。柱のあいだに、並べた本と
         本と本のあいだ（8px）と柱とのあいだ（4px）が収まらない画面だけ、収まるところまで小さくする。
         同じ平台の本は、どれも同じ倍率（本同士は実物どおりの比） */
      const kMin = Math.min(...k.flatK), kMax = Math.max(...k.flatK);
      const kWant = Math.min(0.65 * m.mm, (k.winW - 2 * k.postW - 2 * 4 - (want - 1) * 8) / k.sumw);
      t(kMax - kMin <= 0.003 && Math.abs(kMin - kWant) <= 0.005,
        `${n}: 平置きはどの本も同じ倍率 (${kMin.toFixed(3)}〜${kMax.toFixed(3)} / ${kWant.toFixed(3)}px/mm)`);
      if (vp.w >= 360) t(kMin >= 0.6 * m.mm, `${n}: 平置きの倍率が 0.6px/mm 以上 (${kMin.toFixed(3)})`);
      /* 平台の奥行きは、いちばん背の高い寝かせた本に合わせる（画面の高さによらない）。
         奥行きの大半を本が使う（50deg・遠近 3200px で、いちばん背の高い本の 0.73 倍＋4px） */
      t(Math.abs(k.deckH - (k.hmax * kMin * 0.73 + 4)) <= 1 && k.flatVisH / k.deckH >= 0.8,
        `${n}: 平台の奥行きはいちばん背の高い本に合う (奥行き ${k.deckH.toFixed(1)}px、本 ${k.flatVisH.toFixed(1)}px)`);
      t(k.flatGaps.every(g => g >= 7.5), `${n}: 平置きの本と本のあいだが空いている (${k.flatGaps.map(g => g.toFixed(1)).join('・')}px)`);
      /* 端の本は柱にかからない（柱とのあいだ 4px 以上。地の帯の角は遠近で 1px ほど広がる）。
         本と本のあいだに余裕のある画面では、柱とのあいだも同じ間（天板に間をそろえて置く） */
      t(k.flatEnds[0] >= 2.5 && k.flatEnds[1] >= 2.5,
        `${n}: 平置きの端の本は柱にかからない (左 ${k.flatEnds[0].toFixed(1)}・右 ${k.flatEnds[1].toFixed(1)}px)`);
      if (Math.min(...k.flatGaps) > 8.5) t(k.flatGaps.concat(k.flatEnds.slice(2)).every(g => Math.abs(g - k.flatGaps[0]) <= 1),
        `${n}: 平置きは柱のあいだに同じ間で並ぶ (柱とのあいだ ${k.flatEnds.slice(2).map(g => g.toFixed(1)).join('・')}px、本のあいだ ${k.flatGaps[0].toFixed(1)}px)`);
      /* 寝かせた本の影は、平台の手前の縁にかからない（縁の丸い角の日を消さない） */
      t(k.shadowEnd.every(y => y <= 1),
        `${n}: 平置きの影は平台の手前の縁までで止まる (縁との差 ${k.shadowEnd.map(y => y.toFixed(1)).join('・')}px)`);
      t(k.flatIn, `${n}: 平置きが平台の天板の内側に載っている`);
      t(k.flatTilted, `${n}: 平置きが寝ている`);
      /* 9/30 のご依頼「まっすぐに」「少しだけ角度を手前に起こして」。表紙はほぼ長方形（奥の辺が
         手前の辺の 0.95 倍以上、左右の辺はほとんど傾かない）、傾きは 50deg ほど。本の手前の辺はそろう */
      t(k.keystone.every(v => v >= 0.95 && v <= 1) && k.lean <= 4,
        `${n}: 平置きの表紙はほぼ長方形に写る（奥の辺÷手前の辺 ${k.keystone.join('・')}、左右の辺の傾き ${k.lean.toFixed(1)}px）`);
      t(k.tilt.every(v => Math.abs(v - 50) <= 2), `${n}: 平置きは 50deg ほど寝かせる（${k.tilt.join('・')}deg）`);
      t(Math.max(...k.fronts) - Math.min(...k.fronts) <= 1, `${n}: 平置きの本の手前の辺がそろう（ずれ ${(Math.max(...k.fronts) - Math.min(...k.fronts)).toFixed(1)}px）`);
      t(k.flatEdge > 1, `${n}: 平置きに厚みがある (小口 ${k.flatEdge}px)`);
      t(k.flatFaces === 2, `${n}: 平置きに背と小口の面がある`);
      t(k.flatMinW >= 44, `${n}: 平台のいちばん小さい本も表紙が見え、指で押せる (${k.flatMinW}px)`);
      t(!k.dapple, `${n}: 光の斑（白いモヤ）が無い`);
      /* 本の大きさは、どの画面も同じ 1.0px/mm（スマートフォンもパソコンも同じ厚み・高さ） */
      t(Math.abs(m.mm - 1) < 0.01, `${n}: 本の大きさはどの画面も 1.0px/mm (${m.mm.toFixed(3)})`);
    });
    await p.close();
  }
}

/* ---- 1d. 一画面に収まるか ---------------------------------------
   9/28 のご依頼：すいかのプールを除いた2段で、背表紙の棚と平置きまで、スクロールせずに
   一画面で見られるか。
   9/29 から、下へ読み進めると上の帯が引っ込む（4b）。見方は、標準的な iPhone の画面
   （390x844）で、帯が引っ込み、売り場の看板の列が画面の上端に来たとき。
   下へ送って来たときと、「棚をのぞく」で寄せたとき（看板の列は上端にそろう）の両方で見る。
   平台に寝かせた本と、平台の手前の縁が画面に入っていれば可。
   ほかの大きさのスマートフォンも同じ見方で見る。
   背の低い画面（375x667、Safari で帯が出ているときの 390x664 など）は、まだ収まらない。
   収まらない量を毎回書き出しておく（失敗にはしない）。Safari で帯が引っ込んだときの
   390x750 は、平置きを 54deg で寝かせていたころは収まった。50deg に少し起こして平台が深くなり
   （9/30 のご依頼）、収まり具合は毎回書き出す。
   平置きの倍率（幅 360px 以上で 0.6px/mm 以上）と、端の本が柱にかからないことは、
   ここで見るどの画面でも確かめる。 */
async function oneScreen(b) {
  const FIT = [
    { n: 'iPhone', w: 390, h: 844 }, { n: 'iPhone Pro', w: 393, h: 852 },
    { n: 'Android', w: 412, h: 915 }, { n: 'iPhone Pro Max', w: 430, h: 932 },
  ];
  const INFO = [
    { n: '360x800', w: 360, h: 800 }, { n: '375x667', w: 375, h: 667 },
    { n: 'Safari 390x750', w: 390, h: 750 }, { n: 'Safari 390x664', w: 390, h: 664 },
  ];
  for (const vp of FIT.concat(INFO)) {
    const p = await b.newPage({ viewport: { width: vp.w, height: vp.h }, reducedMotion: 'reduce' });
    await p.goto(URL, { waitUntil: 'networkidle' });
    /* 先頭から下へ送り、看板の列を画面の上端に（帯は途中で引っ込む） */
    await p.evaluate(() => {
      const head = document.querySelector('.market__head');
      window.scrollTo(0, head.getBoundingClientRect().top + window.scrollY);
    });
    /* 帯を引っ込めるのは、送ったあとの次のこま。機械が混んでいると、読み込んだ直後のこまが
       150ms を過ぎることがあり、そのときだけ帯が出たままと測っていた（直す前の版でも同じように落ちる）。
       引っ込むまで待ってから測る。引っ込まなければ、下の検査で落ちる */
    await p.waitForFunction(() => document.querySelector('.topbar').classList.contains('is-away'), null, { timeout: 1500 }).catch(() => {});
    await p.waitForTimeout(150);
    const fit = () => {
      const mk = document.querySelector('.market');
      const bar = document.querySelector('.topbar').getBoundingClientRect();
      const away = document.querySelector('.topbar').classList.contains('is-away');
      const head = mk.querySelector('.market__head').getBoundingClientRect();
      const lip = mk.querySelector('.deck__lip').getBoundingClientRect();
      const post = parseFloat(getComputedStyle(mk.querySelector('.case'), '::before').width);
      /* 寝かせた本の下の端は、表紙の手前に帯で描いた地（紙の束の小口）の下の端 */
      const vis = [...mk.querySelectorAll('.deck__row .flat')].filter(e => getComputedStyle(e).display !== 'none');
      const bands = vis.map(f => {
        const q = document.createElement('span');
        q.style.cssText = 'position:absolute;left:0;right:0;top:100%;height:calc(var(--fe) * var(--flat-band))';
        f.appendChild(q); const r = q.getBoundingClientRect(); q.remove();
        return r;
      });
      const first = vis[0].getBoundingClientRect(), last = vis[vis.length - 1].getBoundingClientRect();
      return { head: +head.top.toFixed(1), bar: +bar.bottom.toFixed(1), away, h: window.innerHeight,
               books: +Math.max(...bands.map(r => r.bottom)).toFixed(1), lip: +lip.bottom.toFixed(1),
               /* 平置きの倍率（表紙の幅 ÷ 判横 mm）のうち小さいほう */
               k: Math.min(...vis.map(f => parseFloat(getComputedStyle(f).width) / parseFloat(f.style.getPropertyValue('--w')))),
               /* 柱と端の本のあいだ（地の帯の角まで含める） */
               ends: [Math.min(first.left, bands[0].left) - post,
                      window.innerWidth - post - Math.max(last.right, bands[bands.length - 1].right)] };
    };
    const r = await p.evaluate(fit);
    /* 帯は引っ込み（下の端が画面の上端より上）、看板の列は画面の上端にある */
    const top = s => s.away && s.bar <= 0.5 && Math.abs(s.head) <= 1;
    const msg = `${vp.n} ${vp.w}x${vp.h}: 下へ送って看板の列を画面の上端に寄せたとき、帯は引っ込み、平台の本と手前の縁が一画面に入る` +
      `（看板 ${r.head}px・帯の下の端 ${r.bar}px、余り 本 ${(r.h - r.books).toFixed(1)}px・縁 ${(r.h - r.lip).toFixed(1)}px）`;
    t(top(r), `${vp.n} ${vp.w}x${vp.h}: 下へ送ると帯は引っ込み、看板の列を画面の上端に置ける（看板 ${r.head}px・帯の下の端 ${r.bar}px）`);
    if (FIT.includes(vp)) t(top(r) && r.books <= r.h && r.lip <= r.h, msg);
    else console.log('  INFO  ' + msg.replace('入る', '入るか'));
    if (vp.w >= 360) t(r.k >= 0.6, `${vp.n} ${vp.w}x${vp.h}: 平置きの倍率が 0.6px/mm 以上 (${r.k.toFixed(3)})`);
    t(r.ends.every(e => e >= 2.5),
      `${vp.n} ${vp.w}x${vp.h}: 平置きの端の本は柱にかからない (左 ${r.ends[0].toFixed(1)}・右 ${r.ends[1].toFixed(1)}px)`);
    await p.close();

    /* 「棚をのぞく」で寄せたとき（読み手が実際にたどる道）。帯は引っ込み、看板の列は画面の上端 */
    const q = await b.newPage({ viewport: { width: vp.w, height: vp.h }, reducedMotion: 'reduce' });
    await q.goto(URL, { waitUntil: 'networkidle' });
    await q.click('.hero__scroll'); await q.waitForTimeout(400);
    const j = await q.evaluate(fit);
    const jmsg = `${vp.n} ${vp.w}x${vp.h}: 「棚をのぞく」で寄せたとき、帯は引っ込み、平台の本と手前の縁が一画面に入る` +
      `（看板 ${j.head}px・帯の下の端 ${j.bar}px、余り 本 ${(j.h - j.books).toFixed(1)}px・縁 ${(j.h - j.lip).toFixed(1)}px）`;
    t(top(j), `${vp.n} ${vp.w}x${vp.h}: 「棚をのぞく」で、帯は引っ込み、看板の列が画面の上端に来る（看板 ${j.head}px・帯の下の端 ${j.bar}px）`);
    if (FIT.includes(vp)) t(top(j) && j.books <= j.h && j.lip <= j.h, jmsg);
    else console.log('  INFO  ' + jmsg.replace('入る', '入るか'));
    await q.close();
  }
}

/* ---- 1e. 段の高さは、画面の幅で見えている本に合わせて変わる -----------
   読み込んだ直後の値は、段に並べる本すべてのうちいちばん背の高い本に合わせたもの
   （tools/gen_page.py が書き込む）。見える本は画面の幅で決まり、scripts/main.js が
   見えている本に合わせて下げる。高さだけが変わるとき（URL バーの出し入れ）は変えない。 */
async function tierFollow(b) {
  const fs = require('fs');
  /* 読み込んだ直後の値（HTML に書いた値）。段に並べる本すべてのうちいちばん背の高い本＋空き */
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const tiers = html.split('<div class="tier"').slice(1).map(s => {
    const own = s.split('</ul>')[0];
    const v = +(own.match(/--tier-h:calc\(var\(--mm\) \* (\d+)\)/) || [])[1];
    const hs = [...own.matchAll(/--h:(\d+);/g)].map(x => Math.min(300, Math.max(120, +x[1])));
    const tall = Math.max(...hs);
    return { v, want: tall + Math.max(16, Math.round(tall * 0.073)) };
  });
  t(tiers.length === 3 && tiers.every(x => x.v === x.want),
    `読み込んだ直後から段の高さが本に合う（HTML の値 ${tiers.map(x => x.v + '/' + x.want).join('・')}mm）`);

  const p = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  /* 読み込み完了（load）でも段を測り直す。それより前に本を差し替えると、
     load の測り直しで段が高くなり、確かめたいこととは別の理由で落ちる */
  await p.waitForFunction(() => document.readyState === 'complete');
  await p.waitForTimeout(300);
  const hOf = () => p.evaluate(() => [...document.querySelectorAll('.tier')].map(e => +e.getBoundingClientRect().height.toFixed(1)));
  const h0 = await hOf();
  /* 高さだけ変わる（URL バーの出し入れ）。段は測り直さない。
     測り直せば段が高くなるように、見えている本を1冊だけ背の高い本にしてから確かめ、あとで戻す */
  const orig = await p.evaluate(() => {
    const s = document.querySelector('.market .tier .spine:not(.is-over)');
    const v = s.style.getPropertyValue('--h'); s.style.setProperty('--h', '297'); return v;
  });
  await p.setViewportSize({ width: 390, height: 664 }); await p.waitForTimeout(400);
  const h1 = await hOf();
  t(h1.join() === h0.join(), `画面の高さだけが変わっても、段は測り直さない (${h0.join('・')} → ${h1.join('・')}px)`);
  await p.evaluate(v => document.querySelector('.market .tier .spine:not(.is-over)').style.setProperty('--h', v), orig);
  /* 1つめの売り場の上の段。隠れている（入りきらない）本を背の高い本にしても、段は低いまま。
     見えている本を背の高い本にすると、幅が変わったときに段が高くなる */
  await p.evaluate(() => {
    const tier = document.querySelector('.market .tier');
    tier.querySelector('.spine.is-over').style.setProperty('--h', '297');
  });
  await p.setViewportSize({ width: 391, height: 664 }); await p.waitForTimeout(400);
  const h2 = await hOf();
  await p.evaluate(() => {
    const tier = document.querySelector('.market .tier');
    tier.querySelector('.spine:not(.is-over)').style.setProperty('--h', '297');
  });
  await p.setViewportSize({ width: 390, height: 664 }); await p.waitForTimeout(400);
  const h3 = await hOf();
  t(Math.abs(h2[0] - 226) <= 1 && Math.abs(h3[0] - 319) <= 1 && Math.abs(h3[1] - 226) <= 1,
    `段の高さは見えている本だけに合わせる（隠れた本が高くても ${h2[0]}px、見えている本が高いと ${h3[0]}px、ほかの段は ${h3[1]}px）`);
  t(errs.length === 0, `段の高さの合わせ直しでJSエラーなし${errs.length ? ' — ' + errs[0] : ''}`);
  await p.close();
}

/* ---- 1c. 光（窓の左上から差す日差し） -----------------------------
   國分様のご指摘「木漏れ日の表現がお送りした画像と大きく違うようです。
   また、白いモヤ？のようなものがところどころに浮いています」。
   参考画像の光は、日が当たるところにだけ現れる。床の左下の日の筋、平台の天面の左、
   寝かせた本の右に落ちる影、植物のそばの天板、左の柱の足もと。
   段の中（背表紙・背板）には何も置かない。
   白いモヤは、段の手前に明るい半透明の層を重ねたことで出た。 */

/* 画面の一部を写して、明るさ（0〜255）の並びにする */
async function lumaOf(p, clip) {
  clip = { x: Math.round(clip.x), y: Math.round(clip.y), width: Math.round(clip.width), height: Math.round(clip.height) };
  const png = (await p.screenshot({ clip })).toString('base64');
  const a = await p.evaluate(async ({ png, w, h }) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + png; });
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data, out = new Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = Math.round(0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]);
    return out;
  }, { png, w: clip.width, h: clip.height });
  return { a, w: clip.width, h: clip.height, x: clip.x, y: clip.y };
}
/* 並びのうち、画面座標の矩形に入るところの平均 */
function meanIn(img, x0, y0, x1, y1, skip) {
  let s = 0, n = 0;
  for (let y = Math.max(0, Math.round(y0 - img.y)); y < Math.min(img.h, Math.round(y1 - img.y)); y++) {
    for (let x = Math.max(0, Math.round(x0 - img.x)); x < Math.min(img.w, Math.round(x1 - img.x)); x++) {
      if (skip && skip(x + img.x, y + img.y)) continue;
      s += img.a[y * img.w + x]; n++;
    }
  }
  return n ? s / n : 0;
}
/* 日差しの層を消す（光だけの差を見るため） */
const LIGHT_OFF = '.case__light,.case__floor::after,.case__crown::after{display:none!important}';

async function light(b) {
  /* 繰り返し検査で「komorebi」の名が戻らないように。以前の光の斑の絵（白いモヤの元）の名前 */
  const fs = require('fs'), root = path.join(__dirname, '..'), named = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(f => {
    const q = path.join(d, f.name);
    if (f.isDirectory()) { if (!/^(\.git|node_modules|tests|dist|fixture-src)$/.test(f.name)) walk(q); return; }
    if (/komorebi/i.test(f.name) ||
        (/\.(css|js|html|py|json|md|sh|txt)$/.test(f.name) && /komorebi/i.test(fs.readFileSync(q, 'utf8'))))
      named.push(path.relative(root, q));
  });
  walk(root);
  t(named.length === 0, `以前の光の斑の絵（komorebi）がどこにも残っていない${named.length ? ' — ' + named.join(',') : ''}`);

  const VIEWS_L = [
    { n: 'small', w: 360, h: 640 },
    { n: 'phone', w: 390, h: 844 },
    { n: 'tablet', w: 834, h: 1112 },
    { n: 'desktop', w: 1440, h: 900 },
    { n: 'wide', w: 1920, h: 955 },
  ];
  for (const vp of VIEWS_L) {
    const p = await b.newPage({ viewport: { width: vp.w, height: vp.h }, reducedMotion: 'reduce' });
    await p.goto(URL, { waitUntil: 'networkidle' });
    await settle(p);
    await p.evaluate(() => document.querySelectorAll('.shelf-hint').forEach(e => e.remove()));

    /* --- 置き方（DOM と計算後のスタイル） --- */
    const m = await p.evaluate(() => {
      const px = v => parseFloat(v) || 0;
      const top = s => { const o = []; let d = 0, c = '';
        for (const ch of s) { if (ch === '(') d++; else if (ch === ')') d--; if (ch === ',' && d === 0) { o.push(c.trim()); c = ''; } else c += ch; }
        if (c.trim()) o.push(c.trim()); return o; };
      const rgba = c => { const v = (c.match(/[\d.]+/g) || []).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
      const lum = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      /* 明るい半透明の色（白・クリーム・灰・淡い金）。白いモヤの元 */
      const pale = s => (s.match(/rgba?\([^)]*\)/g) || []).map(rgba).some(c => c.a > 0.02 && c.a < 0.98 && lum(c) > 110);
      const LIGHTEN = /screen|lighten|dodge|plus-lighter|overlay|soft-light|hard-light/;
      const out = { markets: [] };
      document.querySelectorAll('.market').forEach(mk => {
        const c = mk.querySelector('.case');
        const tiers = [...c.querySelectorAll('.tier')];
        /* 段の内側（柱のあいだ）。本が並ぶ .row の横幅と、段の高さ */
        const boxes = tiers.map(tr => { const r = tr.getBoundingClientRect(), rr = tr.querySelector('.row').getBoundingClientRect();
          return { l: rr.left, r: rr.right, t: r.top, b: r.bottom }; });
        const hit = (x, y, w, h) => boxes.some(q => Math.min(x + w, q.r) - Math.max(x, q.l) >= 2 && Math.min(y + h, q.b) - Math.max(y, q.t) >= 2);
        /* 段に重なる層。段を包む親（売り場・本棚、その外の店内・ページ）は、その ::before／::after
           だけを見る（9/21 の光の斑は、親の ::before が段の手前に重なっていた）。
           段の中は、本の並び（.row）より上に描くものだけを見る。本そのものは見ない */
        const over = [];
        const rowZ = +getComputedStyle(tiers[0].querySelector('.row')).zIndex || 0;
        /* 段より手前に描かれるか。段と共通の親の中で、重なりの順（z-index）を比べる。
           それぞれ、共通の親に至るまででいちばん外側の z-index が順を決める。
           同じ順なら、あとに書かれたもの（親の ::after、段よりあとの要素）が手前 */
        const zUnder = (el, ps, root) => { let z = 0;
          const chain = ps ? [getComputedStyle(el, ps).zIndex] : [];
          for (let a = el; a && a !== root; a = a.parentElement) chain.push(getComputedStyle(a).zIndex);
          chain.forEach(v => { if (v !== 'auto') z = +v; });
          return z; };
        const aboveTiers = (el, ps) => {
          let root = el; while (root && !root.contains(tiers[0])) root = root.parentElement;
          const za = zUnder(el, ps, root), zt = zUnder(tiers[0], null, root);
          if (za !== zt) return za > zt;
          return root === el ? ps === '::after' : !!(tiers[0].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
        };
        const outer = [];
        for (let a = mk.parentElement; a && a !== document.documentElement; a = a.parentElement) outer.push(a);
        [...outer, mk, ...mk.querySelectorAll('*')].forEach(e => {
          if (e.closest('.row')) return;
          const tierSelf = tiers.includes(e);
          const inTier = !tierSelf && tiers.some(tr => tr.contains(e));
          const parent = tiers.some(tr => e !== tr && e.contains(tr));
          const outside = outer.includes(e);
          const hr = e.getBoundingClientRect();
          [null, '::before', '::after'].forEach(ps => {
            if ((parent || tierSelf) && !ps) return;
            const s = getComputedStyle(e, ps);
            if (s.display === 'none' || (ps && s.content === 'none')) return;
            if ((tierSelf || inTier) && !(+s.zIndex > rowZ)) return;
            let x = hr.left, y = hr.top, w = hr.width, h = hr.height;
            if (ps) {
              if (!/absolute|fixed/.test(s.position)) return;
              w = px(s.width); h = px(s.height);
              x = s.left !== 'auto' ? hr.left + px(s.left) : hr.right - px(s.right) - w;
              y = s.top !== 'auto' ? hr.top + px(s.top) : hr.bottom - px(s.bottom) - h;
            }
            if (!hit(x, y, w, h)) return;
            /* 段の中で本の並びより上にあるものは、もともと手前。ほかは重なりの順で見る */
            const above = tierSelf || inTier || aboveTiers(e, ps);
            const paint = s.backgroundColor + ' ' + s.backgroundImage;
            const tag = (e.className || e.tagName) + (ps || '') + ' ' + s.mixBlendMode;
            if ((outside ? above : true) && (pale(paint) || LIGHTEN.test(s.mixBlendMode) || /komorebi/.test(paint))) {
              over.push(tag); return;
            }
            /* 名前や色を変えて戻っても見つかるように。段より手前に描く絵の層（url）と、
               半透明にした層は、どれも段に重ねない（9/21 の光の斑は、絵を .55 の半透明で重ねていた）。
               左上の植物だけは、いちばん上の段の上の端（本の上の空き）に少しかかってよい */
            if (!above) return;
            const bg = s.backgroundImage !== 'none' || rgba(s.backgroundColor).a > 0;
            if (!((+s.opacity < 1 && bg) || /url\(/.test(s.backgroundImage))) return;
            const dip = Math.max(...boxes.map(q => Math.min(x + w, q.r) - Math.max(x, q.l) >= 2 ? Math.min(y + h, q.b) - Math.max(y, q.t) : 0));
            if (!ps && e.classList.contains('case__leaves') && dip <= 10) return;
            over.push(tag + ` opacity ${s.opacity}` + (/url\(/.test(s.backgroundImage) ? ' 絵' : ''));
          });
        });
        /* 日差しの層。どれも色覆い焼きで、その面の木にだけ混ぜる */
        const deck = c.querySelector('.deck'), dr = deck.getBoundingClientRect();
        const lip = c.querySelector('.deck__lip').getBoundingClientRect();
        const lt = c.querySelector('.case__light'), ls = getComputedStyle(lt), lr = lt.getBoundingClientRect();
        const fs = getComputedStyle(c.querySelector('.case__floor'), '::after');
        const cs = getComputedStyle(c.querySelector('.case__crown'), '::after');
        const post = getComputedStyle(c, '::before');
        const sheet = [...document.styleSheets].map(ss => { try { return [...ss.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n');
        /* 寝かせた本の影。本の右（日の当たらない側）へ、濃い影が落ちる */
        const fl = [...deck.querySelectorAll('.flat')].filter(e => getComputedStyle(e).display !== 'none');
        const cast = fl.map(e => top(getComputedStyle(e).boxShadow).some(sh => {
          const col = rgba(sh.match(/rgba?\([^)]*\)/)[0]);
          const len = sh.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).map(px);
          return !/inset/.test(sh) && len[0] > 2 && len[0] > Math.abs(len[1]) && col.a >= 0.5 && lum(col) < 60;
        }));
        /* 影の濃さは、窓に近い左の本ほど濃い（右へ行くほど同じか薄い） */
        const alphas = fl.map(e => { const sh = top(getComputedStyle(e).boxShadow).filter(s => !/inset/.test(s)).pop();
          return +rgba(sh.match(/rgba?\([^)]*\)/)[0]).a.toFixed(2); });
        /* 光を重ねる面の下には暗い木の色を敷く。木の絵が届く前に、光の地図だけが
           灰色の膜になって出ないように（白いモヤと同じ見え方になる） */
        const under = [[deck, '::before'], [c.querySelector('.case__floor'), null], [c.querySelector('.case__crown'), null],
          [c, '::before'], [c.querySelector('.deck__lip'), null], [c.querySelector('.case__base'), null]]
          .map(([e, ps]) => rgba(getComputedStyle(e, ps).backgroundColor));
        out.markets.push({
          over,
          blend: [ls.mixBlendMode, fs.mixBlendMode, cs.mixBlendMode],
          maps: /sunlight-deck/.test(ls.backgroundImage) && /sunlight-floor/.test(fs.backgroundImage) &&
                /sunlight-crown/.test(cs.backgroundImage) && /sunlight-post/.test(post.backgroundImage),
          postDodge: /color-dodge/.test(post.backgroundBlendMode),
          lightZ: +ls.zIndex, surfaceZ: +getComputedStyle(deck, '::before').zIndex, flatZ: +getComputedStyle(c.querySelector('.deck__row')).zIndex,
          /* 日だまりの層は平台の天面の上だけ（段にも縁の下にもかからない） */
          lightIn: lr.top >= dr.top + px(getComputedStyle(deck, '::before').top) - 1 && lr.bottom <= lip.top + 1 && lr.height > 20,
          cast: cast.every(Boolean) && cast.length > 0,
          alphas,
          castGraded: alphas.every((a, j) => j === 0 || a <= alphas[j - 1]) && (alphas.length < 2 || alphas[0] > alphas[alphas.length - 1]),
          under: under.every(col => col.a === 1 && lum(col) < 90),
          sheetKomo: /komorebi/.test(sheet),
        });
      });
      return out;
    });
    m.markets.forEach((k, i) => {
      const n = `${vp.n} 売り場${i + 1}`;
      t(k.over.length === 0, `${n}: 段の手前に明るい半透明の層や光の層を重ねない（白いモヤ）${k.over.length ? ' — ' + k.over.join(' / ') : ''}`);
      t(k.blend.every(v => v === 'color-dodge') && k.maps && k.postDodge,
        `${n}: 日差しは光の地図を色覆い焼きで木に重ねる（明るい膜を重ねない） (${k.blend.join('・')})`);
      t(k.lightIn && k.lightZ >= k.surfaceZ && k.lightZ < k.flatZ,
        `${n}: 平台の日だまりは天面の上だけに置き、本の下になる (z ${k.surfaceZ}/${k.lightZ}/${k.flatZ})`);
      t(k.cast, `${n}: 寝かせた本は、どれも右へ影を落とす`);
      t(k.castGraded, `${n}: 本の影は窓に近い左の本ほど濃い (${k.alphas.join('・')})`);
      t(k.under, `${n}: 光を重ねる面の下に暗い木の色を敷く（木の絵が届く前に、光の地図が灰色の膜で出ない）`);
      t(!k.sheetKomo, `${n}: スタイルに以前の光の斑（komorebi）が無い`);
    });

    /* --- 画素で見る。日差しの層を点けたときと消したときの差 --- */
    /* 上の帯の下に来るように送る。帯は固定で、送ったあとに地が敷かれる */
    await p.evaluate(() => {
      const deck = document.querySelector('.market .case .deck');
      const bar = document.querySelector('.topbar').getBoundingClientRect().bottom;
      window.scrollTo(0, deck.getBoundingClientRect().top + window.scrollY - bar - 12);
    });
    await p.waitForTimeout(250);
    const g = await p.evaluate(() => {
      const c = document.querySelector('.market .case');
      const deck = c.querySelector('.deck');
      return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
        const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
        const dr = R(deck), wall = parseFloat(getComputedStyle(deck, '::before').top) || 0;
        res({ W: window.innerWidth, deck: dr, surf: dr.t + wall, floor: R(c.querySelector('.case__floor')),
              flats: [...deck.querySelectorAll('.flat')].filter(e => getComputedStyle(e).display !== 'none').map(R) });
      })));
    });
    const W = g.W, clip = { x: 0, y: g.surf, width: W, height: Math.min(vp.h - g.surf, g.floor.b - g.surf) };
    const on = await lumaOf(p, clip);
    const off1 = await p.addStyleTag({ content: LIGHT_OFF });
    await p.waitForTimeout(80);
    const off = await lumaOf(p, clip);
    await off1.evaluate(e => e.remove());
    await p.waitForTimeout(80);
    const lift = { a: on.a.map((v, i) => v - off.a[i]), w: on.w, h: on.h, x: on.x, y: on.y };
    /* 本の上（表紙）は除く。本は日だまりより上に描くので、もともと差は出ない */
    const onBook = (x, y) => g.flats.some(f => x >= f.l - 1 && x <= f.r + 1 && y >= f.t - 1 && y <= f.b + 1);
    const fy0 = g.floor.t + 2, fy1 = g.floor.t + g.floor.h * .78;
    const floorL = meanIn(lift, 0, fy0, Math.max(40, W * .1), fy1), floorR = meanIn(lift, W * .6, fy0, W, fy1);
    t(floorL >= 8 && floorR <= 1,
      `${vp.n}: 床は左下にだけ日の筋が落ちる（明るさの上がり 左 ${floorL.toFixed(1)} / 右 ${floorR.toFixed(1)}）`);
    /* 筋は隅に詰まらず、幅の1割強まで斜めに伸びる（広い画面でも見える）。中ほどには届かない */
    const floorM = meanIn(lift, W * .08, fy0, W * .14, fy1), floorC = meanIn(lift, W * .25, fy0, W * .6, fy1);
    t(floorM >= 12 && floorC <= 1,
      `${vp.n}: 床の日の筋は幅の1割強まで伸び、中ほどには届かない（明るさの上がり ${floorM.toFixed(1)} / ${floorC.toFixed(1)}）`);
    const dy0 = g.surf + 2, dy1 = g.deck.b - 1;
    const deckL = meanIn(lift, 0, dy0, W * .2, dy1, onBook), deckR = meanIn(lift, W * .7, dy0, W, dy1, onBook);
    t(deckL >= 10 && deckR <= 1,
      `${vp.n}: 平台の天面は左に日だまり、右には届かない（明るさの上がり 左 ${deckL.toFixed(1)} / 右 ${deckR.toFixed(1)}）`);
    /* 手前の帯（本の手前の天面）。左の端が明るく、右ほど暗い */
    const fb = Math.max(...g.flats.map(f => f.b)) + 3;
    const stripL = meanIn(on, 0, fb, W * .15, dy1), stripR = meanIn(on, W * .85, fb, W, dy1);
    t(stripL >= stripR * 1.35,
      `${vp.n}: 平台の天面は左が明るく、右ほど落ち着く（本の手前 左 ${stripL.toFixed(0)} / 右 ${stripR.toFixed(0)}）`);
    /* 日の当たる1冊目の本。右のきわは影、左のきわは日なた */
    const f0 = g.flats[0], sy0 = f0.t + f0.h * .35, sy1 = f0.t + f0.h * .85;
    const shR = meanIn(on, f0.r + 1, sy0, f0.r + 5, sy1), shL = meanIn(on, f0.l - 5, sy0, f0.l - 1, sy1);
    t(shR <= shL * .75, `${vp.n}: 日なたの本は右へ影を落とす（本の右 ${shR.toFixed(0)} / 左 ${shL.toFixed(0)}）`);
    /* 日の当たらない右の天面は、参考画像のとおり落ち着いた暗さ（明るさ 70〜80）。沈めすぎない */
    t(stripR >= 55 && stripR <= 100, `${vp.n}: 日の当たらない右の天面は、沈めすぎない（本の手前 右 ${stripR.toFixed(0)}）`);
    /* 本の右のきわの影。参考画像では明るさ 35〜45（日なたの1冊目は 50 前後）。
       濃すぎて穴のように見えず、消えもしない */
    const edges = g.flats.map((f, j) => {
      const nx = j + 1 < g.flats.length ? g.flats[j + 1].l : W;
      return nx - f.r < 7 ? null : meanIn(on, f.r + 1, f.t + f.h * .35, f.r + 5, f.t + f.h * .85);
    }).filter(v => v !== null);
    t(edges.length > 0 && edges.every(v => v >= 25 && v <= 72),
      `${vp.n}: 本の右のきわの影は濃すぎず、消えもしない（${edges.map(v => v.toFixed(0)).join('・')}）`);

    /* 左の柱の足もと。平台に落ちる日が柱の下のほうにも当たり、日の当たらない右の柱より明るい
       （参考画像で左 121〜146、右 69〜72） */
    await p.evaluate(() => {
      const deck = document.querySelector('.market .case .deck');
      const surf = deck.getBoundingClientRect().top + (parseFloat(getComputedStyle(deck, '::before').top) || 0);
      window.scrollTo(0, surf + window.scrollY - window.innerHeight * .6);
    });
    await p.waitForTimeout(250);
    const pf = await p.evaluate(() => {
      const c = document.querySelector('.market .case'), deck = c.querySelector('.deck');
      return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
        const cr = c.getBoundingClientRect();
        res({ surf: deck.getBoundingClientRect().top + (parseFloat(getComputedStyle(deck, '::before').top) || 0),
              pw: parseFloat(getComputedStyle(c, '::before').width), l: cr.left, r: cr.right });
      })));
    });
    const foot = await lumaOf(p, { x: 0, y: pf.surf - 50, width: W, height: 50 });
    const postL = meanIn(foot, pf.l, pf.surf - 50, pf.l + pf.pw * .6, pf.surf);
    const postR = meanIn(foot, pf.r - pf.pw * .6, pf.surf - 50, pf.r, pf.surf);
    t(postL >= postR * 1.4 && postL <= 160,
      `${vp.n}: 左の柱の足もとは平台からの日を受け、右の柱より明るい（左 ${postL.toFixed(0)} / 右 ${postR.toFixed(0)}）`);

    /* 段の中（背表紙・背板）は、日差しの層を点けても消しても同じ */
    await p.evaluate(() => {
      const tr = [...document.querySelectorAll('.market .case .tier')].pop();
      const bar = document.querySelector('.topbar').getBoundingClientRect().bottom;
      window.scrollTo(0, tr.getBoundingClientRect().top + window.scrollY - bar - 12);
    });
    await p.waitForTimeout(250);
    const tb = await p.evaluate(() => {
      const tr = [...document.querySelectorAll('.market .case .tier')].pop();
      return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
        const r = tr.getBoundingClientRect(), rr = tr.querySelector('.row').getBoundingClientRect();
        res({ x: rr.left, y: r.top, width: rr.width, height: Math.min(r.height, window.innerHeight - r.top) });
      })));
    });
    const tOn = await lumaOf(p, tb);
    const off2 = await p.addStyleTag({ content: LIGHT_OFF });
    await p.waitForTimeout(80);
    const tOff = await lumaOf(p, tb);
    await off2.evaluate(e => e.remove());
    /* 色覆い焼きの層があると、本棚は一枚にまとめて描き直され、文字の縁などがわずかに
       揺れる（上下どちらにも ±10 ほど、ごく一部）。明るさが上がる画素の数と平均で見る */
    let up = 0, sum = 0;
    tOn.a.forEach((v, i) => { const d = v - tOff.a[i]; sum += d; if (d > 6) up++; });
    const tMean = sum / tOn.a.length, tUp = up / tOn.a.length;
    t(tMean <= 0.5 && tUp < 0.005,
      `${vp.n}: 背表紙と段の背板には日差しを置かない（平均の差 ${tMean.toFixed(2)}、明るくなった画素 ${(tUp * 100).toFixed(2)}%）`);
    await p.close();
  }
}

/* ---- 本を引き出す（1回目）と商品詳細（2回目）を確かめる手続き -------------
   國分様のご依頼。棚の本をタップすると、その本が自分の場所から手前へ引き出され、途中で止まる（1回目）。
   引き出した本をもう一度タップすると商品詳細（2回目）。
   それ以外のところをタップすると、本は棚へ押しもどされる。指を離しただけでは商品詳細へ進まない。
   9/30 のご依頼から、書名などの文字は添えず、平置きの本はタップするとそのまま商品詳細へ進む。 */

/* 指の操作。ブラウザに本物のタッチを送る（縦に動かせばページが送られ、横なら送られない） */
async function touchTap(cdp, p, x, y, hold = 40) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await p.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function touchSlide(cdp, p, pts, step = 16) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
  await p.waitForTimeout(30);
  for (const q of pts.slice(1)) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q[0], y: q[1] }] });
    await p.waitForTimeout(step);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/* 売り場 m（0 から）の看板を、上の帯のすぐ下へ */
async function toMarket(p, m) {
  await p.evaluate(m => {
    document.querySelectorAll('.will-reveal').forEach(e => e.classList.add('is-in'));
    const mk = document.querySelectorAll('.market')[m];
    const bar = document.querySelector('.topbar').getBoundingClientRect().height;
    window.scrollTo(0, mk.querySelector('.market__head').getBoundingClientRect().top + window.scrollY - bar);
  }, m);
  await p.waitForTimeout(500);
  /* 売り場が現れる動き（下から 18px、1 秒ほど）が終わるまで待つ。途中で測ると本の位置が数 px ずれ、
     引き出す大きさ（本の位置で決まる）が測ったときと合わなくなる */
  await p.waitForFunction(() => !document.getAnimations().some(a => {
    const e = a.effect && a.effect.target;
    return e && e.classList && (e.classList.contains('will-reveal') || e.classList.contains('case')) && a.playState === 'running';
  }), null, { timeout: 2000 }).catch(() => {});
}
/* 売り場 m の段 ti（省けば上から探す）で、見えている本 k（指で押す点は、本の下の端から 40px 上）。
   k を「monte:2」のように書くと、その本の2冊目。「mid」は、画面の左右の中央にいちばん近い本、「last」は列の右の端の本。
   その段の下の棚板の上の端（boardTop）と、引き出した本が上下に出てよい範囲（段の上の板の上の端 bandTop、
   下の棚板の下の端 bandBot）、看板の下の端（headBot）も返す */
const spineAt = (p, m, k, ti) => p.evaluate(([m, k, ti]) => {
  const mk = document.querySelectorAll('.market')[m];
  const scope = ti === null ? mk : mk.querySelectorAll('.case .tier')[ti];
  const [kk, nth] = (k || '').split(':');
  const vis = [...scope.querySelectorAll('.case .row .spine')].filter(e => getComputedStyle(e).display !== 'none');
  const cx = e => { const r = e.getBoundingClientRect(); return r.left + r.width / 2; };
  const e = kk === 'mid' ? vis.slice().sort((a, b) => Math.abs(cx(a) - innerWidth / 2) - Math.abs(cx(b) - innerWidth / 2))[0]
    : kk === 'last' ? vis.filter(e => e.getBoundingClientRect().left < innerWidth).pop()
    : vis.filter(e => !kk || e.dataset.book === kk)[(+nth || 1) - 1];
  const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  const tier = e.closest('.tier');
  const board = tier.nextElementSibling.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.bottom - 40, l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height,
           k: e.dataset.book, t_mm: Math.max(parseFloat(cs.getPropertyValue('--t')), 5), kw: parseFloat(cs.getPropertyValue('--kw')),
           mm: parseFloat(cs.getPropertyValue('--mm')) || 1,
           boardTop: board.top, bandTop: tier.previousElementSibling.getBoundingClientRect().top, bandBot: board.bottom,
           headBot: mk.querySelector('.market__head').getBoundingClientRect().bottom };
}, [m, k, ti === undefined ? null : ti]);
/* 引き出す・棚へ押しもどす動きが終わるまで待つ。
   決め打ちの待ち時間だと、機械が混んでいるときだけ落ちる（後ろをぼかす層は描くのが重い） */
async function still(p, ms = 4000) {
  await p.waitForFunction(() => {
    const f = document.getElementById('focus');
    const moving = document.getAnimations().some(a => {
      const e = a.effect && a.effect.target;
      return e && e.closest && e.closest('#focus') && a.playState === 'running';
    });
    return !moving && !f.classList.contains('is-leaving');
  }, null, { timeout: ms }).catch(() => {});
}
/* 1回目の層（#focus）と商品詳細の様子。動きが止まってから読む */
const tapState = async p => { await still(p); return p.evaluate(() => {
  const f = document.getElementById('focus'), it = document.getElementById('item');
  const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
  const box = f.querySelector('.focus__book'), node = box.querySelector('.spine');
  const cast = f.querySelector('.focus__cast'), hole = f.querySelector('.focus__slot');
  const pad = getComputedStyle(box, '::before');
  const a = document.activeElement;
  const sc = f.querySelector('.focus__scrim');
  return {
    open: !f.hidden, leaving: f.classList.contains('is-leaving'), item: !it.hidden,
    pull: !!document.querySelector('#pull, .pull, .pull-fly'),
    scale: f.dataset.scale ? +f.dataset.scale : null, pullK: f.dataset.pull ? +f.dataset.pull : null,
    clamp: f.dataset.clamp || '', out: f.classList.contains('is-out'),
    box: f.hidden ? null : R(box), node: node ? R(node) : null,
    nodeMm: node ? parseFloat(node.style.getPropertyValue('--mm')) : null,
    nodeFilter: node ? getComputedStyle(node).filter : null,
    tf: getComputedStyle(box).transform, nodeTf: node ? getComputedStyle(node).transform : null,
    padW: f.hidden ? 0 : box.getBoundingClientRect().width - parseFloat(pad.left) - parseFloat(pad.right),
    padH: f.hidden ? 0 : box.getBoundingClientRect().height - parseFloat(pad.top) - parseFloat(pad.bottom),
    /* 添える文字（書名・著者名・「この本のページへ」）は無い */
    caption: f.querySelectorAll('.focus__cap, .focus__title, .focus__author, .focus__go, p').length + f.textContent.replace('棚にもどる', '').trim().length,
    /* 箱の横の面。見える側の面だけがある */
    faces: f.hidden ? [] : [...box.querySelectorAll('.focus__face')].map(e => Object.assign(R(e), { side: e.className.replace(/.*is-/, '') })),
    cast: !!cast && !f.hidden && getComputedStyle(cast).filter !== 'none' && +getComputedStyle(cast).opacity > 0.9 &&
          cast.getBoundingClientRect().width > 0,
    hole: f.hidden ? null : Object.assign(R(hole), { op: +getComputedStyle(hole).opacity }),
    label: box.getAttribute('aria-label'), name: f.getAttribute('aria-label'),
    scrim: getComputedStyle(sc).opacity, blur: getComputedStyle(sc).backdropFilter,
    itemTitle: it.querySelector('.item__title').textContent, itemCover: it.querySelector('.item__img').getAttribute('src'),
    taken: document.querySelectorAll('.is-taken').length,
    tag: document.querySelector('.pick-tag').classList.contains('is-on'),
    active: a === document.body ? 'body' : (a.getAttribute('aria-label') || a.className),
    activeInFocus: f.contains(a), activeSpine: !!(a.closest && a.closest('.case .spine, .case .flat')),
    /* 焦点の枠は、ボタン（止まったときの背表紙と同じ大きさ）の上に重ねて描く */
    ring: f.hidden || getComputedStyle(box, '::after').visibility !== 'visible' ? 'none' : getComputedStyle(box, '::after').borderTopStyle,
    y: Math.round(window.scrollY), hlen: history.length, hstate: history.state, href: location.href,
    vw: document.documentElement.clientWidth, vh: window.innerHeight,
  };
}); };
/* 引き出した本の姿（9/30 のご依頼）。本は箱として手前へ滑り出る。止まった姿を、棚の本の輪郭 sp と比べる。
   背表紙は、棚の本を、ある一点（消える点）を中心に k 倍した位置にある（近づいたぶんだけ大きく見える）。
     消える点 … 左右は画面の中央。ただし見える側の本の縁から 60px より近ければ、そこまで離れる
               （画面の中央の本も、横の面が見える）。背表紙の左右の端は、そこから棚の本の端へ向かう線の上
     高さ     … 本の中ほど。頭が上がるぶんと足もとが下がるぶんは同じ。段に収まらないときだけ上か下へ寄り、
               そのときは頭か足もとが段の縁に着いていて、上下どちらかへ伸びるぶんは全体の 65% まで
     段       … 頭は段の上の板（いちばん上の段では天板）の上の端より 4px 以上下、
               足もとは下の棚板の下の端より上（棚から落ちたり、看板へ飛び出したりして見えない）
     背表紙   … 棚の上の 1.2〜1.35 倍。控えてよいのは、次のときだけ（data-clamp に書かれたわけを、ここで確かめる）
                 band … 頭か足もとが、段の縁に着いている
                 wide … 広い画面の端の本。見える横の面の長さが、引き出した長さの半分
                 edge … 背表紙のどこかの縁が、画面の端の空き（左右 4px・上下 12px）に着いている
               どれも 1.02 倍以上
     後ろ     … 見えている横の面の奥の端は、棚の本の輪郭にそろう（1px 以内。後ろはまだ棚の中）
     面       … 横の面はちょうど1つ。画面の中央より左の本（中央にかかる本も）は右の面、右の本は左の面。
               長さは背表紙の幅の 25% 以上
     長さ     … 引き出すのは、どの本も奥行きの 75% */
function pose3d(s, sp) {
  const k = s.scale, n = s.node, vw = s.vw, vh = s.vh;
  const right = (sp.l + sp.r) / 2 <= vw / 2;
  const vx = right ? Math.max(vw / 2, sp.r + 60) : Math.min(vw / 2, sp.l - 60);
  const fx = x => vx + (x - vx) * k;
  const dev = Math.max(Math.abs(n.l - fx(sp.l)), Math.abs(n.r - fx(sp.r)));
  const rise = sp.t - n.t, drop = n.b - sp.b;
  const f = rise / (rise + drop);
  const atTop = Math.abs(n.t - (sp.bandTop + 4)) <= 0.6, atBot = Math.abs(n.b - sp.bandBot) <= 0.6;
  const inBand = n.t >= sp.bandTop + 4 - 0.6 && n.b <= sp.bandBot + 0.6;
  const edgeX = n.l <= 4.6 || n.r >= vw - 4.6, edgeY = n.t <= 12.6 || n.b >= vh - 12.6;
  const midOk = Math.abs(rise - drop) <= 0.6 || ((atTop || atBot || edgeY) && f >= 0.345 && f <= 0.655);
  const side = s.faces.length === 1 ? s.faces[0] : null;
  const faceLen = side ? side.w : 0;
  const Z = s.pullK * sp.kw * (sp.mm || 1) * k;
  const why = { '': true, band: atTop || atBot, wide: Math.abs(faceLen - 0.5 * Z) <= 1, edge: edgeX || edgeY };
  const scaleOk = Math.abs(n.w / sp.w - k) <= 0.012 && Math.abs(n.h / sp.h - k) <= 0.012 && k <= 1.35 &&
    (s.clamp ? why[s.clamp] === true && k >= 1.02 : k >= 1.2);
  const pullOk = s.pullK >= 0.7 && s.pullK <= 0.8;
  const facesOk = !!side && side.side === (right ? 'right' : 'left');
  const back = s.faces.map(f => (f.side === 'right' ? f.r - sp.r : f.l - sp.l));
  const backOk = back.length > 0 && back.every(v => Math.abs(v) <= 1);
  const sideOk = facesOk && faceLen >= 0.25 * n.w && Math.abs(faceLen - (right ? vx - sp.r : sp.l - vx) * (k - 1)) <= 1;
  const all = [n, ...s.faces];
  const onScreen = n.l >= 3.5 && n.r <= vw - 3.5 && n.t >= 11.5 && n.b <= vh - 11.5 &&
    all.every(r => r.l >= -0.5 && r.r <= vw + 0.5 && r.t >= -0.5 && r.b <= vh + 0.5);
  const drift = (n.l + n.r) / 2 - (sp.l + sp.r) / 2;
  const outward = Math.sign(drift) === Math.sign((sp.l + sp.r) / 2 - vx);
  return { vx, dev, rise, drop, f, midOk, inBand, atTop, atBot, scaleOk, pullOk, facesOk, back, backOk, side, faceLen, sideOk,
           onScreen, drift, outward, Z };
}

/* ---- 1b. 指でなぞって選ぶ --------------------------------------
   なぞるのは残す（指の下の本が少し出て、書名の札が出る）。
   指を離すと、その本を棚から引き出す（1回目）だけ。商品詳細へは進まない。 */
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
    const h0 = history.length;
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
    /* 離す直前の、持ち上がった本の姿。引き出す動きはこの姿から始まる（一度沈んでから出てこない）。
       持ち上がる動きが始まるのは数コマ後なので、持ち上がるまで待ってから離す */
    const zb = books[books.length - 2];
    const liftOf = () => new DOMMatrix(getComputedStyle(zb).transform).f;
    for (let i = 0; i < 40 && liftOf() > -3; i++) await wait(16);
    const lifted = { t: zb.getBoundingClientRect().top, dy: liftOf() };
    ev('pointerup', zx);
    const an = document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#focus'));
    an.forEach(a => { a.pause(); a.currentTime = 0; });
    const bx = document.querySelector('.focus__book .spine');
    const start = bx ? bx.getBoundingClientRect().top : null;
    an.forEach(a => a.play());
    await wait(900);
    return { first, second, focus: !document.getElementById('focus').hidden,
             item: !document.getElementById('item').hidden, hist: history.length - h0,
             title: document.getElementById('focus').getAttribute('aria-label'), off: !tag().classList.contains('is-on'),
             taken: books[books.length - 2].classList.contains('is-taken'), lifted, start };
  });
  t(r.first.on && r.first.text === r.first.want, `なぞる: 指の下の本の書名が出る (${r.first.text})`);
  t(r.first.lifted, 'なぞる: 指の下の本が棚から少し出る');
  t(r.second.text === r.second.want && r.second.one === 1, `なぞる: 指を動かすと隣の本へ移る (${r.second.text})`);
  t(r.focus && r.title === r.second.want && r.taken, `なぞる: 指を離すと、その本を棚から引き出す (${r.title})`);
  t(!r.item && r.hist === 0, 'なぞる: 指を離しても商品詳細へは進まない（履歴も増えない）');
  t(r.lifted.dy < -1 && r.start !== null && Math.abs(r.start - r.lifted.t) <= 0.6,
    `なぞる: 引き出す動きは、持ち上がった姿から始まる（持ち上がり ${r.lifted.dy.toFixed(1)}px、始まりのずれ ${r.start === null ? '—' : (r.start - r.lifted.t).toFixed(1)}px）`);
  t(r.off, 'なぞる: 引き出したあと書名の札は消える');
  t(errs.length === 0, `なぞる: スクリプトの誤りなし${errs.length ? ' — ' + errs[0] : ''}`);
  await p.close();
}

/* ---- 2. 本を引き出す（指） ------------------------------------------
   スマートフォン2機種（390x844・375x667）で、本物のタッチを送って確かめる */
async function tapFlow(b) {
  for (const vp of [{ n: 'phone', w: 390, h: 844 }, { n: 'phone-short', w: 375, h: 667 }]) {
    const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { try { localStorage.setItem('shelf-hint', '1'); } catch (e) {} });
    await p.goto(URL, { waitUntil: 'networkidle' });
    const cdp = await ctx.newCDPSession(p);
    const BOOKS = await p.evaluate(() => JSON.parse(document.getElementById('book-data').textContent));
    const n = vp.n;

    /* 「すべて見る」と、表紙＋簡易情報の画面（.pull）は無い */
    const gone = await p.evaluate(() => ({
      all: document.body.innerText.includes('すべて見る') || document.documentElement.outerHTML.includes('すべて見る'),
      link: document.querySelectorAll('.market__all').length,
      pull: document.querySelectorAll('#pull, .pull, [class^="pull__"], .pull-fly').length,
      cap: document.querySelectorAll('.focus__cap, .focus__title, .focus__author, .focus__go, .focus__cover').length,
    }));
    t(!gone.all && gone.link === 0, `${n}: 「すべて見る」が無い`);
    t(gone.pull === 0, `${n}: 表紙＋簡易情報の画面（引き抜き）が無い`);
    t(gone.cap === 0, `${n}: 引き出した本に添える書名・著者名・「この本のページへ」の仕掛けが無い`);

    await toMarket(p, 0);

    /* --- 1回目：背表紙をタップすると、その本が自分の場所から手前へ引き出され、途中で止まる。
       商品詳細へは進まない。上の段・下の段・背の高い本（すいかのプール）・画面の中央の本・列の右の端の本で --- */
    for (const [m, k0, ti] of [[0, 'monte', 0], [0, 'aya', 0], [0, 'kagaku', 1], [0, 'monte', 1], [1, 'suika', 0], [0, 'mid', 1], [0, 'mid', 0], [0, 'last', 1]]) {
      await toMarket(p, m);
      const sp = await spineAt(p, m, k0, ti);
      const k = sp.k;
      const before = await tapState(p);
      await touchTap(cdp, p, sp.x, sp.y);
      await p.waitForTimeout(750);
      const s = await tapState(p);
      const nm = `${n} ${k0 === 'mid' ? '画面の中央の本（' + k + '）' : k0 === 'last' ? '列の右の端の本（' + k + '）' : k}${ti ? '（下の段）' : ''}`;
      t(s.open && !s.item && !s.pull, `${nm}: タップすると本が棚から引き出される（商品詳細へは進まない）`);
      t(s.hlen === before.hlen && s.href === before.href, `${nm}: 1回目では履歴を積まない`);
      /* 本は箱として手前へ滑り出て、後ろはまだ棚の中にある（9/30 のご依頼）。
         大きさは近づいたぶんだけ（1.2〜1.35 倍）。本は自分の段から出ない */
      const g = pose3d(s, sp);
      t(g.scaleOk && Math.abs(s.nodeMm - s.scale) <= 0.001,
        `${nm}: 背表紙は近づいたぶんだけ大きく見える（${s.scale}倍${s.clamp ? '、控えたわけ ' + s.clamp : ''}。幅 ${(s.node.w / sp.w).toFixed(3)}倍・高さ ${(s.node.h / sp.h).toFixed(3)}倍）`);
      t(g.dev <= 1 && g.outward,
        `${nm}: 自分の列から、消える点と反対の側へ少しずれるだけ（ずれ ${g.drift.toFixed(1)}px、遠近の線からの外れ ${g.dev.toFixed(2)}px）`);
      t(g.inBand && g.midOk && s.node.t >= sp.headBot + 3.5,
        `${nm}: 上下へはほぼ同じだけ大きくなり、自分の段に収まる（頭 +${g.rise.toFixed(1)}px・足もと +${g.drop.toFixed(1)}px。` +
        `足もとは棚板の下の端まで ${(sp.bandBot - s.node.b).toFixed(1)}px、頭は看板まで ${(s.node.t - sp.headBot).toFixed(1)}px）`);
      t(g.pullOk, `${nm}: 本の奥行きの 70〜80% を引き出し、後ろは棚に残る（${(s.pullK * 100).toFixed(0)}%）`);
      t(g.backOk,
        `${nm}: 見えている面の奥の端は、棚の本の輪郭にそろう（${s.faces.map((f, i) => f.side + ' ' + g.back[i].toFixed(2) + 'px').join('・') || '面なし'}）`);
      t(g.facesOk && g.sideOk,
        `${nm}: 消える点の側の横の面（表紙）が、背表紙の幅の 25% 以上の長さで見える（${s.faces.map(f => f.side + ' ' + f.w.toFixed(1) + 'x' + f.h.toFixed(1)).join('・') || '面なし'}、背表紙の幅 ${s.node.w.toFixed(1)}px）`);
      t(g.onScreen, `${nm}: 引き出した本が画面に収まる (${s.node.l.toFixed(0)},${s.node.t.toFixed(0)} ${s.node.w.toFixed(0)}x${s.node.h.toFixed(0)})`);
      t(s.tf === 'none' && s.nodeTf === 'none' && s.nodeFilter === 'none',
        `${nm}: 止まった背表紙は変形なしで描く（写真の細かさのまま）。ピントが合っている`);
      t(s.taken === 1, `${nm}: 棚のその場所は空いて見える`);
      /* 棚は読めるまま（ぼかしは軽く）。本がこの棚から出てきたことが分かるように */
      const bl = /blur\(([\d.]+)px\)/.exec(s.blur), br = /brightness\(([\d.]+)\)/.exec(s.blur);
      t(s.scrim === '1' && bl && +bl[1] > 0 && +bl[1] <= 3 && br && +br[1] >= 0.75,
        `${nm}: ほかの本は少しだけぼかして暗くする。棚は読めるまま (${s.blur})`);
      t(s.caption === 0, `${nm}: 書名・著者名・「この本のページへ」は添えない`);
      t(s.cast && s.hole && s.hole.op === 1 && Math.abs(s.hole.l - sp.l) <= 1 && Math.abs(s.hole.t - sp.t) <= 1 && Math.abs(s.hole.h - sp.h) <= 1,
        `${nm}: 引き出した本は棚に影を落とし、本の抜けたすき間は暗くしておく`);
      t(s.padW >= 47.9 && s.padH >= s.box.h, `${nm}: 引き出した本の押せる幅は 48px 以上 (${s.padW.toFixed(1)}px)`);
      t(s.label === '「' + BOOKS[k].title + '」の商品ページを開く' && s.name === BOOKS[k].title,
        `${nm}: 引き出した本はボタンとして読み上げ、層は書名を名乗る (${s.name})`);
      t(s.activeInFocus && s.out && s.ring === 'none', `${nm}: 指で引き出したときも焦点は本へ移るが、焦点の枠は出さない`);
      console.log(`  INFO  ${nm}: 倍率 ${s.scale}${s.clamp ? '（' + s.clamp + '）' : ''}、引き出した長さ ${(s.pullK * 100).toFixed(0)}%（${(s.pullK * sp.kw).toFixed(0)}px）、背表紙 ${s.node.w.toFixed(1)}x${s.node.h.toFixed(1)}px、ずれ ${g.drift.toFixed(1)}px、頭 +${g.rise.toFixed(1)}・足もと +${g.drop.toFixed(1)}px、面 ${s.faces.map(f => f.side + ' ' + f.w.toFixed(1) + 'x' + f.h.toFixed(1)).join('・') || 'なし'}`);
      const toRight = sp.l + sp.w / 2 < vp.w / 2;
      /* ほかのところ（本と反対の側の上の隅）をタップすると、本は棚へ押しもどされる */
      await touchTap(cdp, p, toRight ? vp.w - 12 : 12, 60);
      await p.waitForTimeout(500);
      const c = await tapState(p);
      t(!c.open && !c.item && c.taken === 0, `${nm}: ほかのところをタップすると、本は棚へ押しもどされる`);
      t(c.hlen === before.hlen, `${nm}: 棚へもどしても履歴は増えない`);
      t(!c.activeInFocus && !c.activeSpine && !c.tag, `${nm}: 指でもどしたあと、棚の本に焦点も札も残らない (${c.active})`);
    }

    /* 動き。棚の本の姿から始まり、頭が手前へ傾いてから、まっすぐ手前へ滑り出て止まる。
       背表紙は消える点から棚の本へ向かう線の上を近づき（自分の列のまま、外側へ少しずれるだけ。
       消える点は止まった姿から求め、左右は画面の中央、高さは本の中ほどにあることも確かめる）、
       横の面は背表紙にくっついたまま、棚の本の輪郭から伸びてくる（絵が大きくなるのではない）。
       引き出すのは 0.55 秒ほど、押しもどすのは 0.35 秒ほど */
    {
      await toMarket(p, 0);
      const q = await spineAt(p, 0, 'kagaku', 1);
      await touchTap(cdp, p, q.x, q.y);
      const mo = await p.evaluate(() => new Promise(res => requestAnimationFrame(() => {
        const f = document.getElementById('focus'), node = f.querySelector('.focus__book .spine');
        const tex = f.querySelector('.focus__face.is-right .focus__tex');
        const an = document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#focus') && !(a instanceof CSSTransition));
        an.forEach(a => a.pause());
        const main = an.find(a => a.effect.target === node);
        const at = ms => { an.forEach(a => { a.currentTime = ms; }); const r = node.getBoundingClientRect(), x = tex && tex.getBoundingClientRect();
          return { ms, l: r.left, t: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom, tx: x ? x.left : null }; };
        const frames = [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550].map(at);
        const out = { dur: main ? main.effect.getComputedTiming().duration : 0, frames, vw: innerWidth, vh: innerHeight, scale: +f.dataset.scale,
                      tip: an.some(a => /rotateX\(-/.test(JSON.stringify(a.effect.getKeyframes()))) };
        an.forEach(a => a.finish());
        const r = node.getBoundingClientRect();
        out.fin = { l: r.left, t: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom };
        res(out);
      })));
      const f0 = mo.frames[0], fz = mo.frames[mo.frames.length - 1], fin = mo.fin;
      const kf = fin.h / q.h, vx = (fin.l - q.l * kf) / (1 - kf), vy = (fin.t - q.t * kf) / (1 - kf);
      const eye = Math.abs(vx - mo.vw / 2) <= 1.5 && vy >= q.t + 0.345 * q.h && vy <= q.t + 0.655 * q.h;
      /* 頭を傾けるあいだ（90ms）は、頭が手前へ来て足もとは奥のままなので、写る高さが 2px ほど揺れることがある */
      const grow = mo.frames.every((f, i) => i === 0 || f.h >= mo.frames[i - 1].h - (f.ms <= 150 ? 3 : 0.5));
      /* 止まるまで、背表紙の中心は外側（消える点と反対）へ動き続け、戻らない */
      const dir = Math.sign((q.l + q.r) / 2 - vx);
      const out = dir !== 0 && mo.frames.every((f, i) => i === 0 || dir * ((f.l + f.r) / 2 - (mo.frames[i - 1].l + mo.frames[i - 1].r) / 2) >= -0.3);
      /* 傾きが収まったあとは、背表紙は消える点を中心に棚の本を拡げた位置にある */
      const line = mo.frames.filter(f => f.ms >= 350).every(f => { const k = f.h / q.h;
        return Math.abs(f.l - (vx + (q.l - vx) * k)) <= 1 && Math.abs(f.t - (vy + (q.t - vy) * k)) <= 1; });
      /* 横の面の手前の端は、背表紙の端にくっついている。見える長さは 0 から伸びる。
         傾いているあいだは、同じ縁の上端と下端で外枠の端が別の点になるので、傾きが収まってから比べる */
      const glued = mo.frames.every(f => f.tx !== null && (f.ms > 0 && f.ms < 350 || Math.abs(f.tx - f.r) <= 1));
      const len = mo.frames.map(f => q.r - f.r);
      const lengthen = len[0] <= 1 && len.every((v, i) => i === 0 || v >= len[i - 1] - 0.3) && len[len.length - 1] >= 0.25 * fz.w;
      t(Math.abs(f0.l - q.l) <= 1 && Math.abs(f0.t - q.t) <= 1 && Math.abs(f0.h - q.h) <= 1 && grow && out && line && eye &&
        Math.abs(kf - mo.scale) <= 0.01 && mo.scale >= 1.2 && mo.scale <= 1.35,
        `${n}: 引き出す動きは棚の本の姿から始まり、消える点から棚の本へ向かう線の上を手前へ出る（高さ ${mo.frames.map(f => f.h.toFixed(0)).join('→')}px、` +
        `中心 ${mo.frames.map(f => ((f.l + f.r) / 2).toFixed(0)).join('→')}px、消える点 ${vx.toFixed(1)},${vy.toFixed(1)}）`);
      t(glued && lengthen,
        `${n}: 横の面（表紙）は背表紙にくっついたまま、棚の本の輪郭から伸びてくる（見える長さ ${len.map(v => v.toFixed(0)).join('→')}px）`);
      t(mo.dur >= 520 && mo.dur <= 600 && mo.tip, `${n}: 引き出すのは ${mo.dur}ms。頭が手前へ傾いてから、滑り出る`);
      await p.waitForTimeout(500);
      await touchTap(cdp, p, vp.w - 12, 60);
      const back = await p.evaluate(() => new Promise(res => requestAnimationFrame(() => {
        const node = document.querySelector('.focus__book .spine');
        const a = document.getAnimations().find(a => a.effect && a.effect.target === node);
        res(a ? a.effect.getComputedTiming().duration : 0);
      })));
      await p.waitForTimeout(600);
      const c = await tapState(p);
      t(back >= 300 && back <= 400 && !c.open && c.taken === 0, `${n}: 押しもどすのは ${back}ms で、棚の元の場所に収まる`);
    }

    /* 引き出した本のすぐ外（見えない押し幅の外）をタップすると、棚へもどす。
       本の右と左、画面の左の端の本（側面は右）と右の端の本（側面は左）で */
    const rightmost = (ti = 0) => p.evaluate(ti => {
      const row = document.querySelectorAll('.market')[0].querySelectorAll('.case .row')[ti];
      const e = [...row.querySelectorAll('.spine[data-book]')].filter(e => getComputedStyle(e).display !== 'none').pop();
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.bottom - 40, k: e.dataset.book, l: r.left, w: r.width };
    }, ti);
    for (const where of ['left', 'right']) {
      await toMarket(p, 0);
      const q = where === 'left' ? await spineAt(p, 0, 'aya') : await rightmost();
      await touchTap(cdp, p, q.x, q.y); await p.waitForTimeout(750);
      const s1 = await tapState(p);
      /* 本（背表紙と見えている面）と見えない押し幅の外 */
      const room = Math.max(24, s1.box.w / 2) + 14;
      const cx = s1.box.l + s1.box.w / 2;
      const ext = [s1.box, ...s1.faces];
      const bx = where === 'left' ? Math.max(cx + room, ...ext.map(r => r.r + 14)) : Math.min(cx - room, ...ext.map(r => r.l - 14));
      const by = s1.box.t + s1.box.h / 2;
      await touchTap(cdp, p, bx, by); await p.waitForTimeout(600);
      const c = await tapState(p);
      t(s1.open && !c.open && !c.item,
        `${n} ${q.k}: 引き出した本のすぐ外（${where === 'left' ? '右' : '左'}へ ${Math.abs(bx - cx).toFixed(0)}px）をタップすると棚へもどる`);
      if (c.open) { await touchTap(cdp, p, 12, 60); await p.waitForTimeout(500); }
      if (c.item) { await p.goBack(); await p.waitForTimeout(700); }
    }

    /* 棚へもどっているあいだは、引き出した本の上でも、タップを後ろの棚へ通す
       （もどりきるのを待たずに、次の本を引き出せる） */
    {
      await toMarket(p, 0);
      const q = await spineAt(p, 0, 'aya');
      await touchTap(cdp, p, q.x, q.y); await p.waitForTimeout(750);
      const s1 = await tapState(p);
      const pts = [[s1.box.l + s1.box.w / 2, s1.box.t + s1.box.h / 2], [s1.box.l + s1.box.w / 2, s1.box.t + s1.box.h * 0.2]];
      await touchTap(cdp, p, vp.w - 12, 60);
      const through = await p.waitForFunction(pts => {
        const f = document.getElementById('focus');
        if (!f.classList.contains('is-leaving')) return null;
        return { ok: pts.every(([x, y]) => !f.contains(document.elementFromPoint(x, y))) };
      }, pts, { polling: 'raf', timeout: 2000 }).then(h => h.jsonValue()).catch(() => null);
      t(through && through.ok, `${n}: 棚へもどっているあいだは、引き出した本の上でもタップを後ろの棚へ通す`);
      await p.waitForTimeout(500);
    }

    /* --- 2回目：引き出した本をタップすると商品詳細。「棚にもどる」で同じ位置の棚へ --- */
    await toMarket(p, 0);
    const yA = await p.evaluate(() => Math.round(window.scrollY));
    let sp = await spineAt(p, 0, 'aya');
    await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(750);
    let s = await tapState(p);
    const h1 = s.hlen;
    await touchTap(cdp, p, s.box.l + s.box.w / 2, s.box.t + s.box.h * 0.3); await p.waitForTimeout(800);
    s = await tapState(p);
    t(s.item && s.itemTitle === BOOKS.aya.title && s.itemCover === BOOKS.aya.cover, `${n}: 引き出した本をもう一度タップすると商品詳細 (${s.itemTitle})`);
    t(!s.open && s.taken === 0, `${n}: 商品詳細が開くと、引き出した本は棚へ戻っている`);
    t(s.hlen === h1 + 1 && s.hstate && s.hstate.item === 'aya', `${n}: 商品詳細を開くと履歴を1つ積む`);
    const backs = await p.evaluate(() => [...document.querySelectorAll('#item [data-item-close] span')].map(e => e.textContent));
    t(backs.length === 2 && backs.every(v => v === '棚にもどる'), `${n}: 商品詳細の上と下の出口は「棚にもどる」 (${backs.join('・')})`);
    const topBack = await p.evaluate(() => { const r = document.querySelector('.item__back').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await touchTap(cdp, p, topBack.x, topBack.y); await p.waitForTimeout(800);
    s = await tapState(p);
    t(!s.item && !s.open && s.y === yA, `${n}: 上の「棚にもどる」で、同じ位置の棚にもどる (${s.y}/${yA})`);
    t(!(s.hstate && s.hstate.item), `${n}: 「棚にもどる」で、積んだ履歴も戻る`);

    /* 引き出した本の横の面（表紙）をタップしても商品詳細。見えない押し幅の外の、面の上で */
    sp = await spineAt(p, 0, 'aya');
    await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(750);
    s = await tapState(p);
    {
      const fc = s.faces[0];
      const fx = fc.side === 'right' ? s.node.r + (fc.r - s.node.r) * 0.7 : s.node.l - (s.node.l - fc.l) * 0.7;
      const fy = s.node.t + s.node.h / 2;
      const pad = Math.max(24, s.box.w / 2), cx = s.box.l + s.box.w / 2;
      const onFace = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('.focus__face')); }, [fx, fy]);
      const h2 = s.hlen;
      await touchTap(cdp, p, fx, fy); await p.waitForTimeout(800);
      s = await tapState(p);
      /* 前の検査で戻る操作をしたあとなので、積んだ履歴は先の履歴と入れ替わり、数は増えないことがある。
         履歴の中身（商品詳細の本）で見る */
      t(onFace && Math.abs(fx - cx) > pad && s.item && s.itemTitle === BOOKS.aya.title && s.hlen >= h2 && s.hstate && s.hstate.item === 'aya',
        `${n}: 引き出した本の横の面（表紙）をタップしても商品詳細（${fc.side} の面の ${fx.toFixed(0)},${fy.toFixed(0)}。押し幅の外）`);
      await p.goBack(); await p.waitForTimeout(700);
      s = await tapState(p);
      t(!s.item && !s.open && s.y === yA, `${n}: 横の面から開いた商品詳細も、戻る操作で同じ位置の棚にもどる`);
    }

    /* 引き出した本の下のほう（棚板にかかったところ）をタップしても商品詳細。
       戻る操作（ブラウザ・スマートフォンの戻る）で棚へ */
    sp = await spineAt(p, 0, 'kagaku');
    await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(750);
    s = await tapState(p);
    await touchTap(cdp, p, s.box.l + s.box.w / 2, s.box.b - 10); await p.waitForTimeout(800);
    s = await tapState(p);
    t(s.item && s.itemTitle === BOOKS.kagaku.title, `${n}: 引き出した本の下のほうをタップしても商品詳細 (${s.itemTitle})`);
    await p.goBack(); await p.waitForTimeout(700);
    s = await tapState(p);
    t(!s.item && !s.open && s.y === yA, `${n}: 戻る操作で商品詳細が閉じ、同じ位置の棚にもどる (${s.y}/${yA})`);
    /* 本を引き出したまま進む操作をすると、商品詳細が開き直す。引き出した本は片づけ、
       商品詳細を閉じたあとに引き出した本が残らない */
    sp = await spineAt(p, 0, 'monte');
    await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(750);
    await p.goForward(); await p.waitForTimeout(700);
    s = await tapState(p);
    t(s.item && s.itemTitle === BOOKS.kagaku.title && !s.open && s.taken === 0,
      `${n}: 引き出したまま進む操作をすると、商品詳細が開き、引き出した本は棚へ戻る`);
    await p.goBack(); await p.waitForTimeout(700);
    s = await tapState(p);
    t(!s.item && !s.open && s.y === yA, `${n}: そのあと戻る操作で、引き出した本を残さず棚にもどる`);
    if (s.open) { await touchTap(cdp, p, vp.w - 12, 60); await p.waitForTimeout(500); }

    /* 引き出した本の上の端の近くをタップしても商品詳細。下の「棚にもどる」で棚へ */
    sp = await spineAt(p, 0, 'monte');
    await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(750);
    s = await tapState(p);
    await touchTap(cdp, p, s.box.l + s.box.w / 2, s.box.t + 8); await p.waitForTimeout(800);
    s = await tapState(p);
    t(s.item && s.itemTitle === BOOKS.monte.title, `${n}: 引き出した本の上の端の近くをタップしても商品詳細`);
    /* 商品詳細の「カートに入れる」「試し読み」の位置（下の二度たたきで狙う） */
    const acts = await p.evaluate(() => Object.fromEntries(['buy', 'read'].map(k => {
      const r = document.querySelector('.item__act--' + k).getBoundingClientRect();
      return [k, { l: r.left, t: r.top, r: r.right, b: r.bottom }];
    })));
    await p.evaluate(() => { const bd = document.querySelector('.item__body'); bd.scrollTop = bd.scrollHeight; });
    await p.waitForTimeout(200);
    const endBack = await p.evaluate(() => { const r = document.querySelector('.item__close').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await touchTap(cdp, p, endBack.x, endBack.y); await p.waitForTimeout(800);
    s = await tapState(p);
    t(!s.item && s.y === yA && !(s.hstate && s.hstate.item), `${n}: 下の「棚にもどる」でも、同じ位置の棚にもどる`);

    /* 引き出した本をすばやく二度たたく。1回目で商品詳細が開き、2回目は、そこに出てきた
       「カートに入れる」（本が左のとき）・「試し読み」（本が右のとき）の上に当たる。
       2回目は受けない（カートに入らず、試し読みも開かない）。
       引き出した本がボタンの高さに重なる下の段の本で、重なるところをたたく */
    for (const [where, act] of [['left', 'buy'], ['right', 'read']]) {
      await toMarket(p, 0);
      /* 左の端の本は、手前へ出ると画面の端へ寄ってボタンから外れるので、2冊目の文庫で */
      const q = where === 'left' ? await spineAt(p, 0, 'monte:2', 1) : await rightmost(1);
      await touchTap(cdp, p, q.x, q.y); await p.waitForTimeout(750);
      const s1 = await tapState(p);
      const a2 = acts[act];
      const x = s1.box ? s1.box.l + s1.box.w / 2 : 0;
      const ya = s1.box ? Math.max(a2.t, s1.box.t + 4) : 0, yb = s1.box ? Math.min(a2.b, s1.box.b - 4) : 0;
      const y = (ya + yb) / 2;
      const aimed = s1.open && x >= a2.l && x <= a2.r && yb > ya;
      const cart0 = await p.evaluate(() => document.getElementById('cart-n').textContent);
      await touchTap(cdp, p, x, y, 30); await p.waitForTimeout(140);
      await touchTap(cdp, p, x, y, 30); await p.waitForTimeout(900);
      const s2 = await tapState(p);
      const after = await p.evaluate(() => ({ cart: document.getElementById('cart-n').textContent, peek: !document.getElementById('peek').hidden }));
      t(aimed && s2.item && s2.itemTitle === BOOKS[q.k].title && after.cart === cart0 && !after.peek,
        `${n} ${q.k}: 引き出した本をすばやく二度たたいても、2回目は「${act === 'buy' ? 'カートに入れる' : '試し読み'}」に当たらない（${x.toFixed(0)},${y.toFixed(0)}、カート ${after.cart}）`);
      if (after.peek) { await p.keyboard.press('Escape'); await p.waitForTimeout(500); }
      if (s2.item) { await p.goBack(); await p.waitForTimeout(800); }
      if (s2.open) { await touchTap(cdp, p, where === 'left' ? vp.w - 12 : 12, 60); await p.waitForTimeout(500); }
    }

    /* 二度たたき。2回目は受けない（そのまま商品詳細へ進まない） */
    sp = await spineAt(p, 0, 'monte');
    await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(120);
    await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(700);
    s = await tapState(p);
    t(s.open && !s.item, `${n}: 本をすばやく二度たたいても、商品詳細へは進まない`);
    await touchTap(cdp, p, vp.w - 12, 60); await p.waitForTimeout(500);

    /* 指でなぞって離す。指の下の本を引き出すだけ */
    const a = await spineAt(p, 0, 'monte');
    const pts = []; for (let x = a.x; x <= a.x + 120; x += 8) pts.push([x, a.y]);
    await touchSlide(cdp, p, pts);
    await p.waitForTimeout(750);
    s = await tapState(p);
    const under = await p.evaluate(([x, y]) => { const e = [...document.querySelectorAll('.case .row .spine')].find(e => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && x >= r.left - 1.5 && x <= r.right + 1.5 && y >= r.top - 40 && y <= r.bottom + 40; }); return e && e.dataset.book; }, [a.x + 120, a.y]);
    t(s.open && !s.item && s.name === BOOKS[under].title && !s.tag, `${n}: なぞって離すと、指の下の本を引き出すだけ (${s.name})`);
    await touchTap(cdp, p, vp.w - 12, 60); await p.waitForTimeout(500);

    /* 短く斜めにはじく。どの向きでも商品詳細へは進まない */
    const flicks = [];
    for (const [dx, dy] of [[20, 20], [20, -20], [-20, 14], [14, 20], [-18, -18]]) {
      await toMarket(p, 0);
      await touchSlide(cdp, p, [[a.x, a.y], [a.x + dx / 2, a.y + dy / 2], [a.x + dx, a.y + dy]], 10);
      await p.waitForTimeout(700);
      s = await tapState(p);
      flicks.push(s.item);
      if (s.item) { await p.goBack(); await p.waitForTimeout(500); }
      if (s.open) { await touchTap(cdp, p, vp.w - 12, 60); await p.waitForTimeout(500); }
    }
    t(flicks.every(v => !v), `${n}: 短く斜めにはじいても、商品詳細へは進まない (${flicks.length}方向)`);

    /* 棚の外まで指を外して離す。何もしない */
    await toMarket(p, 0);
    await touchSlide(cdp, p, [[a.x, a.y], [a.x + 20, a.y], [a.x + 40, a.y], [a.x + 40, a.y + 420]]);
    await p.waitForTimeout(600);
    s = await tapState(p);
    t(!s.open && !s.item, `${n}: 棚の外まで指を外して離すと、何もしない`);

    /* 引き出しているあいだに別の本をタップすると、棚へもどす */
    await toMarket(p, 0);
    sp = await spineAt(p, 0, 'monte');
    await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(750);
    const other = await p.evaluate(() => { const tr = document.querySelectorAll('.market')[0].querySelectorAll('.tier')[1];
      const e = [...tr.querySelectorAll('.spine')].filter(e => getComputedStyle(e).display !== 'none').pop(); const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: Math.min(r.bottom - 20, innerHeight - 20) }; });
    await touchTap(cdp, p, other.x, other.y); await p.waitForTimeout(600);
    s = await tapState(p);
    t(!s.open && !s.item && s.taken === 0, `${n}: 引き出しているあいだに別の本をタップすると、棚へもどす`);

    /* 引き出したまま画面を送ると、棚へもどす */
    sp = await spineAt(p, 0, 'aya');
    await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(750);
    const yS = await p.evaluate(() => Math.round(window.scrollY));
    await touchSlide(cdp, p, [[vp.w - 30, 500], [vp.w - 30, 480], [vp.w - 30, 450], [vp.w - 30, 420], [vp.w - 30, 380]]);
    await p.waitForTimeout(700);
    s = await tapState(p);
    t(!s.open && !s.item && Math.abs(s.y - yS) > 12, `${n}: 引き出したまま画面を送ると、棚へもどす（${s.y - yS}px 送った）`);
    /* ごくわずかな送り（12px まで）では閉じない。そのあいだ、引き出した本は棚といっしょに動く。
       それより送ると閉じる。送り続けても、本は送ったあとの棚の自分の場所へ戻る
       （引き出したときの画面の位置へ戻ってから、棚の本が別のところに現れる、にならない） */
    await toMarket(p, 0);
    sp = await spineAt(p, 0, 'aya');
    await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(750);
    const b0 = (await tapState(p)).node;
    await p.evaluate(() => window.scrollBy(0, 8)); await p.waitForTimeout(200);
    const s8 = await tapState(p);
    const small = s8.open, rode = !!(s8.node && b0 && Math.abs((b0.t - s8.node.t) - 8) <= 1);
    const land = await p.evaluate(async () => {
      const raf = () => new Promise(res => requestAnimationFrame(res));
      window.scrollBy(0, 12); await raf(); await raf();
      for (let i = 0; i < 6; i++) { window.scrollBy(0, 20); await raf(); }
      const f = document.getElementById('focus');
      const an = document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#focus'));
      if (f.hidden || !an.length || !f.classList.contains('is-leaving')) return null;
      an.forEach(a => { a.pause(); a.currentTime = a.effect.getComputedTiming().duration - 1; });
      const nb = f.querySelector('.focus__book .spine').getBoundingClientRect(), e = document.querySelector('.is-taken').getBoundingClientRect();
      const h = f.querySelector('.focus__slot').getBoundingClientRect();
      an.forEach(a => a.finish());
      return { d: Math.max(Math.abs(nb.left - e.left), Math.abs(nb.top - e.top), Math.abs(nb.height - e.height)), hd: Math.abs(h.top - e.top) };
    });
    await p.waitForTimeout(200);
    s = await tapState(p);
    t(small && rode && !s.open, `${n}: 8px の送りでは閉じず（引き出した本は棚といっしょに動く）、20px 送ると棚へもどす`);
    t(land && land.d <= 1 && land.hd <= 1,
      `${n}: 送りながら閉じても、本は送ったあとの棚の自分の場所へ戻る（ずれ ${land ? land.d.toFixed(1) : '—'}px）`);

    /* --- 平置きの本は、タップするとそのまま商品詳細（表紙の拡大は無い。9/30 のご依頼） --- */
    await toMarket(p, 0);
    for (const i of [0, 1]) {
      const f = await p.evaluate(i => {
        const e = [...document.querySelectorAll('.market')[0].querySelectorAll('.deck__row .flat')].filter(e => getComputedStyle(e).display !== 'none')[i];
        e.scrollIntoView({ block: 'center' });
        const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, k: e.dataset.book };
      }, i);
      await p.waitForTimeout(300);
      const s0 = await tapState(p);
      await touchTap(cdp, p, f.x, f.y);
      /* 押した手応えのぶんも待たせない。指を離してすぐに商品詳細が開きはじめる */
      const quick = await p.evaluate(() => new Promise(res => setTimeout(() => res(!document.getElementById('item').hidden), 100)));
      await p.waitForTimeout(700);
      s = await tapState(p);
      const nm = `${n} 平置き ${f.k}`;
      t(quick && s.item && s.itemTitle === BOOKS[f.k].title && !s.open && s.taken === 0,
        `${nm}: タップするとそのまま商品詳細が開く（表紙の拡大は無い）`);
      /* 前の検査で戻る操作をしたあとなので、積んだ履歴は先の履歴と入れ替わり、数は増えないことがある。
         履歴の中身（商品詳細の本）で見る */
      t(!(s0.hstate && s0.hstate.item) && s.hstate && s.hstate.item === f.k && s.hlen >= s0.hlen,
        `${nm}: 商品詳細を開くと履歴を1つ積む（戻る操作で棚へもどれる）`);
      await p.goBack(); await p.waitForTimeout(700);
      const c = await tapState(p);
      t(!c.item && !c.open && c.y === s0.y && !c.activeSpine, `${nm}: 戻る操作で同じ位置の棚にもどる (${c.y}/${s0.y})`);
    }

    /* --- 試し読みとカートは、商品詳細から --- */
    await toMarket(p, 0);
    sp = await spineAt(p, 0, 'monte');
    await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(750);
    s = await tapState(p);
    await touchTap(cdp, p, s.box.l + s.box.w / 2, s.box.t + s.box.h / 2); await p.waitForTimeout(800);
    const at = sel => p.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    let q = await at('.item__act--read');
    await touchTap(cdp, p, q.x, q.y); await p.waitForTimeout(700);
    const pk = await p.evaluate(() => ({ open: !document.getElementById('peek').hidden, lock: document.body.classList.contains('peek-open') }));
    t(pk.open && pk.lock, `${n}: 商品詳細の「試し読み」で試し読みが開く`);
    q = await at('.peek__close');
    await touchTap(cdp, p, q.x, q.y); await p.waitForTimeout(600);
    const pk2 = await p.evaluate(() => ({ peek: !document.getElementById('peek').hidden, item: !document.getElementById('item').hidden,
      focus: document.activeElement.className, lock: document.body.classList.contains('peek-open') }));
    t(!pk2.peek && pk2.item && /item__act--read/.test(pk2.focus) && pk2.lock,
      `${n}: 試し読みを閉じると商品詳細の「試し読み」にもどる（後ろの棚は止めたまま）`);
    q = await at('.item__act--buy');
    await touchTap(cdp, p, q.x, q.y); await p.waitForTimeout(400);
    const ct = await p.evaluate(() => ({ toast: document.getElementById('toast').textContent, n: document.getElementById('cart-n').textContent }));
    t(ct.n === '1' && ct.toast.includes(BOOKS.monte.title), `${n}: 商品詳細の「カートに入れる」で、その本がカートに入る (${ct.toast})`);
    /* 試し読みを開いたまま戻る操作をしたときは、商品詳細ごと閉じて棚へ */
    q = await at('.item__act--read');
    await touchTap(cdp, p, q.x, q.y); await p.waitForTimeout(700);
    await p.goBack(); await p.waitForTimeout(800);
    const bk = await p.evaluate(() => ({ peek: !document.getElementById('peek').hidden, item: !document.getElementById('item').hidden,
      lock: document.body.classList.contains('peek-open') }));
    t(!bk.peek && !bk.item && !bk.lock, `${n}: 試し読みの上で戻る操作をすると、棚まで戻り、棚が動くように戻る`);

    t(errs.length === 0, `${n}: 本を引き出す操作でJSエラーなし${errs.length ? ' — ' + errs[0] : ''}`);
    await ctx.close();
  }
}

/* ---- 2b. 本を引き出す（マウスとキーボード） ------------------------------
   マウス：指している本が少し出て書名の札が出る（何も開かない）。クリックで引き出す。
   キーボード：Enter で引き出し、焦点は「「書名」の商品ページを開く」へ。
   もう一度 Enter で商品詳細。Escape で棚へもどし、焦点は元の本へ返る。
   平置きの本は、クリックでも Enter でも、そのまま商品詳細。 */
async function pcFlow(b) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  const BOOKS = await p.evaluate(() => JSON.parse(document.getElementById('book-data').textContent));
  await toMarket(p, 1);
  let sp = await spineAt(p, 1, 'suika');
  await p.mouse.move(sp.x, sp.y); await p.waitForTimeout(400);
  let s = await tapState(p);
  const lifted = await p.evaluate(([x, y]) => document.elementFromPoint(x, y).closest('.spine').classList.contains('is-picked'), [sp.x, sp.y]);
  t(s.tag && lifted && !s.open, 'PC: マウスを乗せると本が少し出て書名の札が出る（何も開かない）');
  await p.mouse.click(sp.x, sp.y); await p.waitForTimeout(700);
  s = await tapState(p);
  /* 広い画面の端の本は、横の面が伸びすぎないよう大きさを控える（控えたわけは pose3d が確かめる）。
     本の後ろが棚の輪郭にそろい、遠近の線の上にあり、段に収まるのは同じ */
  const gp = pose3d(s, sp);
  t(s.open && !s.item && s.caption === 0 && gp.scaleOk && gp.pullOk && gp.dev <= 1 && gp.backOk && gp.sideOk && gp.onScreen && gp.inBand && gp.midOk,
    `PC: クリックで本を棚から引き出す (倍率 ${s.scale}${s.clamp ? '（' + s.clamp + '）' : ''}、引き出した長さ ${(s.pullK * 100).toFixed(0)}%、面 ${s.faces.map(f => f.side + ' ' + f.w.toFixed(0) + 'x' + f.h.toFixed(0)).join('・')})`);
  t(!s.tag, 'PC: 引き出すと書名の札は消える');
  await p.mouse.click(1400, 450); await p.waitForTimeout(500);
  s = await tapState(p);
  t(!s.open && !s.item && !s.activeSpine, 'PC: ほかのところをクリックすると棚へもどす');
  await p.mouse.click(sp.x, sp.y); await p.waitForTimeout(700);
  s = await tapState(p);
  await p.mouse.click(s.box.l + s.box.w / 2, s.box.t + s.box.h / 2); await p.waitForTimeout(800);
  s = await tapState(p);
  t(s.item && s.itemTitle === BOOKS.suika.title, 'PC: 引き出した本をクリックすると商品詳細');
  await p.click('.item__back'); await p.waitForTimeout(700);
  s = await tapState(p);
  t(!s.item && !s.open && !s.activeSpine, 'PC: 「棚にもどる」で棚へ（マウスのときは本に焦点を返さない）');
  await p.mouse.click(sp.x, sp.y); await p.waitForTimeout(700);
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  s = await tapState(p);
  t(!s.open, 'PC: Escape で棚へもどす');
  /* 広い画面でも、画面の中央あたりの本は 1.2〜1.35 倍。控えるのは、横の面が伸びすぎる離れた本だけで、
     そのときも横の面は引き出した長さの半分の長さで見える */
  await toMarket(p, 0);
  for (const [k, ti] of [['mid', 1], ['aya', 0]]) {
    const q = await spineAt(p, 0, k, ti);
    await p.mouse.click(q.x, q.y); await p.waitForTimeout(700);
    s = await tapState(p);
    const g = pose3d(s, q);
    t(s.open && g.scaleOk && g.pullOk && g.dev <= 1 && g.backOk && g.sideOk && g.onScreen && g.inBand && g.midOk &&
      (k === 'mid' ? !s.clamp && s.scale >= 1.2 && s.scale <= 1.35 : s.clamp === 'wide'),
      `PC: ${k === 'mid' ? '画面の中央の本' : '画面の中央から離れた本'}（${q.k}）は ${s.scale} 倍${s.clamp ? '（' + s.clamp + '）' : ''}。横の面 ${g.faceLen.toFixed(0)}px`);
    await p.mouse.click(1420, 880); await p.waitForTimeout(500);
  }

  /* --- キーボードだけで --- */
  await p.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); document.querySelector('.hero__scroll').focus(); });
  await p.keyboard.press('Tab'); await p.waitForTimeout(500);
  const first = await p.evaluate(() => { const a = document.activeElement; return { spine: a.classList.contains('spine'), label: a.getAttribute('aria-label'), key: a.dataset.book }; });
  s = await tapState(p);
  t(first.spine && s.tag, `キーボード: Tab で背表紙に焦点が来て、書名の札が出る (${first.label})`);
  const h0 = s.hlen;
  await p.keyboard.press('Enter'); await p.waitForTimeout(700);
  s = await tapState(p);
  t(s.open && !s.item && s.hlen === h0, 'キーボード: Enter で本を引き出す（商品詳細へは進まない）');
  t(s.active === '「' + BOOKS[first.key].title + '」の商品ページを開く' && s.ring === 'solid',
    `キーボード: 焦点は「「書名」の商品ページを開く」に移り、枠が見える (${s.active})`);
  /* 枠は本のまわりに途切れずに描かれ、画面の外へもはみ出さない。四つの辺を画面から読み、
     枠を消した姿と比べる（箱の中の背表紙に付けていたときは、奥行きのある面の重なりで枠が切れ、
     左と上の辺が描かれなかった。見え方の指定だけを読む検査では分からなかった）。
     画面の一部だけを撮ると、奥行きのある面の描き方が変わり、切れた枠も途切れずに写ることがあるので、
     画面全体を撮ってから読む */
  {
    const bx = s.box;
    const strips = [{ x: bx.l - 9, y: bx.t + 6, width: 6, height: bx.h - 12, rows: true },
                    { x: bx.r + 3, y: bx.t + 6, width: 6, height: bx.h - 12, rows: true },
                    { x: bx.l + 3, y: bx.t - 9, width: bx.w - 6, height: 6, rows: false },
                    { x: bx.l + 3, y: bx.b + 3, width: bx.w - 6, height: 6, rows: false }];
    const linesIn = async () => { const png = (await p.screenshot()).toString('base64');
      return p.evaluate(async ({ png, strips }) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + png; });
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
        const k = img.width / innerWidth;
        return strips.map(c => {
          const w = Math.round(c.width * k), h = Math.round(c.height * k);
          const d = cx.getImageData(Math.round(c.x * k), Math.round(c.y * k), w, h).data;
          const L = i => 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
          const out = [];
          if (c.rows) for (let y = 0; y < h; y++) { let m = 0; for (let x = 0; x < w; x++) m = Math.max(m, L(y * w + x)); out.push(m); }
          else for (let x = 0; x < w; x++) { let m = 0; for (let y = 0; y < h; y++) m = Math.max(m, L(y * w + x)); out.push(m); }
          return out;
        });
      }, { png, strips }); };
    const on = await linesIn();
    const hide = await p.addStyleTag({ content: '.focus__book::after{ visibility:hidden !important; }' });
    const off = await linesIn();
    await hide.evaluate(e => e.remove());
    const share = on.map((l, i) => l.filter((v, j) => v >= 150 && v - off[i][j] >= 30).length / l.length);
    t(bx.l - 7 >= 0 && bx.t - 7 >= 0 && bx.r + 7 <= 1440 && bx.b + 7 <= 900 && share.every(v => v >= 0.9),
      `キーボード: 焦点の枠は本のまわりに途切れずに描かれ、画面に収まる（${['左', '右', '上', '下'].map((q, i) => q + ' ' + (share[i] * 100).toFixed(0) + '%').join('・')}、枠の左の端 ${(bx.l - 7).toFixed(1)}px）`);
  }
  await p.keyboard.press('Tab'); await p.waitForTimeout(120);
  const t1 = await p.evaluate(() => ({ cls: document.activeElement.className, text: document.activeElement.textContent, op: getComputedStyle(document.activeElement).opacity }));
  await p.keyboard.press('Tab'); await p.waitForTimeout(120);
  const t2 = await p.evaluate(() => document.activeElement.className);
  t(t1.cls === 'focus__close' && t1.text === '棚にもどる' && t1.op === '1' && t2 === 'focus__book',
    'キーボード: 引き出しているあいだ、Tab は本と「棚にもどる」のあいだだけを回る');
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  s = await tapState(p);
  const back1 = await p.evaluate(() => document.activeElement.dataset.book);
  t(!s.open && s.activeSpine && back1 === first.key && s.tag, 'キーボード: Escape で棚へもどし、焦点は元の本へ返る');
  await p.keyboard.press('Enter'); await p.waitForTimeout(700);
  await p.keyboard.press('Enter'); await p.waitForTimeout(800);
  s = await tapState(p);
  t(s.item && s.itemTitle === BOOKS[first.key].title && s.active === 'item__back' && s.hstate && s.hstate.item === first.key,
    `キーボード: Enter、Enter で商品詳細 (${s.itemTitle})`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(700);
  s = await tapState(p);
  const back2 = await p.evaluate(() => document.activeElement.dataset.book);
  t(!s.item && !s.open && back2 === first.key && !(s.hstate && s.hstate.item),
    'キーボード: 商品詳細で Escape を押すと棚にもどり、焦点は元の本へ返る');
  /* 商品詳細が開いてすぐ（引き出した本が棚へ戻りきる前）に Tab を押しても、焦点は商品詳細の中を進む */
  await p.keyboard.press('Enter'); await p.waitForTimeout(700);
  await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  await p.keyboard.press('Tab'); await p.waitForTimeout(800);
  const kt = await p.evaluate(() => ({ item: !document.getElementById('item').hidden,
    inItem: document.getElementById('item').contains(document.activeElement),
    cls: document.activeElement.className || document.activeElement.tagName }));
  t(kt.item && kt.inItem, `キーボード: 商品詳細が開いてすぐ Tab を押しても、焦点は商品詳細の中 (${kt.cls})`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(700);
  const back3 = await p.evaluate(() => document.activeElement.dataset.book);
  t(back3 === first.key, 'キーボード: そのあと Escape で、焦点は元の本へ返る');
  await p.keyboard.press(' '); await p.waitForTimeout(700);
  s = await tapState(p);
  t(s.open && !s.item, 'キーボード: Space でも本を引き出す');
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  /* 平置きの本は、Enter でそのまま商品詳細。Escape で棚にもどり、焦点は元の本へ返る */
  const flatKey = await p.evaluate(() => { const e = [...document.querySelectorAll('.deck__row .flat')].find(e => getComputedStyle(e).display !== 'none'); e.focus(); return e.dataset.book; });
  const hf = (await tapState(p)).hlen;
  await p.keyboard.press('Enter'); await p.waitForTimeout(700);
  s = await tapState(p);
  t(s.item && !s.open && s.itemTitle === BOOKS[flatKey].title && s.active === 'item__back' && s.hstate && s.hstate.item === flatKey && s.hlen >= hf,
    `キーボード: 平置きの本は Enter でそのまま商品詳細 (${s.itemTitle}、焦点 ${s.active})`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(700);
  const backF = await p.evaluate(() => { const a = document.activeElement; return a.classList.contains('flat') ? a.dataset.book : a.className; });
  t(backF === flatKey, `キーボード: 商品詳細で Escape を押すと棚にもどり、焦点は平置きの本へ返る (${backF})`);
  /* マウスで平置きの本をクリックしても、そのまま商品詳細 */
  const fr = await p.evaluate(() => { const e = [...document.querySelectorAll('.deck__row .flat')].filter(e => getComputedStyle(e).display !== 'none')[1];
    e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, k: e.dataset.book }; });
  await p.mouse.click(fr.x, fr.y); await p.waitForTimeout(700);
  s = await tapState(p);
  t(s.item && !s.open && s.itemTitle === BOOKS[fr.k].title, `PC: 平置きの本をクリックすると、そのまま商品詳細 (${s.itemTitle})`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(700);

  /* ぼかしが重い端末では、暗くするだけにする（ぼかさない）。見え方の指定を読む */
  const dim = await p.evaluate(async () => {
    const f = document.getElementById('focus'), sc = f.querySelector('.focus__scrim');
    const blur = getComputedStyle(sc).backdropFilter;
    f.classList.add('is-plain');
    const plain = { bf: getComputedStyle(sc).backdropFilter, bg: getComputedStyle(sc).backgroundColor };
    f.classList.remove('is-plain');
    return { blur, plain };
  });
  t(/blur/.test(dim.blur) && dim.plain.bf === 'none' && /0\.3\)$/.test(dim.plain.bg),
    `PC: 後ろはぼかして暗くする。重い端末向けに、ぼかさず暗くするだけの見え方もある (${dim.blur} / ${dim.plain.bg})`);

  /* --- 読み上げ。本は隠さず、書名のボタンとして読む。什器の部材は読まない --- */
  const a11y = await p.evaluate(() => {
    const focusables = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
      .filter(e => e.tabIndex >= 0 && !e.disabled && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    const hiddenFocus = focusables.filter(e => e.closest('[aria-hidden="true"]')).map(e => e.className);
    const books = [...document.querySelectorAll('.case .spine[data-book], .case .flat[data-book]')].filter(e => e.getClientRects().length);
    const deco = ['.case__crown', '.case__board', '.deck__lip', '.case__base', '.case__floor', '.case__light', '.case__leaves'];
    const f = document.getElementById('focus');
    return {
      hiddenFocus, caseHidden: [...document.querySelectorAll('.case')].some(c => c.closest('[aria-hidden="true"]')),
      named: books.every(e => e.getAttribute('role') === 'button' && (e.getAttribute('aria-label') || '').length > 0),
      n: books.length,
      rows: [...document.querySelectorAll('.case .row, .case .deck__row')].every(r => r.getAttribute('role') === 'group' && r.getAttribute('aria-label')),
      deco: deco.every(s => [...document.querySelectorAll(s)].every(e => e.getAttribute('aria-hidden') === 'true')),
      dialog: f.getAttribute('role') === 'dialog' && f.getAttribute('aria-modal') === 'true' && !f.hasAttribute('aria-labelledby'),
    };
  });
  t(a11y.hiddenFocus.length === 0 && !a11y.caseHidden,
    `読み上げ: 焦点の来る要素を aria-hidden の中に置かない${a11y.hiddenFocus.length ? ' — ' + a11y.hiddenFocus.slice(0, 3).join(',') : ''}`);
  t(a11y.named && a11y.n > 20, `読み上げ: 本は書名のボタンとして読む (${a11y.n}冊)`);
  t(a11y.rows, '読み上げ: 段と平台は「1段目」「平台」などのまとまりとして読む');
  t(a11y.deco, '読み上げ: 什器の部材（板・脚・床・光）は読まない');
  /* 層の名前は、引き出した本の書名（画面には出さない） */
  await toMarket(p, 1);
  const sp2 = await spineAt(p, 1, 'suika');
  await p.mouse.click(sp2.x, sp2.y); await p.waitForTimeout(700);
  const nameOpen = await p.evaluate(() => document.getElementById('focus').getAttribute('aria-label'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  t(a11y.dialog && nameOpen === BOOKS.suika.title, `読み上げ: 引き出した本の層は、書名を名前にした画面として読む (${nameOpen})`);
  const snap = await p.locator('.market').first().ariaSnapshot();
  t(snap.includes(`button "${BOOKS.aya.title}"`) && /group "1段目"/.test(snap) && /group "平台"/.test(snap),
    '読み上げ: 読み上げの木に、段・平台と本のボタンが出る');

  t(errs.length === 0, `PC・キーボード: JSエラーなし${errs.length ? ' — ' + errs[0] : ''}`);
  await p.close();
}

/* ---- 2c. 商品詳細と試し読み ---------------------------------------
   本を引き出し、引き出した本を押して商品詳細へ。試し読みは商品詳細から */
async function openItem(p, el) {
  await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
  await el.click();
  /* 引き出した直後（二度たたきを受けない間）を待ってから */
  await p.waitForTimeout(650);
  await p.click('.focus__book');
  await p.waitForTimeout(750);
}

async function screens(b) {
  for (const vp of SCREEN_VIEWS) {
    const p = await b.newPage({ viewport: { width: vp.w, height: vp.h }, hasTouch: true });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL, { waitUntil: 'networkidle' });
    await settle(p);

    t(await p.evaluate(() => document.getElementById('focus').hidden && document.getElementById('item').hidden),
      `${vp.n}: 引き出した本の層と商品詳細は、最初は閉じている`);

    const sp = await p.$('.spine[data-book]');
    await sp.scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
    const key = await sp.getAttribute('data-book');
    await sp.click(); await p.waitForTimeout(700);
    let s = await tapState(p);
    t(s.open && !s.item && s.caption === 0, `${vp.n}: 背表紙をクリックすると、本が棚から引き出される（文字は添えない）`);
    t(s.node.t >= 11.5 && s.node.b <= vp.h - 11.5 && s.node.l >= 3.5 && s.node.r <= s.vw - 3.5 &&
      s.faces.every(r => r.l >= -0.5 && r.r <= s.vw + 0.5 && r.t >= -0.5 && r.b <= vp.h + 0.5), `${vp.n}: 引き出した本が画面に収まる`);

    await p.click('.focus__book'); await p.waitForTimeout(750);
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
    t(s.open, `${vp.n}: 引き出した本をクリックすると商品詳細が開く`);
    t(s.title.length > 0, `${vp.n}: 商品詳細に書名（${s.title}）`);
    t(/円/.test(s.price), `${vp.n}: 商品詳細に価格`);
    t(s.specs === 6, `${vp.n}: 書誌が6項目（書名・著者訳者・出版社・判型・ページ数・価格）`);
    t(s.paras >= 2, `${vp.n}: 紹介文が入る（${s.paras}段落）`);
    t(s.acts === 2, `${vp.n}: カートに入れる／試し読み`);
    t(s.cover.includes(key), `${vp.n}: 引き出した本の商品詳細`);
    t(s.docW <= s.winW + 1, `${vp.n}: 商品詳細で横にはみ出さない`);

    /* 試し読み（商品詳細から） */
    await p.click('.item__act--read'); await p.waitForTimeout(700);
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
        over: (function () {
          var st = document.getElementById('peek-stage').getBoundingClientRect();
          var im = document.querySelector('.peek__page img').getBoundingClientRect();
          return Math.round(im.bottom - st.bottom);
        })(),
      };
    });
    t(s.open, `${vp.n}: 商品詳細の「試し読み」で試し読みが開く`);
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
      item: document.getElementById('item').hidden,
      focus: document.activeElement.className,
      locked: document.body.classList.contains('peek-open'),
    }));
    t(s.peek, `${vp.n}: 試し読みを閉じられる`);
    t(!s.item && /item__act--read/.test(s.focus), `${vp.n}: 閉じると商品詳細の「試し読み」に戻る`);
    t(s.locked, `${vp.n}: 商品詳細のあいだは、後ろの棚は止めたまま`);

    await p.keyboard.press('Escape'); await p.waitForTimeout(700);
    s = await p.evaluate(() => ({
      item: document.getElementById('item').hidden,
      focusL: document.getElementById('focus').hidden,
      gone: [...document.querySelectorAll('.spine,.flat')].filter(e => getComputedStyle(e).visibility === 'hidden').length,
      locked: document.body.classList.contains('peek-open'),
    }));
    t(s.item && s.focusL, `${vp.n}: 商品詳細も閉じて棚にもどる`);
    t(s.gone === 0, `${vp.n}: 引き出した本が棚に戻る`);
    t(!s.locked, `${vp.n}: 後ろのスクロールが戻る`);

    const fl = await p.$('.flat[data-book]');
    await fl.scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
    await fl.click(); await p.waitForTimeout(700);
    s = await tapState(p);
    t(s.item && !s.open && s.itemCover === (await fl.evaluate(e => e.querySelector('img').getAttribute('src'))),
      `${vp.n}: 平置きをクリックすると、そのまま商品詳細が開く`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(700);
    /* 引き出した本は、覆いの端をクリックすると棚へもどる */
    await sp.scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
    await sp.click(); await p.waitForTimeout(700);
    await p.mouse.click(vp.w - 8, 8); await p.waitForTimeout(600); await still(p);
    t(await p.evaluate(() => document.getElementById('focus').hidden && document.getElementById('item').hidden), `${vp.n}: 覆いの端で棚へもどる`);

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
    /* カートに入れるのは商品詳細から（本を引き出し、引き出した本を押す） */
    await openItem(p, lb);
    await p.click('.item__act--buy'); await p.waitForTimeout(350);
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
    await openItem(p, sp);
    await p.click('.item__act--buy'); await p.waitForTimeout(400);

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
      await openItem(p, e);
      await p.click('.item__act--buy'); await p.waitForTimeout(300);
      await p.keyboard.press('Escape'); await p.waitForTimeout(700);
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

    /* --- 商品詳細のカート（9/30 のご依頼）。棚へもどらずに、カートを見て購入へ進める。
       右上に上の帯と同じカートと数。「カートに入れる」は入れたあと「カートを見る」になる --- */
    {
      const cst = () => p.evaluate(() => {
        const bt = document.querySelector('.item__act--buy'), cart = document.getElementById('cart'), it = document.getElementById('item');
        const n = document.getElementById('item-cart-n');
        return { buy: bt.textContent, isIn: bt.classList.contains('is-in'), n: n.textContent, badge: !n.hidden,
                 cart: !cart.hidden && cart.classList.contains('is-open'), item: !it.hidden && it.classList.contains('is-open'),
                 lock: document.body.classList.contains('peek-open'), focus: document.activeElement.id || document.activeElement.className,
                 toast: document.getElementById('toast').textContent, title: it.querySelector('.item__title').textContent };
      });
      /* カートに入っている本（上の2行のうちの1冊）の商品詳細 */
      await openItem(p, sp);
      let c = await cst();
      const ic = await p.evaluate(() => {
        const ic = document.getElementById('item-cart'), r = ic.getBoundingClientRect(), bar = document.querySelector('.item__bar').getBoundingClientRect();
        const svg = e => e.querySelector('svg').innerHTML.replace(/\s+/g, '');
        return { right: +r.right.toFixed(1), top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), w: r.width, h: r.height,
                 barR: bar.right, barT: bar.top, barB: bar.bottom, vw: document.documentElement.clientWidth,
                 same: svg(ic) === svg(document.getElementById('cart-open')), label: ic.getAttribute('aria-label') };
      });
      t(c.item && c.buy === 'カートを見る' && c.isIn, `${vp.n}: カートに入っている本の商品詳細は、はじめから「カートを見る」 (${c.buy})`);
      /* 「カートを見る」に添えた印（›）は読み上げない */
      const buyName = await p.locator('.item__act--buy').ariaSnapshot();
      t(/button "カートを見る"$/m.test(buyName.trim()), `${vp.n}: 「カートを見る」の印は読み上げない (${buyName.trim()})`);
      t(ic.same && c.badge && c.n === '2' && ic.right >= ic.vw - 40 && ic.top >= ic.barT - 1 && ic.bottom <= ic.barB + 12 && ic.w >= 44 && ic.h >= 44,
        `${vp.n}: 商品詳細の右上に、上の帯と同じカートと数が出る（${c.n}冊、右の端 ${ic.right}/${ic.vw}px、${ic.w}x${ic.h}px）`);
      /* 数は読み上げでも分かる（ボタンの名前に入れる。上の帯のカートも同じ） */
      const top = await p.evaluate(() => document.getElementById('cart-open').getAttribute('aria-label'));
      t(ic.label === 'カートを見る（2冊）' && top === ic.label, `${vp.n}: カートのボタンは入っている冊数も名乗る (${ic.label}・${top})`);
      /* 右上のカートを押すと、商品詳細の上にカートが開く。閉じると商品詳細にもどる */
      await p.click('#item-cart'); await p.waitForTimeout(500);
      c = await cst();
      const onTop = await p.evaluate(() => !!document.elementFromPoint(innerWidth - 20, innerHeight / 2).closest('#cart'));
      t(c.cart && c.item && onTop, `${vp.n}: 商品詳細の右上のカートを押すと、商品詳細の上にカートが開く`);
      await p.click('.cart__close'); await p.waitForTimeout(500);
      c = await cst();
      t(!c.cart && c.item && c.lock, `${vp.n}: カートを閉じると商品詳細にもどる（後ろの棚は止めたまま）`);
      await p.click('#item-cart'); await p.waitForTimeout(500);
      await p.keyboard.press('Escape'); await p.waitForTimeout(500);
      c = await cst();
      t(!c.cart && c.item && c.focus === 'item-cart', `${vp.n}: Escape でもカートだけが閉じ、焦点は商品詳細のカートへ返る (${c.focus})`);
      /* 「カートを見る」を押すと、カートが開く */
      await p.click('.item__act--buy'); await p.waitForTimeout(500);
      c = await cst();
      t(c.cart && c.item && c.n === '2', `${vp.n}: 「カートを見る」を押すと、カートが開く（冊数は増えない ${c.n}）`);
      /* カートで取り消すと、商品詳細は「カートに入れる」にもどる */
      await p.click(`.cart__row[data-key="${key}"] [data-del]`); await p.waitForTimeout(250);
      await p.click('.cart__close'); await p.waitForTimeout(500);
      c = await cst();
      t(!c.cart && c.item && c.buy === 'カートに入れる' && !c.isIn && c.n === '1', `${vp.n}: カートで取り消すと「カートに入れる」にもどる (${c.buy}、${c.n}冊)`);
      /* 「カートに入れる」を押すと「カートを見る」に変わる。すぐにもう一度押しても（二度たたき）カートは開かない */
      await p.click('.item__act--buy'); await p.waitForTimeout(60);
      c = await cst();
      const c1 = c;
      await p.click('.item__act--buy'); await p.waitForTimeout(400);
      c = await cst();
      t(c1.buy === 'カートを見る' && c1.isIn && c1.n === '2' && /カートに入れました/.test(c1.toast) && !c.cart,
        `${vp.n}: 「カートに入れる」を押すと「カートを見る」に変わり、数が増える。すぐの二度目では開かない (${c1.buy}、${c1.n}冊)`);
      await p.click('.item__act--buy'); await p.waitForTimeout(500);
      c = await cst();
      t(c.cart && c.item && c.n === '2', `${vp.n}: そのあと「カートを見る」を押すと、そのままカートを見て購入へ進める`);
      const go = await p.evaluate(() => !document.getElementById('cart-go').disabled);
      t(go, `${vp.n}: 商品詳細から開いたカートでも「購入手続きへ」が押せる`);
      await p.keyboard.press('Escape'); await p.waitForTimeout(500);
      await p.keyboard.press('Escape'); await p.waitForTimeout(700);
      c = await cst();
      t(!c.cart && !c.item && !c.lock, `${vp.n}: カート、商品詳細の順に閉じて棚へもどる`);
      /* 商品詳細の上にカートを開いたまま戻る操作をすると、カートも商品詳細も閉じて棚へ（試し読みと同じ）。
         カートだけが棚の上に残らず、棚は動くように戻る */
      await openItem(p, sp);
      await p.click('#item-cart'); await p.waitForTimeout(500);
      const opened = (await cst()).cart;
      await p.goBack(); await p.waitForTimeout(800);
      const gb = await p.evaluate(() => ({ cart: !document.getElementById('cart').hidden, item: !document.getElementById('item').hidden,
        lock: document.body.classList.contains('peek-open'), st: history.state }));
      t(opened && !gb.cart && !gb.item && !gb.lock && !(gb.st && gb.st.item),
        `${vp.n}: 商品詳細の上にカートを開いたまま戻る操作をすると、カートも商品詳細も閉じて棚へもどる`);
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

    /* 覆いを押して閉じる。左から出るので、押すのは右の端。
       下へ送ったあとは帯が引っ込んでいるので、読み手と同じく少し上へ戻して出してから押す */
    await p.evaluate(() => window.scrollBy(0, -24)); await p.waitForTimeout(450);
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

/* ---- 4b. 上の帯の出し入れ ------------------------------------------
   9/29 のご依頼。棚と平台を一画面に収めるため、店内を下へ読み進めるあいだは上の帯を引っ込める。
   少し上へ戻せば出る。森が見えているうち（ページの先頭を含む）、覆いを開いているあいだ、
   キーボードで帯に来たときは出したまま。本を引き出した層は帯ごと覆うので、
   層を開いても閉じても帯の出し入れは変えない。「棚をのぞく」とメニューの売り場は、下へ送るときは
   看板の列を画面の上端に、上へ送るときは出てきた帯のすぐ下にそろえる。
   指（本物のタッチ）、マウスの輪、キーボード、iOS の Safari の高さの変わり方で確かめる。 */

/* 指で画面を送る。dy が正なら下へ（指は上へ動く）。
   指が動き始めてから画面が付いてくるまでの遊び（15px ほど）を足しておく。
   離す前に指を止め、離したあとに画面が流れ続けないようにする */
async function fingerScroll(cdp, p, x, y, dy) {
  const d = dy + Math.sign(dy) * 15;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++) {
    await p.waitForTimeout(16);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - d * i / 12 }] });
  }
  await p.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/* 帯の様子。出し入れの動き（0.3 秒）が止まってから読む。
   機械が混んでいると動きの始まりが遅れることがあるので、まだ滑っている途中なら止まるまで待つ */
async function barState(p, ms = 450) {
  await p.waitForTimeout(ms);
  await p.waitForFunction(() => document.querySelector('.topbar').getAnimations().every(a => a.playState !== 'running'),
    null, { timeout: 1500 }).catch(() => {});
  return p.evaluate(() => {
    const b = document.querySelector('.topbar'), r = b.getBoundingClientRect();
    const hidden = id => document.getElementById(id).hidden;
    return {
      away: b.classList.contains('is-away'), lit: b.classList.contains('is-lit'),
      top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1),
      shown: Math.abs(r.top) <= 0.5, gone: r.bottom <= 0.5,
      heads: [...document.querySelectorAll('.market__head')].map(e => +e.getBoundingClientRect().top.toFixed(1)),
      y: Math.round(window.scrollY),
      /* ページの終わりまで送ってある（これより下へは送れない） */
      end: window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 1,
      open: ['menu', 'cart', 'focus', 'item', 'peek'].filter(id => !hidden(id)).join(','),
    };
  });
}
/* 帯の出し入れを書き留める（送りの途中で、一度引っ込めた帯が出てこないか） */
const watchBar = p => p.evaluate(() => {
  const b = document.querySelector('.topbar');
  window.__bar = [];
  if (window.__barMo) window.__barMo.disconnect();
  window.__barMo = new MutationObserver(() => {
    const v = b.classList.contains('is-away');
    if (!window.__bar.length || window.__bar[window.__bar.length - 1] !== v) window.__bar.push(v);
  });
  window.__barMo.observe(b, { attributes: true, attributeFilter: ['class'] });
});
/* 帯の上の端を、描くたびに書き留める（滑らせずに出し入れしたか、途中の位置を見る） */
const trackBar = p => p.evaluate(() => {
  const b = document.querySelector('.topbar');
  window.__tops = []; window.__track = true;
  const f = () => {
    if (!window.__track) return;
    window.__tops.push(+b.getBoundingClientRect().top.toFixed(1));
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
});
const trackedTops = p => p.evaluate(() => { window.__track = false; return window.__tops; });
const centerOf = (p, sel) => p.evaluate(sel => {
  const r = document.querySelector(sel).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, sel);

async function topbarHide(b) {
  /* --- 指で送る。スマートフォン2機種とタブレット（出し入れは画面の大きさによらない） --- */
  for (const vp of [{ n: 'phone', w: 390, h: 844 }, { n: 'phone-short', w: 375, h: 667 }, { n: 'tablet', w: 834, h: 1112 }]) {
    const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: vp.w < 600, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { try { localStorage.setItem('shelf-hint', '1'); } catch (e) {} });
    await p.goto(URL, { waitUntil: 'networkidle' });
    const cdp = await ctx.newCDPSession(p);
    const n = vp.n, x = Math.round(vp.w / 2), y = Math.round(vp.h * 0.75);
    const tap = async sel => { const c = await centerOf(p, sel); await p.touchscreen.tap(c.x, c.y); };

    let s = await barState(p, 100);
    t(s.shown && !s.away && !s.lit, `${n}: ページの先頭（森の上）では帯が出ている`);
    await fingerScroll(cdp, p, x, y, Math.round(vp.h * 0.3));
    s = await barState(p);
    t(s.shown && !s.away && s.y > 100, `${n}: 森が見えているうちは、下へ送っても帯は出たまま（${s.y}px 送った）`);
    /* 森の下の端が帯の裏に入っても、まだ画面に残っているうちは出したまま（地は敷く） */
    await p.evaluate(() => window.scrollBy(0, document.querySelector('.hero').getBoundingClientRect().bottom - 30));
    s = await barState(p);
    t(s.shown && !s.away && s.lit, `${n}: 森の下の端が画面に残っているうちは、帯は出たまま（地は敷く）`);
    /* 森を抜けるまで、指で下へ送る */
    for (let i = 0; i < 8 && (await p.evaluate(() => window.scrollY)) < vp.h + 150; i++) {
      await fingerScroll(cdp, p, x, y, Math.round(vp.h * 0.4));
    }
    s = await barState(p);
    t(s.away && s.gone && s.lit, `${n}: 森を抜けて下へ送ると、帯は上へ引っ込む（${s.y}px、帯の下の端 ${s.bottom}px）`);
    const geo = await p.evaluate(() => {
      const b = document.querySelector('.topbar'), cs = getComputedStyle(b);
      return { disp: cs.display, vis: cs.visibility, tf: cs.transform, h: +b.getBoundingClientRect().height.toFixed(1),
               bar: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar')),
               docH: document.documentElement.scrollHeight };
    });
    const ty = +((geo.tf.match(/^matrix\((?:[^,]+,){5}\s*([-\d.]+)\)$/) || [])[1]);
    t(geo.disp !== 'none' && geo.vis === 'visible' && Math.abs(ty + geo.h) <= 0.5 && Math.abs(geo.h - geo.bar) <= 0.2,
      `${n}: 引っ込めるのは、帯をその高さだけ上へずらすだけ（消さない、高さはそのまま ${geo.h}px、${geo.tf}）`);
    /* 数 px の揺れでは出し入れしない */
    await p.evaluate(() => window.scrollBy(0, -4));
    s = await barState(p, 250);
    t(s.away, `${n}: 4px 戻っただけでは、帯は出てこない`);
    await fingerScroll(cdp, p, x, y, -16);
    s = await barState(p);
    t(s.shown && !s.away && s.lit, `${n}: 指で少し上へ戻すと、帯が出る（店内の地も敷いたまま、${s.y}px）`);
    t(geo.docH === await p.evaluate(() => document.documentElement.scrollHeight),
      `${n}: 帯を出し入れしても、本文の寸法は変わらない（ページの長さ ${geo.docH}px）`);
    await p.evaluate(() => window.scrollBy(0, 5));
    s = await barState(p, 250);
    t(!s.away, `${n}: 5px 進んだだけでは、帯は引っ込まない`);
    await fingerScroll(cdp, p, x, y, 40);
    s = await barState(p);
    t(s.away && s.gone, `${n}: また下へ送ると、帯は引っ込む`);

    /* 「棚をのぞく」。下へ送るので、帯は引っ込んで着き、看板の列が画面の上端に来る。
       送りの途中や、止まる間際の小さな動きで、帯が出てこない */
    await p.evaluate(() => window.scrollTo(0, 0));
    s = await barState(p);
    t(s.shown && !s.away, `${n}: 先頭へ戻ると、帯が出ている`);
    await watchBar(p);
    await tap('.hero__scroll');
    s = await barState(p, 1800);
    let log = await p.evaluate(() => window.__bar);
    t(s.away && s.gone && Math.abs(s.heads[0]) <= 1 && log.join() === 'true',
      `${n}: 「棚をのぞく」で、帯は引っ込み、看板の列が画面の上端に来る。途中で帯は出てこない（看板の列 ${s.heads[0]}px、出し入れ ${log.join('→')}）`);

    /* メニューの売り場。下の売り場へは看板の列を画面の上端に、上の売り場へは出てきた帯のすぐ下に */
    await fingerScroll(cdp, p, x, y, -16);
    s = await barState(p);
    await tap('#menu-open'); await p.waitForTimeout(600);
    s = await barState(p, 0);
    t(s.open === 'menu' && s.shown && !s.away, `${n}: メニューを開いているあいだ、帯は出ている`);
    await watchBar(p);
    await tap('#menu-markets li:nth-child(2) a');
    s = await barState(p, 1800);
    log = await p.evaluate(() => window.__bar);
    /* 背の高い画面では、2つめの売り場はページの終わりに近く、看板の列を上端まで送れない。
       そのときはページの終わりで止まる */
    t(!s.open && s.away && s.gone && (Math.abs(s.heads[1]) <= 1 || (s.end && s.heads[1] > 0)) && log.join() === 'true',
      `${n}: メニューで下の売り場を選ぶと、帯は引っ込み、看板の列が画面の上端に来る（看板の列 ${s.heads[1]}px${s.end ? '、ページの終わり' : ''}、出し入れ ${log.join('→')}）`);
    await fingerScroll(cdp, p, x, y, -16);
    await barState(p);
    await tap('#menu-open'); await p.waitForTimeout(600);
    await tap('#menu-markets li:nth-child(1) a');
    s = await barState(p, 1800);
    t(!s.open && s.shown && !s.away && Math.abs(s.heads[0] - s.bottom) <= 1,
      `${n}: メニューで上の売り場を選ぶと、帯は出たまま、看板の列は帯のすぐ下に来る（看板の列 ${s.heads[0]}px / 帯の下の端 ${s.bottom}px）`);
    /* 覆いの端で閉じたあとも出したまま。次に下へ送ると引っ込む */
    await tap('#menu-open'); await p.waitForTimeout(600);
    await p.touchscreen.tap(vp.w - 8, Math.round(vp.h / 2));
    s = await barState(p, 600);
    t(!s.open && s.shown && !s.away, `${n}: メニューを閉じたあとも、帯は出ている`);
    await fingerScroll(cdp, p, x, y, 40);
    s = await barState(p);
    t(s.away, `${n}: そのあと下へ送ると、帯は引っ込む`);

    /* カート。開いているあいだは出たまま（指で送ろうとしても）。閉じたあとも出ている */
    await fingerScroll(cdp, p, x, y, -16);
    await barState(p);
    await tap('#cart-open'); await p.waitForTimeout(600);
    await fingerScroll(cdp, p, x, y, 80);
    s = await barState(p);
    t(s.open === 'cart' && s.shown && !s.away, `${n}: カートを開いているあいだ、指で送ろうとしても帯は出ている`);
    await tap('.cart__close');
    s = await barState(p, 600);
    t(!s.open && s.shown && !s.away, `${n}: カートを閉じたあとも、帯は出ている`);

    /* 引き出した本の層。帯を引っ込めて棚を見ているところで本をタップしても、帯は引っ込めたまま
       （層が帯ごと覆うので、出してもぼかしの向こうでちらつくだけ）。
       棚にもどっても引っ込めたまま。本を見て戻っただけで、帯が看板の列にかぶらない */
    await p.evaluate(() => {
      const h = document.querySelector('.market__head');
      window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 120);
    });
    await barState(p);
    await fingerScroll(cdp, p, x, Math.round(vp.h * 0.9), 120);
    s = await barState(p);
    t(s.away && Math.abs(s.heads[0]) <= 3, `${n}: 棚を見るところ（帯は引っ込み、看板の列は上端 ${s.heads[0]}px）`);
    const head1 = s.heads[0], yShelf = s.y;
    let sp = await spineAt(p, 0, 'aya');
    await trackBar(p);
    await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(750);
    s = await barState(p, 0);
    const over = await p.evaluate(() => { const e = document.elementFromPoint(20, 20); return !!(e && e.closest('#focus')); });
    t(s.open === 'focus' && s.away && over, `${n}: 本を引き出しているあいだも、帯は引っ込めたまま（層が帯の上にかぶる）`);
    /* 左の本は、手前へ出ると画面の左の上へ寄る（近づいた物は外側へずれる）。棚へもどすのは反対の右の上で */
    await touchTap(cdp, p, vp.w - 12, 60);
    s = await barState(p, 600);
    const tops = await trackedTops(p);
    t(!s.open && s.away && s.gone && s.y === yShelf && Math.abs(s.heads[0] - head1) <= 1,
      `${n}: 棚にもどると、開く前のとおり帯は引っ込んだまま。看板の列にかぶらない（看板の列 ${s.heads[0]}px、帯の下の端 ${s.bottom}px）`);
    t(tops.length > 20 && tops.every(v => Math.abs(v + s.bottom - s.top) <= 0.5),
      `${n}: 層を開いても閉じても、帯は動かない（帯の上の端 ${[...new Set(tops)].join('・')}px）`);
    await fingerScroll(cdp, p, x, y, -16);
    s = await barState(p);
    t(s.shown && !s.away, `${n}: そのあと少し上へ戻すと、帯が出る（引き出した本の層のあと）`);
    /* 帯が出ているところで引き出したときは、棚へもどしても出たまま */
    sp = await spineAt(p, 0, 'aya');
    await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(750);
    await touchTap(cdp, p, vp.w - 12, 60);
    s = await barState(p, 600);
    t(!s.open && s.shown && !s.away, `${n}: 帯が出ているところで引き出したときは、棚へもどしても帯は出たまま`);
    await fingerScroll(cdp, p, x, y, 40);
    s = await barState(p);
    t(s.away, `${n}: そのあと下へ送ると、帯は引っ込む（引き出した本の層のあと）`);

    /* 商品詳細と試し読み。開いているあいだは出たまま、閉じたあとも出ている */
    const yItem = await p.evaluate(() => Math.round(window.scrollY));
    sp = await spineAt(p, 0, 'aya');
    await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(750);
    const bk = await p.evaluate(() => { const r = document.querySelector('.focus__book').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await touchTap(cdp, p, bk.x, bk.y); await p.waitForTimeout(900);
    s = await barState(p, 0);
    t(s.open === 'item' && !s.away, `${n}: 商品詳細を開いているあいだ、帯は出ている`);
    await tap('.item__act--read'); await p.waitForTimeout(700);
    s = await barState(p, 0);
    t(s.open === 'item,peek' && !s.away, `${n}: 試し読みを開いているあいだ、帯は出ている`);
    await tap('.peek__close'); await p.waitForTimeout(600);
    await tap('.item__back');
    s = await barState(p, 800);
    t(!s.open && s.shown && !s.away, `${n}: 商品詳細を閉じて棚にもどったあとも、帯は出ている`);
    /* 住所欄には「棚をのぞく」の印（#theme-1）が付いている。戻る操作でブラウザがその看板まで
       跳ばず、開く前と同じ位置にもどる */
    const hash = await p.evaluate(() => location.hash);
    t(s.y === yItem && hash === '#theme-1',
      `${n}: 住所欄に売り場の印（${hash}）があっても、商品詳細を閉じると開く前と同じ位置にもどる（${s.y}/${yItem}）`);
    /* 商品詳細を開いたまま読み込み直しても（iOS の Safari が裏に回したタブを読み込み直すときも）、
       「棚にもどる」でも戻る操作でも、開く前の位置にもどる */
    for (const how of ['棚にもどる', '戻る操作']) {
      sp = await spineAt(p, 0, 'aya');
      await touchTap(cdp, p, sp.x, sp.y); await p.waitForTimeout(750);
      const bk2 = await p.evaluate(() => { const r = document.querySelector('.focus__book').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await touchTap(cdp, p, bk2.x, bk2.y); await p.waitForTimeout(900);
      const yRe = await p.evaluate(() => Math.round(window.scrollY));
      await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(900);
      const re = await barState(p, 0);
      if (how === '棚にもどる') await tap('.item__back'); else await p.goBack();
      s = await barState(p, 800);
      t(re.open === 'item' && !s.open && s.y === yRe,
        `${n}: 商品詳細を開いたまま読み込み直しても、${how}で開く前の位置にもどる（${s.y}/${yRe}）`);
    }
    await fingerScroll(cdp, p, x, y, 40);
    s = await barState(p);
    t(s.away, `${n}: そのあと下へ送ると、帯は引っ込む（商品詳細のあと）`);

    t(errs.length === 0, `${n}: 帯の出し入れでJSエラーなし${errs.length ? ' — ' + errs[0] : ''}`);
    await ctx.close();
  }

  /* --- マウスの輪とキーボード（パソコン） --- */
  {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.mouse.move(720, 450);
    const tr0 = await p.evaluate(() => { const c = getComputedStyle(document.querySelector('.topbar')); return [c.transitionProperty, c.transitionDuration]; });
    for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 400); await p.waitForTimeout(120); }
    let s = await barState(p);
    const tr1 = await p.evaluate(() => { const c = getComputedStyle(document.querySelector('.topbar')); return [c.transitionProperty, c.transitionDuration]; });
    t(s.away && s.gone, `PC: 輪で下へ送ると、帯は引っ込む（帯の下の端 ${s.bottom}px）`);
    /* 滑らせる長さは 0.25〜0.3 秒。動かすのは位置（transform）だけ */
    const secs = v => parseFloat(v) * (/ms$/.test(v) ? 0.001 : 1);
    t(tr0[0] === 'transform' && tr1[0] === 'transform' && [tr0[1], tr1[1]].every(v => secs(v) >= 0.25 && secs(v) <= 0.3),
      `PC: 帯は位置だけを 0.25〜0.3 秒で滑らせる（出る ${tr0.join(' ')}・引っ込む ${tr1.join(' ')}）`);
    const yDown = s.y;
    await p.mouse.wheel(0, -60);
    s = await barState(p);
    t(s.shown && !s.away, `PC: 輪で少し上へ戻すと、帯が出る（${yDown}→${s.y}px、帯の上の端 ${s.top}px）`);
    /* マウスで帯のボタンを押したあと、焦点がボタンに残っていても、下へ送れば引っ込む */
    await p.click('.topbar__search'); await p.waitForTimeout(300);
    const onBtn = await p.evaluate(() => document.activeElement.classList.contains('topbar__search'));
    await p.mouse.move(720, 450);
    await p.mouse.wheel(0, 200);
    s = await barState(p);
    t(s.away, `PC: マウスで帯のボタンを押したあとも、下へ送れば帯は引っ込む（焦点はボタンに${onBtn ? '残っている' : '無い'}）`);
    /* キーボード。引っ込めたまま Shift+Tab で帯に戻ると、帯が出る。帯の中にいるあいだは引っ込めない */
    await p.evaluate(() => document.querySelector('.hero__scroll').focus({ preventScroll: true }));
    const y0 = await p.evaluate(() => Math.round(window.scrollY));
    await p.keyboard.press('Shift+Tab');
    s = await barState(p);
    const act = await p.evaluate(() => document.activeElement.id);
    t(s.shown && !s.away && act === 'cart-open' && s.y === y0,
      `PC: キーボードで帯に焦点が来ると、その場で帯が出る（${act}、${s.y}/${y0}px）`);
    await p.mouse.wheel(0, 300);
    s = await barState(p);
    t(s.shown && !s.away && s.y > y0, `PC: キーボードで帯を使っているあいだは、下へ送っても引っ込めない（${s.y - y0}px 送った）`);
    t(errs.length === 0, `PC: 帯の出し入れでJSエラーなし${errs.length ? ' — ' + errs[0] : ''}`);
    await p.close();
  }

  /* --- 動きを減らす設定。滑らせず、その場で出し入れする --- */
  {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true });
    await p.goto(URL, { waitUntil: 'networkidle' });
    const step = dy => p.evaluate(dy => new Promise(res => {
      const b = document.querySelector('.topbar');
      if (dy) window.scrollBy(0, dy); else window.scrollTo(0, window.innerHeight * 2);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const r = b.getBoundingClientRect();
        res({ away: b.classList.contains('is-away'), top: r.top, bottom: r.bottom, anims: b.getAnimations().length,
              tp: getComputedStyle(b).transitionProperty });
      }));
    }), dy);
    const a = await step(0);
    t(a.away && a.bottom <= 0.5 && a.anims === 0 && a.tp === 'none',
      `動きを減らす設定では、帯は滑らせずにその場で引っ込む（下の端 ${a.bottom}px、動き ${a.anims}、${a.tp}）`);
    const c = await step(-20);
    t(!c.away && Math.abs(c.top) <= 0.5 && c.anims === 0 && c.tp === 'none',
      `動きを減らす設定では、帯は滑らせずにその場で出る（上の端 ${c.top}px、動き ${c.anims}）`);
    await p.close();
  }

  /* --- キーボードで棚を見る（パソコン）。帯を引っ込めているあいだは、帯の下に空ける間合い
     （scroll-padding-top）も小さくする。タブ送りで画面が上へ戻って帯が出てきたり、
     焦点の先に帯がかぶったりしない --- */
  {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { try { localStorage.setItem('shelf-hint', '1'); } catch (e) {} });
    await p.goto(URL, { waitUntil: 'networkidle' });
    const pad = () => p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop));
    const padShown = await pad();
    await p.evaluate(() => document.querySelector('.hero__scroll').focus());
    await p.keyboard.press('Enter');
    let s = await barState(p, 2300);
    const padAway = await pad();
    t(s.away && s.gone && Math.abs(s.heads[0]) <= 1 && padAway < 40 && padShown > 90,
      `PC キーボード: 「棚をのぞく」のあと帯は引っ込み、帯の下の間合いも小さくなる（${padShown}px → ${padAway}px）`);
    await watchBar(p);
    const y0 = s.y;
    for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); await p.waitForTimeout(200); }
    s = await barState(p, 0);
    let log = await p.evaluate(() => window.__bar);
    const inShelf = await p.evaluate(() => !!document.activeElement.closest('.market'));
    t(inShelf && s.away && s.y === y0 && log.every(v => v),
      `PC キーボード: 棚の本へタブ送りしても、画面は動かず帯も出てこない（${s.y}/${y0}px、出し入れ ${log.join('→') || 'なし'}）`);
    /* 下の売り場から Shift+Tab で上の売り場へ戻る。焦点の先を見せる送りは上向きだが、帯は出さない */
    await p.evaluate(() => {
      document.querySelectorAll('.will-reveal').forEach(e => e.classList.add('is-in'));
      const h = document.querySelectorAll('.market__head')[1];
      window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 200);
    });
    await p.waitForTimeout(300);
    await p.evaluate(() => window.scrollBy(0, 200));
    await barState(p);
    await p.evaluate(() => {
      const mk = document.querySelectorAll('.market')[1];
      const e = [...mk.querySelectorAll('.spine')].find(e => e.tabIndex >= 0 && getComputedStyle(e).display !== 'none');
      e.focus({ preventScroll: true });
    });
    const under = [];
    let reached = false;
    for (let i = 0; i < 8; i++) {
      await p.keyboard.press('Shift+Tab'); await p.waitForTimeout(250);
      const a = await p.evaluate(() => {
        const a = document.activeElement, r = a.getBoundingClientRect();
        const bar = document.querySelector('.topbar').getBoundingClientRect();
        return { top: Math.round(r.top), bar: Math.round(bar.bottom), k: a.dataset.book || a.className.toString().slice(0, 20),
                 m: [...document.querySelectorAll('.market')].findIndex(m => m.contains(a)) };
      });
      if (a.m === 0) reached = true;
      if (a.top < a.bar) under.push(`${a.k} ${a.top}/${a.bar}px`);
    }
    t(reached && under.length === 0,
      `PC キーボード: 下の売り場から Shift+Tab で上の売り場へ戻っても、焦点の先に帯がかぶらない${under.length ? '（' + under.join('、') + '）' : ''}`);
    t(errs.length === 0, `PC キーボード: JSエラーなし${errs.length ? ' — ' + errs[0] : ''}`);
    await p.close();
  }

  /* --- iOS の Safari。下へ送るとブラウザの帯が引っ込み、見える高さだけが変わる
     （390x664 ↔ 390x750）。その出入りでは帯を出し入れせず、本文も動かさない。
     ページの終わりでは、高さが変わると位置が端に丸められて上へ動く。それも上へ戻したと数えない。
     この検査の画面（Chromium）では高さを変えると svh も変わり、森の高さが伸び縮みする
     （実機の Safari では svh は変わらない）。森が画面に入らない2つめの売り場で見て、
     本文が動かないことは同じ高さどうしで比べる --- */
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { try { localStorage.setItem('shelf-hint', '1'); } catch (e) {} });
    await p.goto(URL, { waitUntil: 'networkidle' });
    const cdp = await ctx.newCDPSession(p);
    const size = async hh => { await p.setViewportSize({ width: 390, height: hh }); await p.waitForTimeout(200); };
    const head = () => p.evaluate(() => +document.querySelectorAll('.market__head')[1].getBoundingClientRect().top.toFixed(1));
    await p.evaluate(() => {
      document.querySelectorAll('.will-reveal').forEach(e => e.classList.add('is-in'));
      const h = document.querySelectorAll('.market__head')[1];
      window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 120);
    });
    await barState(p);
    await fingerScroll(cdp, p, 195, 598, 120);
    let s = await barState(p);
    t(s.away && s.gone, `iOS Safari: 2つめの売り場を見るところで、帯は引っ込んでいる（看板の列 ${s.heads[1]}px）`);
    await watchBar(p);
    await size(750);
    const h0 = await head();
    await size(664); await size(750);
    const h1 = await head();
    let log = await p.evaluate(() => window.__bar);
    s = await barState(p, 100);
    t(s.away && s.gone && log.every(v => v) && Math.abs(h1 - h0) <= 1,
      `iOS Safari: ブラウザの帯が出入りしても（高さ 664↔750）、帯は引っ込んだまま、本文も動かない（看板の列 ${h0}→${h1}px、出し入れ ${log.join('→') || 'なし'}）`);
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    s = await barState(p);
    const yEnd = s.y;
    await watchBar(p);
    await size(664); await size(750); await size(664);
    log = await p.evaluate(() => window.__bar);
    s = await barState(p, 100);
    t(s.away && s.gone && s.end && s.y < yEnd && log.every(v => v),
      `iOS Safari: ページの終わりで高さが変わり、位置が端に丸められて上へ動いても、帯は出てこない（${yEnd}→${s.y}px、出し入れ ${log.join('→') || 'なし'}）`);
    t(errs.length === 0, `iOS Safari: JSエラーなし${errs.length ? ' — ' + errs[0] : ''}`);
    await ctx.close();
  }
}

/* ---- 5. 今回のご指摘4件 ------------------------------------------
   拡大したときの粗さ（試し読み）／詳細の出口／上の帯／画面の送り。
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

    /* --- 上の帯は、下へ読み進めると引っ込み、少し戻せば出る（9/29 から。詳しくは 4b） --- */
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
      return { bottom: Math.round(bar.getBoundingClientRect().bottom), away: bar.classList.contains('is-away') };
    });
    t(s.away && s.bottom <= 0, `${vp.n}: 下へ読み進めると、帯は上へ引っ込む（帯の下の端 ${s.bottom}px）`);
    /* 少し上へ戻すと出る。出たときには店内の地が敷かれている */
    await p.evaluate(() => window.scrollBy(0, -24));
    await p.waitForTimeout(700);
    s = await p.evaluate(() => {
      const bar = document.querySelector('.topbar');
      return { top: Math.round(bar.getBoundingClientRect().top),
               lit: bar.classList.contains('is-lit'),
               op: +getComputedStyle(bar, '::before').opacity };
    });
    t(s.top === 0, `${vp.n}: 少し上へ戻すと、帯が上端に出る`);
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

    /* --- タブ送りやページ内検索で上へ戻るときは、出てくる帯の下に隠れない --- */
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(400);
    const pad = await p.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop));
    t(pad > 80, `${vp.n}: ブラウザが画面を送るときは、帯のぶん手前で止める（${Math.round(pad)}px）`);

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
      const head = document.querySelector('.market__head').getBoundingClientRect();
      const bar = document.querySelector('.topbar').getBoundingClientRect();
      return { top: Math.round(r.top), head: +head.top.toFixed(1), bar: Math.round(bar.bottom) };
    });
    t(s.top >= s.bar && s.bar <= 0 && Math.abs(s.head) <= 1,
      `${vp.n}: 送った先の看板が帯に隠れない。帯は引っ込み、看板の列が画面の上端に来る（看板の列 ${s.head} / 看板 ${s.top} / 帯 ${s.bar}）`);

    /* --- 試し読み。手を止めたら層から降りて描き直される --- */
    const sp = await p.$('.spine[data-book]');
    await openItem(p, sp);
    const yOpen = await p.evaluate(() => Math.round(window.scrollY));
    await p.click('.item__act--read'); await p.waitForTimeout(900);
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

    /* --- 商品詳細の出口は二か所、言葉は同じ（試し読みを閉じると、商品詳細にもどっている） --- */
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
    t(s.top === '棚にもどる', `${vp.n}: 上の出口が行き先どおりの言葉（${s.top}）`);
    t(s.bottom === s.top, `${vp.n}: 本文の終わりにも同じ出口`);
    t(s.last, `${vp.n}: その出口が本文のいちばん最後にある`);
    t(s.h >= 44, `${vp.n}: 出口が指で押せる大きさ（${s.h}px）`);
    t(s.barTop === 0, `${vp.n}: 読み進めても上の帯は流れ去らない`);

    await p.click('.item__close'); await p.waitForTimeout(700);
    s = await p.evaluate(() => ({
      item: document.getElementById('item').hidden,
      focusL: document.getElementById('focus').hidden,
      y: Math.round(window.scrollY),
      inside: document.getElementById('item').contains(document.activeElement),
      focus: document.activeElement.className || document.activeElement.tagName,
    }));
    t(s.item && s.focusL && s.y === yOpen, `${vp.n}: 閉じると、開く前と同じ位置の棚にもどる（${s.y}/${yOpen}）`);
    t(!s.inside, `${vp.n}: 閉じた商品詳細の中に焦点を残さない（${s.focus}）`);

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
      /* 引き出した本の後ろの幕（ぼかし）は、開いた状態では時間をかけて立ち上がる。その動きが残らないか */
      const f = document.getElementById('focus');
      f.classList.add('is-open');
      const sc = getComputedStyle(document.querySelector('.focus__scrim'));
      const d = sc.transitionDelay + ' ' + sc.transitionDuration;
      f.classList.remove('is-open');
      res({ steps: new Set(seen).size, delay: d,
            moved: Math.round(window.pageYOffset) > 100 });
    }, 900);
  }));
  t(r.moved && r.steps <= 3, `動きを減らす設定では、送らずに移る（${r.steps}こま）`);
  t(!/0\.1[0-9]s|0\.[2-9]/.test(r.delay), `動きを減らす設定では、遅れも残さない（${r.delay}）`);

  /* 本を引き出すときは、ただ現れる（透けた姿から浮かび上がる）のではなく、棚の自分の場所から
     短くまっすぐ手前へ滑り出て（0.28 秒ほど）、ふだんと同じ姿で止まる。頭を傾ける動きはなく、行き過ぎて戻ることもない。
     押しもどすときも、消えていくのではなく、本そのものが棚の自分の場所へ戻る */
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => {
    window.__anims = [];
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (k, o) {
      window.__anims.push({ id: this.id || this.className, keys: Object.keys(Object.assign({}, ...k)), d: o && o.duration,
                            tf: k.map(f => f.transform).filter(Boolean) });
      return orig.call(this, k, o);
    };
  });
  await toMarket(p, 0);
  /* マウスを乗せずにクリックだけを送る（乗せると本が持ち上がり、始まりの姿が 3.5px 上になる）。
     画面の端でない本で（端の本は画面に収めるため引き出す長さが短い） */
  const rm = await p.evaluate(async () => {
    const e = [...document.querySelectorAll('.case .row .spine[data-book]')].filter(e => getComputedStyle(e).display !== 'none')[2];
    const r0 = e.getBoundingClientRect(), kw = parseFloat(getComputedStyle(e).getPropertyValue('--kw'));
    const tier = e.closest('.tier');
    const band = { bandTop: tier.previousElementSibling.getBoundingClientRect().top, bandBot: tier.nextElementSibling.getBoundingClientRect().bottom,
                   mm: parseFloat(getComputedStyle(e).getPropertyValue('--mm')) || 1 };
    e.click();
    const f = document.getElementById('focus'), node = f.querySelector('.focus__book .spine');
    const an = document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#focus') && !(a instanceof CSSTransition));
    const main = an.find(a => a.effect.target === node);
    an.forEach(a => a.pause());
    const at = ms => { an.forEach(a => { a.currentTime = ms; }); const r = node.getBoundingClientRect();
      return { l: r.left, t: r.top, w: r.width, h: r.height, op: +getComputedStyle(node).opacity }; };
    const frames = [0, 50, 100, 150, 200, 250, 279].map(at);
    an.forEach(a => a.play());
    await new Promise(res => setTimeout(res, 350));
    const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
    return {
      r0: Object.assign({ l: r0.left, t: r0.top, w: r0.width, h: r0.height, r: r0.right, b: r0.bottom, kw }, band), frames, dur: main ? main.effect.getComputedTiming().duration : 0,
      open: !f.hidden, anims: window.__anims,
      tf: getComputedStyle(node).transform, op: getComputedStyle(node).opacity,
      scrim: getComputedStyle(document.querySelector('.focus__scrim')).opacity,
      end: { scale: +f.dataset.scale, pullK: +f.dataset.pull, clamp: f.dataset.clamp || '', node: R(node), vw: document.documentElement.clientWidth, vh: innerHeight,
             faces: [...f.querySelectorAll('.focus__face')].map(e => Object.assign(R(e), { side: e.className.replace(/.*is-/, '') })) },
    };
  });
  const bookA = rm.anims.find(a => /spine/.test(a.id));
  const f0 = rm.frames[0], fz = rm.end.node, cx = f => f.l + f.w / 2;
  const dirR = Math.sign(cx(rm.r0) - rm.end.vw / 2);
  const slide = Math.abs(f0.l - rm.r0.l) <= 1 && Math.abs(f0.t - rm.r0.t) <= 1 && Math.abs(f0.h - rm.r0.h) <= 1 &&
    rm.frames.every((f, i) => f.op === 1 && f.h <= fz.h + 0.5 && (i === 0 || (f.h >= rm.frames[i - 1].h - 0.5 &&
      dirR * (cx(f) - cx(rm.frames[i - 1])) >= -0.3)));
  t(rm.open && bookA && rm.dur >= 250 && rm.dur <= 300 && slide && !bookA.keys.includes('opacity') &&
    rm.anims.every(a => a.d <= 300 && !a.tf.some(v => /rotate/.test(v))),
    `動きを減らす設定では、棚の自分の場所から短くまっすぐ滑り出る。透けず、傾けず、行き過ぎない（${rm.dur}ms、高さ ${rm.frames.map(f => f.h.toFixed(0)).join('→')}px）`);
  const rg = pose3d(rm.end, rm.r0);
  t(rm.tf === 'none' && rm.op === '1' && rm.scrim === '1' && rg.scaleOk && rg.pullOk && rg.dev <= 1 && rg.backOk && rg.sideOk && rg.inBand && rg.midOk,
    `動きを減らす設定でも、止まった姿はふだんと同じ（${rm.end.scale}倍、引き出した長さ ${(rm.end.pullK * 100).toFixed(0)}%、面 ${rm.end.faces.map(f => f.side).join('・')}）`);
  /* 開いてすぐ（450ms）のクリックは受けないので、待ってから */
  await p.waitForTimeout(300);
  await p.mouse.click(8, 8);
  const rc = await p.evaluate(() => {
    const f = document.getElementById('focus'), bx = f.querySelector('.focus__book .spine');
    const an = document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#focus') && !(a instanceof CSSTransition));
    const main = an.find(a => a.effect.target === bx);
    if (!main) return null;
    an.forEach(a => a.pause());
    const d = main.effect.getComputedTiming().duration;
    const mid = (an.forEach(a => { a.currentTime = d / 2; }), +getComputedStyle(bx).opacity);
    an.forEach(a => { a.currentTime = d - 1; });
    const nb = bx.getBoundingClientRect(), e = document.querySelector('.is-taken').getBoundingClientRect();
    const keys = Object.keys(Object.assign({}, ...main.effect.getKeyframes()));
    const op = +getComputedStyle(bx).opacity;
    an.forEach(a => a.finish());
    return { d, keys, mid, op, off: Math.max(Math.abs(nb.left - e.left), Math.abs(nb.top - e.top), Math.abs(nb.height - e.height)) };
  });
  t(rc && rc.d >= 100 && rc.d <= 240 && !rc.keys.includes('opacity') && rc.mid === 1 && rc.op === 1 && rc.off <= 1,
    `動きを減らす設定では、押しもどすときも透けずに、棚の自分の場所へ短く戻る（${rc ? rc.d + 'ms、ずれ ' + rc.off.toFixed(1) + 'px' : '動きなし'}）`);
  await p.waitForTimeout(300); await still(p);
  t(await p.evaluate(() => document.getElementById('focus').hidden), '動きを減らす設定でも、ほかのところで棚へもどす');
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
  await oneScreen(b);
  await tierFollow(b);
  await light(b);
  await picking(b);
  await tapFlow(b);
  await pcFlow(b);
  await screens(b);
  await pages(b);
  await nav(b);
  await topbarHide(b);
  await fixes(b);
  await widths(b);
  await b.close();
  fail.forEach(l => console.log('  FAIL  ' + l));
  console.log(`${ok.length} passed, ${fail.length} failed`);
  process.exit(fail.length ? 1 : 0);
})();
