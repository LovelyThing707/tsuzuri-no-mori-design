// サイト全体に Basic 認証をかける。
// 第2稿の確認用URLなので、検索や偶然の訪問から閉じておく。
//
// 合言葉は環境変数 SITE_USER / SITE_PASS で上書きできる。
// Vercel の Settings > Environment Variables に入れると、
// このファイルを触らずに変更できる。

const USER = 'tsuzuri';
const PASS = 'vskE-5Xi4-BcAo';

export const config = {
  // Vercel の内部パスだけ除く。それ以外はすべて認証の対象。
  matcher: '/((?!_vercel).*)',
};

// 文字列の比較。先頭が違っても最後まで見る。
function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default function middleware(request) {
  const user = process.env.SITE_USER || USER;
  const pass = process.env.SITE_PASS || PASS;

  const header = request.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');

  if (scheme === 'Basic' && encoded) {
    let decoded = '';
    try {
      decoded = atob(encoded);
    } catch {
      decoded = '';
    }
    const at = decoded.indexOf(':');
    if (at > -1 && same(decoded.slice(0, at), user) && same(decoded.slice(at + 1), pass)) {
      return; // 通す
    }
  }

  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Tsuzuri no Mori", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}
