#!/usr/bin/env node
/**
 * dev-server.js — 브라우저에서 웹앱을 그대로 열어 보는 개발 서버
 *
 *   node tools/dev-server.js          → http://localhost:8080
 *   PORT=3000 node tools/dev-server.js
 *
 * Vercel 배포(api/index.js)와 같은 lib/gas-runtime.js 를 쓰므로,
 * 여기서 보이는 화면이 Vercel 에 올라갈 화면과 같다.
 * Apps Script 전용 기능(드라이브 저장)은 동작하지 않는다.
 */
const http = require('http');
const { loadContext, renderIndex, handleApi } = require('../lib/gas-runtime');

const PORT = process.env.PORT || 8080;
const ctx = loadContext('vercel');
const page = renderIndex(ctx);

http.createServer(function (req, res) {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async function () {
      let call = {};
      try { call = JSON.parse(body || '{}'); } catch (e) { /* 무시 */ }
      const out = await handleApi(ctx, call);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
}).listen(PORT, function () {
  console.log('개발 서버 실행 중 → http://localhost:' + PORT);
});
