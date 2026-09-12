/**
 * api/index.js — Vercel 서버리스 진입점
 *
 *  GET  /*     → 웹앱 화면 (src/Index.html 을 렌더해서 돌려준다)
 *  POST /api   → google.script.run 호출 중계
 *
 * 같은 src/*.gs 소스를 Apps Script 와 함께 쓴다. 자세한 구조는
 * lib/gas-runtime.js 참고.
 */
const { loadContext, renderIndex, handleApi } = require('../lib/gas-runtime');

/* 콜드 스타트에서 한 번만 만들고 이후 호출에서 재사용한다. */
let ctx = null;
let page = null;
function ready() {
  if (!ctx) { ctx = loadContext('vercel'); page = renderIndex(ctx); }
  return ctx;
}

module.exports = async function handler(req, res) {
  try {
    ready();

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      if (!body) body = await readJson(req);
      const out = await handleApi(ctx, body);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(JSON.stringify(out));
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).send('Method Not Allowed');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    return res.status(200).send(page);
  } catch (e) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(500).send('서버 오류: ' + e.message);
  }
};

function readJson(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); } });
  });
}
