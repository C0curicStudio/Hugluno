'use strict';
/* 把模型回答渲染成 HTML：Markdown（marked）→ 净化（DOMPurify，远程图片一律不加载）→ 数学公式（KaTeX）→ 工具卡 / 学习窗口入口（mxui.js）。 */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  if (window.DOMPurify) {
    DOMPurify.addHook('afterSanitizeAttributes', n => {
      if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); }
      if (n.tagName === 'IMG') { // 远程图片 = 一次对外请求（可被用来追踪）：不加载，改成文字链接
        const src = n.getAttribute('src') || '';
        if (!/^data:image\//i.test(src)) { const a = document.createElement('span'); a.className = 'noimg'; a.textContent = '🖼 ' + (n.getAttribute('alt') || src.slice(0, 60)); n.replaceWith(a); }
      }
    });
  }
  function md(text, live) {
    const code = [], math = [], figs = [];
    const put = h => { figs.push(h); return `\n\n@@G${figs.length - 1}@@\n\n`; };
    if (window.MXUI && /ui_schema|"type"\s*:\s*"text"|```mx(ui|lab)/.test(text)) { // 工具卡 / 学习窗口：回答里只留一枚入口，真正的界面在右边的工作台
      if (!text.includes('```') && window.MXUI.looks(text)) { const p = MXUI.parse(text); if (p.mode !== 'text') return MXUI.render(text, { live }); text = p.text || ''; }
      else if (/^\s*\{\s*"type"\s*:\s*"ui_schema"/.test(text)) return MXUI.render(text, { live });
      text = text.replace(/```mxui[ \t]*\n([\s\S]*?)\n?```/g, (m, j) => put(MXUI.render(j, { live })));
      if (live) text = text.replace(/```mxui[ \t]*\n([\s\S]*)$/, (m, j) => put(MXUI.render(j.replace(/\s*`{0,3}\s*$/, ''), { live: true })));
      text = text.replace(/```mxlab[ \t]*\n([\s\S]*?)\n?```/g, (m, j) => put(MXUI.lab(j, { live })));
      if (live) text = text.replace(/```mxlab[ \t]*\n([\s\S]*)$/, (m, j) => put(MXUI.lab(j.replace(/\s*`{0,3}\s*$/, ''), { live: true })));
    }
    let t = text.replace(/```[\s\S]*?(```|$)|`[^`\n]+`/g, m => { code.push(m); return `@@C${code.length - 1}@@`; });
    t = t.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(^|[^\\$\d])\$(?!\s)([^\n$]*[^\s$])\$(?!\d)/g,
      (m, a, b, c, pre, d) => { math.push([a ?? b ?? c ?? d, a !== undefined || b !== undefined]); return (d !== undefined ? pre : '') + `@@M${math.length - 1}@@`; });
    t = t.replace(/@@C(\d+)@@/g, (m, i) => code[i]);
    let html;
    try { html = window.marked ? marked.parse(t) : `<p>${esc(t)}</p>`; } catch { html = `<p>${esc(t)}</p>`; }
    html = window.DOMPurify ? DOMPurify.sanitize(html) : `<p>${esc(text)}</p>`; // 没加载到净化库就当纯文本，绝不输出未净化的 HTML
    html = html.replace(/(?:<p>)?@@G(\d+)@@(?:<\/p>)?/g, (m, i) => figs[i]);
    return html.replace(/@@M(\d+)@@/g, (m, i) => {
      const [src, disp] = math[i];
      if (!window.katex) return esc(disp ? '$$' + src + '$$' : '$' + src + '$');
      try { return katex.renderToString(src.trim(), { displayMode: disp, throwOnError: false, output: 'html', strict: 'ignore', trust: false }); } catch { return esc(src); }
    });
  }
  window.HugRender = { md, esc };
})();
