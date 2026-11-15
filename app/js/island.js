'use strict';
/* Lunosland 的网页一侧（只在桌面版有效）：岛上回车的话交给这里发送；回答写完告诉岛停止微光；工作台打开时让岛缩到屏幕边缘。
   网页版没有 window.HugDesk，整个文件什么都不做。 */
(() => {
  addEventListener('hug-ready', () => {
    const D = window.HugDesk?.island; if (!D) return;
    D.enable(HugStore.Settings.get().island !== false);
    let watch = 0;
    D.onSubmit(text => {
      HugApp.submit(String(text || '').slice(0, 8000)); const t0 = Date.now(); let seen = false; clearInterval(watch);
      watch = setInterval(() => { const b = HugApp.busy(); if (b) seen = true; if ((seen && !b) || (!seen && Date.now() - t0 > 4000) || Date.now() - t0 > 6e5) { clearInterval(watch); D.state({ pending: false }); } }, 400);
    });
    let edge = null;
    new MutationObserver(() => { const e = HugApp.appEl.classList.contains('mxw-open'); if (e !== edge) { edge = e; D.state({ edge: e }); } }).observe(HugApp.appEl, { attributes: true, attributeFilter: ['class'] });
  });
})();
