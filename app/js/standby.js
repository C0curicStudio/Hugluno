'use strict';
/* 静默待机的网页一侧（只在桌面版）：主进程怀疑你卡在报错上时，把窗口标题和一张截图交过来；这里用你填的那个模型（net.js）看一眼，
   只回答「有没有问题 / 一句话 / 怎么解决」；有问题才交回主进程亮黄灯。你点了黄灯 / 通知，就把解决办法放进一个新对话。 */
(() => {
  const D = window.HugDesk?.standby; if (!D) return;
  const start = () => {
    D.onCheck(async p => {
      try {
        const S = HugStore.Settings.get(); if (!S.base || !S.model || HugApp.busy()) return;
        const lang = { zh: '简体中文', en: 'English', fr: 'français' }[window.HUG_LANG] || 'English';
        const ask = `The user is working in "${String(p.app).slice(0, 80)}" (front window title: "${String(p.title).slice(0, 300)}"). Look at the screenshot and decide: are they stuck on an error, crash or failure right now? Reply with ONLY a JSON object: {"problem": true|false, "summary": "one short sentence in ${lang}", "fix": "concrete steps to fix it, in ${lang}, Markdown"}. If nothing is wrong or you are unsure, use "problem": false.`;
        const msg = img => [{ role: 'user', content: img ? [{ type: 'text', text: ask }, { type: 'image_url', image_url: { url: p.jpg } }] : ask }];
        let m; try { m = await HugNet.complete(msg(!!p.jpg), { purpose: 'standby' }); } catch (e) { if (e.status === 400 && p.jpg) m = await HugNet.complete(msg(false), { purpose: 'standby' }); else throw e; } // 模型不收图：只给标题
        const j = JSON.parse(String(m.content || '').match(/\{[\s\S]*\}/)?.[0] || '{}');
        if (j.problem === true) D.result({ problem: true, summary: String(j.summary || ''), fix: String(j.fix || ''), app: p.app, title: p.title });
      } catch {}
    });
    D.onOpen(h => HugApp.note(`**${L('standbyTitle')}** · ${h.app}${h.title ? ' — ' + h.title : ''}\n\n${h.summary}\n\n${h.fix}`));
  };
  if (window.HugApp) start(); else addEventListener('hug-ready', start, { once: true }); // 脚本经 hug:// 异步加载：页面可能已经就绪
})();
