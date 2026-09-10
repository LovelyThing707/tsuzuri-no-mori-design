# -*- coding: utf-8 -*-
"""固定ページの中身。要件定義書 2-7 のページ構成に対応する。

特定商取引法に基づく表記とプライバシーポリシーは、記載内容を
運営者様からご提供いただく必要がある。ここでは項目だけを並べ、
いただく箇所が一目で分かるようにしてある（そのまま依頼一覧になる）。
"""

NEED = '<span class="doc__need">ご提供をお願いいたします</span>'


def _rows(pairs):
    out = ['<dl class="doc__kv">']
    for k, v in pairs:
        out.append('<div><dt>%s</dt><dd>%s</dd></div>' % (k, v))
    out.append('</dl>')
    return '\n'.join(out)


PAGES = {
    'about': {
        'title': '綴りの森について',
        'body': """
<p class="doc__lead">本を選ぶ楽しみを、そのままに。</p>

<p>本屋で本を選ぶとき、私たちは目当ての一冊だけを見ているわけではありません。
棚の前に立ち、背表紙を目で追い、厚みや高さの違いを眺めながら、
思いがけない一冊に手が伸びる。あの時間そのものが、本を買うことの楽しさでした。</p>

<p>綴りの森は、その時間をそのまま持ち帰れないかと考えて作った書店です。
画面のなかの棚には、実際の本と同じ高さ、同じ厚みで本が並びます。
判型とページ数から一冊ずつ大きさを出しているので、
文庫のとなりに大きな絵本が立っている、あの不揃いな眺めが生まれます。</p>

<p>並べ方も、ジャンルの一覧ではなく「売り場」で考えています。
夜に読む本、子供に読みたい本。棚ごとにひとつのテーマがあり、
背表紙の段の手前には、店主が選んだ数冊が表紙を上にして置かれています。</p>

<p>森のなかに、小さな店がひとつ。
ゆっくり歩いて、棚の前で立ち止まっていただければと思います。</p>
""",
    },
    'tokusho': {
        'title': '特定商取引法に基づく表記',
        'body': """
<p class="doc__note">この画面は、記載する項目を並べたものです。
内容は運営者様よりご提供いただき、公開までに確定いたします。</p>
""" + _rows([
            ('販売業者', NEED),
            ('運営統括責任者', NEED),
            ('所在地', NEED),
            ('電話番号', NEED + '<br><span class="doc__sub">受付時間もあわせてお知らせください</span>'),
            ('メールアドレス', NEED),
            ('販売価格', '各商品ページに表示する価格（税込）'),
            ('商品代金以外の必要料金', '送料、および決済手数料<br><span class="doc__sub">金額の決定後に記載いたします</span>'),
            ('お支払い方法', 'クレジットカード、その他（Shopifyの決済で選べるもの）'),
            ('お支払い時期', 'ご注文時にお支払いが確定いたします'),
            ('引渡し時期', NEED + '<br><span class="doc__sub">ご注文から発送までの目安をお知らせください</span>'),
            ('返品・交換について', NEED + '<br><span class="doc__sub">不良品の場合と、お客様都合の場合を分けて記載いたします</span>'),
        ]),
    },
    'privacy': {
        'title': 'プライバシーポリシー',
        'body': """
<p class="doc__note">この画面は、記載する項目を並べたものです。
最終的な文面は、公開までに確定いたします。</p>

<h4>取得する情報</h4>
<p>ご注文の際に、お名前、ご住所、電話番号、メールアドレス、
お支払いに関する情報をお預かりいたします。
お支払いの情報は決済代行事業者が取り扱い、当店では保持いたしません。</p>

<h4>利用目的</h4>
<p>商品の発送、ご連絡、お問い合わせへの回答のために利用いたします。
ご案内のメールをお送りする場合は、事前に同意をいただきます。</p>

<h4>第三者への提供</h4>
<p>法令に基づく場合を除き、ご本人の同意なく第三者に提供することはございません。
配送のために、必要な範囲で配送事業者にお渡しいたします。</p>

<h4>開示・訂正・削除</h4>
<p>お預かりしている情報の開示、訂正、削除をご希望の場合は、
下記のお問い合わせよりご連絡ください。</p>

<h4>お問い合わせ窓口</h4>
<p><span class="doc__need">ご提供をお願いいたします</span></p>
""",
    },
    'contact': {
        'title': 'お問い合わせ',
        'body': """
<p>ご注文について、書籍について、そのほかお気づきのことがございましたら、
こちらからお知らせください。</p>

<form class="doc__form" onsubmit="return false;">
  <label class="doc__f">
    <span>お名前</span>
    <input type="text" name="name" autocomplete="name">
  </label>
  <label class="doc__f">
    <span>メールアドレス</span>
    <input type="email" name="email" autocomplete="email">
  </label>
  <label class="doc__f">
    <span>ご用件</span>
    <select name="topic">
      <option>ご注文について</option>
      <option>書籍について</option>
      <option>その他</option>
    </select>
  </label>
  <label class="doc__f">
    <span>お問い合わせ内容</span>
    <textarea name="body" rows="6"></textarea>
  </label>
  <button class="doc__send" type="submit">送信する</button>
  <p class="doc__note">この画面は見た目の確認用です。実際の送信は行われません。</p>
</form>
""",
    },
    'blog': {
        'title': 'お知らせ',
        'body': """
<p>入荷のご案内や、棚の入れ替えについてお知らせいたします。</p>
<p class="doc__note">Shopifyの標準機能を使います。公開後、運営者様ご自身で
記事を追加・編集していただけます。この画面は、記事の並び方の見本です。</p>

<ul class="doc__posts">
  <li>
    <p class="doc__date">2026年2月</p>
    <h4>綴りの森をひらきました</h4>
    <p>森のなかの小さな書店です。棚をのぞいてみてください。</p>
  </li>
  <li>
    <p class="doc__date">2026年2月</p>
    <h4>「夜に読む本」の棚をつくりました</h4>
    <p>眠る前のひとときに置いておきたい本を集めています。</p>
  </li>
</ul>
""",
    },
}


def pages_html():
    out = []
    for key, p in PAGES.items():
        out.append(
            '    <article class="doc__page" data-page="%s" hidden>\n'
            '      <h2 class="doc__title">%s</h2>\n'
            '%s\n'
            '    </article>' % (key, p['title'], p['body'].strip()))
    return '\n'.join(out)
