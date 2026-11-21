// 测试用的假模型服务：OpenAI 兼容 /v1/models 和 /v1/chat/completions（流式），只监听本机。
import http from 'node:http';
export function startFake(reply = r => 'Hello from the fake model.') {
  const seen = [];
  const srv = http.createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-headers', '*'); res.setHeader('access-control-allow-methods', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    let body = ''; req.on('data', d => (body += d)); req.on('end', () => {
      if (req.url.endsWith('/models')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: [{ id: 'fake-1' }, { id: 'fake-2' }] })); }
      if (req.url.endsWith('/chat/completions')) {
        const j = JSON.parse(body || '{}'); seen.push({ auth: req.headers.authorization, body: j });
        const out = reply(j);
        if (j.stream === false) { // 非流式（本地 Agent）：reply 可以返回字符串，或 { content, tool_calls }
          const msg = typeof out === 'string' ? { role: 'assistant', content: out } : { role: 'assistant', content: out.content ?? null, ...(out.tool_calls ? { tool_calls: out.tool_calls } : {}) };
          res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ choices: [{ message: msg }] }));
        }
        const text = typeof out === 'string' ? out : out.content || ''; res.writeHead(200, { 'content-type': 'text/event-stream' });
        const parts = text.match(/[\s\S]{1,12}/g) || [];
        let i = 0; const t = setInterval(() => { if (i < parts.length) res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] }) + '\n\n'); else { res.write('data: [DONE]\n\n'); res.end(); clearInterval(t); } }, 8);
        return;
      }
      res.writeHead(404); res.end();
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, seen, base: 'http://127.0.0.1:' + srv.address().port + '/v1', close: () => srv.close() })));
}
