'use strict';
/* 只为电脑端设计：手机 / 平板（触屏为主）直接显示提示页，不加载应用。 */
(() => {
  const ua = navigator.userAgent || '';
  const ipadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const mobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua) || ipadOS;
  const coarseOnly = matchMedia('(pointer:coarse)').matches && !matchMedia('(any-pointer:fine)').matches;
  if (!(mobile || coarseOnly)) return;
  window.HUG_GATED = true;
  addEventListener('DOMContentLoaded', () => {
    document.getElementById('gate').hidden = false; document.getElementById('app').hidden = true;
    hugTranslate(); document.getElementById('gateFull').href = HUG.links.full;
  });
})();
