'use strict';
/* 图形台 GraphLab：数学 / 物理的实时图像，多视窗（像 Adobe 的工作区：主视窗 + 属性面板，视窗可分 1 / 2 / 3 / 4 格，每格可切换视图）
   · 内容：函数 y=f(x) · 参数曲线 · 极坐标 · 向量场 · 曲面（热力图） · 点 · 常微分方程模拟（单摆、抛体、弹簧、轨道…）
   · 视图：坐标图 graph · 随时间 time · 相图 phase · 数值表 table · 热力图 heat；拖动平移、滚轮缩放、双击复位；参数滑块；▶ 播放时间 t
   · 表达式自己解析（不用 eval）：+ - * / ^ 括号、隐式乘法（2x、3(x+1)）、比较 < >、常用函数与常量
   · 模型边写，图边画（实时渲染的 paint 钩子）；内置公式库 LIB（数学 + 物理预设） */
(() => {
  const G = globalThis;

  /* ---------- 1. 表达式：词法 → 语法树 → 闭包（求值很快，画图每帧几千次） ---------- */
  const FN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, lg: Math.log10, log: (a, b) => (b === undefined ? Math.log10(a) : Math.log(b) / Math.log(a)), sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, min: Math.min, max: Math.max, pow: Math.pow, hypot: Math.hypot, mod: (a, b) => ((a % b) + b) % b, step: x => (x >= 0 ? 1 : 0), clamp: (x, a, b) => Math.min(b, Math.max(a, x)), if: (c, a, b) => (c ? a : b), sec: x => 1 / Math.cos(x), csc: x => 1 / Math.sin(x), cot: x => 1 / Math.tan(x), fact: n => { let r = 1; for (let i = 2; i <= Math.min(170, n); i++) r *= i; return r; } };
  const CONST = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };
  function lex(src) {
    const s = String(src).replace(/\*\*/g, '^').replace(/π/g, 'pi').replace(/θ/g, 'th').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-'), out = [];
    for (let i = 0; i < s.length;) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const n = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i)); if (n) { out.push({ t: 'n', v: +n[0] }); i += n[0].length; continue; }
      const id = /^[a-zA-Z_][a-zA-Z_0-9]*/.exec(s.slice(i)); if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
      const op = /^(<=|>=|==|!=|[-+*/^(),<>])/.exec(s.slice(i)); if (op) { out.push({ t: 'op', v: op[0] }); i += op[0].length; continue; }
      throw new Error('bad char ' + c);
    }
    return out;
  }
  function parse(src) {
    const tk = lex(src); let p = 0;
    const peek = () => tk[p], eat = v => { const t = tk[p]; if (!t || (v && t.v !== v)) throw new Error('expected ' + (v || 'token')); p++; return t; };
    const cmp = () => { let a = add(); while (peek()?.t === 'op' && /^(<|>|<=|>=|==|!=)$/.test(peek().v)) { const o = eat().v; a = { k: 'b', o, a, b: add() }; } return a; };
    const add = () => { let a = mul(); while (peek()?.t === 'op' && /^[-+]$/.test(peek().v)) { const o = eat().v; a = { k: 'b', o, a, b: mul() }; } return a; };
    const mul = () => { let a = un(); for (;;) { const t = peek(); if (t?.t === 'op' && /^[*/]$/.test(t.v)) { eat(); a = { k: 'b', o: t.v, a, b: un() }; } else if (t && (t.t === 'n' || t.t === 'id' || t.v === '(')) a = { k: 'b', o: '*', a, b: un() }; else return a; } }; // 隐式乘法 2x、3(x+1)、x y
    const un = () => { const t = peek(); if (t?.t === 'op' && (t.v === '-' || t.v === '+')) { eat(); const a = un(); return t.v === '-' ? { k: 'neg', a } : a; } return pw(); };
    const pw = () => { const a = atom(); if (peek()?.v === '^') { eat(); return { k: 'b', o: '^', a, b: un() }; } return a; };
    const atom = () => {
      const t = eat();
      if (t.t === 'n') return { k: 'n', v: t.v };
      if (t.v === '(') { const a = cmp(); eat(')'); return a; }
      if (t.t === 'id') {
        if (peek()?.v === '(' && Object.hasOwn(FN, t.v)) { eat('('); const args = []; if (peek()?.v !== ')') { args.push(cmp()); while (peek()?.v === ',') { eat(); args.push(cmp()); } } eat(')'); return { k: 'f', f: t.v, args }; }
        return { k: 'v', v: t.v };
      }
      throw new Error('unexpected ' + t.v);
    };
    const ast = cmp(); if (p < tk.length) throw new Error('unexpected ' + tk[p].v); return ast;
  }
  function build(n) {
    switch (n.k) {
      case 'n': { const v = n.v; return () => v; }
      case 'v': { const v = n.v, c = Object.hasOwn(CONST, v) ? CONST[v] : undefined, own = Object.hasOwn; return c !== undefined ? env => (own(env, v) ? env[v] : c) : env => (own(env, v) && typeof env[v] === 'number' ? env[v] : NaN); } // 只认自己的数值变量（__proto__ / constructor 之类取不到）
      case 'neg': { const a = build(n.a); return e => -a(e); }
      case 'f': { const f = Object.hasOwn(FN, n.f) ? FN[n.f] : () => NaN, as = n.args.map(build); return as.length === 1 ? (a0 => e => f(a0(e)))(as[0]) : as.length === 2 ? ((a0, a1) => e => f(a0(e), a1(e)))(as[0], as[1]) : e => f(...as.map(a => a(e))); }
      case 'b': { const a = build(n.a), b = build(n.b);
        switch (n.o) { case '+': return e => a(e) + b(e); case '-': return e => a(e) - b(e); case '*': return e => a(e) * b(e); case '/': return e => a(e) / b(e); case '^': return e => Math.pow(a(e), b(e));
          case '<': return e => +(a(e) < b(e)); case '>': return e => +(a(e) > b(e)); case '<=': return e => +(a(e) <= b(e)); case '>=': return e => +(a(e) >= b(e)); case '==': return e => +(Math.abs(a(e) - b(e)) < 1e-9); default: return e => +(a(e) !== b(e)); } }
    }
    return () => NaN;
  }
  const cache = new Map();
  function compile(src) { // 返回 { f, err, vars }；解析失败 f 恒为 NaN
    const k = String(src ?? ''); if (cache.has(k)) return cache.get(k);
    let r; try { const ast = parse(k), vars = new Set(); (function walk(n) { if (n.k === 'v') vars.add(n.v); if (n.a) walk(n.a); if (n.b) walk(n.b); if (n.args) n.args.forEach(walk); })(ast); r = { f: build(ast), err: '', vars }; }
    catch (e) { r = { f: () => NaN, err: String(e.message || e), vars: new Set() }; }
    if (cache.size > 800) cache.clear(); cache.set(k, r); return r;
  }

  /* ---------- 2. 常微分方程：RK4 ---------- */
  function simulate(item, params) {
    const names = Object.keys(item.vars || {}).slice(0, 8); if (!names.length) return null;
    const env = { ...params, t: 0 }, init = names.map(n => { const v = item.vars[n]; return typeof v === 'number' ? v : compile(v).f(env); });
    const d = names.map(n => compile(item.d?.[n] ?? '0').f), stop = item.stop ? compile(item.stop).f : null;
    const dt = Math.max(1e-4, Math.min(0.5, +item.dt || 0.01)), tmax = Math.max(dt, Math.min(1e4, +item.tmax || 10)), N = Math.min(20000, Math.ceil(tmax / dt));
    const T = new Float64Array(N + 1), S = names.map(() => new Float64Array(N + 1));
    let y = init.slice(), n = 0; T[0] = 0; names.forEach((_, i) => (S[i][0] = y[i]));
    const f = (t, y) => { env.t = t; names.forEach((nm, i) => (env[nm] = y[i])); return d.map(g => g(env)); };
    for (; n < N; n++) {
      const t = n * dt, k1 = f(t, y), k2 = f(t + dt / 2, y.map((v, i) => v + (dt / 2) * k1[i])), k3 = f(t + dt / 2, y.map((v, i) => v + (dt / 2) * k2[i])), k4 = f(t + dt, y.map((v, i) => v + dt * k3[i]));
      y = y.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      if (y.some(v => !Number.isFinite(v))) break;
      T[n + 1] = t + dt; names.forEach((_, i) => (S[i][n + 1] = y[i]));
      if (stop) { env.t = t + dt; names.forEach((nm, i) => (env[nm] = y[i])); if (stop(env)) { n++; break; } }
    }
    return { names, T: T.subarray(0, n + 1), S: S.map(a => a.subarray(0, n + 1)), n: n + 1, dt };
  }
  const stateAt = (sim, t) => { if (!sim) return null; const i = Math.max(0, Math.min(sim.n - 1, Math.round(t / sim.dt))); const o = { t: sim.T[i] }; sim.names.forEach((nm, k) => (o[nm] = sim.S[k][i])); return o; };

  /* ---------- 3. 公式库（数学 + 物理预设） ---------- */
  const P = (v, min, max, step = 0.01) => ({ v, min, max, step });
  const LIB = {
    sine: { name: '正弦族', cat: 'math', params: { a: P(1, 0, 5), b: P(1, 0.1, 5), c: P(0, -3.14, 3.14) }, items: [{ kind: 'fn', y: 'a*sin(b*x+c)' }, { kind: 'fn', y: 'sin(x)' }], views: [{ type: 'graph', x: [-7, 7], y: [-5, 5] }, { type: 'table' }] },
    quadratic: { name: '二次函数', cat: 'math', params: { a: P(1, -3, 3), b: P(0, -5, 5), c: P(-2, -5, 5) }, items: [{ kind: 'fn', y: 'a*x^2+b*x+c' }, { kind: 'point', x: '-b/(2*a)', y: 'c-b^2/(4*a)', label: '顶点' }], views: [{ type: 'graph', x: [-6, 6], y: [-6, 8] }, { type: 'table' }] },
    explog: { name: '指数与对数', cat: 'math', params: { a: P(2, 1.1, 5) }, items: [{ kind: 'fn', y: 'a^x' }, { kind: 'fn', y: 'log(a,x)' }, { kind: 'fn', y: 'x' }], views: [{ type: 'graph', x: [-4, 6], y: [-4, 6] }] },
    taylor: { name: '泰勒展开', cat: 'math', params: {}, items: [{ kind: 'fn', y: 'sin(x)' }, { kind: 'fn', y: 'x' }, { kind: 'fn', y: 'x-x^3/6' }, { kind: 'fn', y: 'x-x^3/6+x^5/120' }, { kind: 'fn', y: 'x-x^3/6+x^5/120-x^7/5040' }], views: [{ type: 'graph', x: [-7, 7], y: [-3, 3] }] },
    fourier: { name: '傅里叶方波', cat: 'math', params: {}, items: [{ kind: 'fn', y: '4/pi*(sin(x)+sin(3x)/3+sin(5x)/5+sin(7x)/7+sin(9x)/9+sin(11x)/11)' }, { kind: 'fn', y: 'sign(sin(x))' }], views: [{ type: 'graph', x: [-7, 7], y: [-2, 2] }] },
    normal: { name: '正态分布', cat: 'math', params: { mu: P(0, -3, 3), s: P(1, 0.2, 3) }, items: [{ kind: 'fn', y: 'exp(-(x-mu)^2/(2*s^2))/(s*sqrt(2*pi))' }], views: [{ type: 'graph', x: [-6, 6], y: [-0.1, 1.2] }, { type: 'table' }] },
    rose: { name: '玫瑰线', cat: 'math', params: { k: P(4, 1, 9, 1) }, items: [{ kind: 'polar', r: 'cos(k*th)', th: [0, 6.2832] }], views: [{ type: 'graph', x: [-1.6, 1.6], y: [-1.2, 1.2] }] },
    cardioid: { name: '心形线', cat: 'math', params: { a: P(1, 0.2, 3) }, items: [{ kind: 'polar', r: 'a*(1-sin(th))', th: [0, 6.2832] }], views: [{ type: 'graph', x: [-3, 3], y: [-4, 1] }] },
    lissajous: { name: '李萨如图形', cat: 'math', params: { a: P(3, 1, 9, 1), b: P(2, 1, 9, 1), d: P(1.57, 0, 3.14) }, items: [{ kind: 'param', x: 'sin(a*t+d)', y: 'sin(b*t)', t: [0, 6.2832] }], views: [{ type: 'graph', x: [-1.6, 1.6], y: [-1.2, 1.2] }] },
    spiral: { name: '阿基米德螺线', cat: 'math', params: { a: P(0.2, 0.05, 1) }, items: [{ kind: 'polar', r: 'a*th', th: [0, 37.7] }], views: [{ type: 'graph', x: [-9, 9], y: [-7, 7] }] },
    surface: { name: '曲面 sin·cos', cat: 'math', params: { k: P(1, 0.2, 3) }, items: [{ kind: 'surface', z: 'sin(k*x)*cos(k*y)' }], views: [{ type: 'heat', x: [-6, 6], y: [-4, 4] }] },
    saddle: { name: '马鞍面', cat: 'math', params: {}, items: [{ kind: 'surface', z: 'x^2-y^2' }], views: [{ type: 'heat', x: [-3, 3], y: [-2, 2] }] },
    projectile: { name: '抛体运动', cat: 'phys', params: { v0: P(20, 1, 50, 0.5), ang: P(45, 0, 90, 1), g: P(9.8, 1, 20, 0.1), k: P(0.02, 0, 0.3, 0.005) }, items: [{ kind: 'ode', vars: { px: 0, py: 0, vx: 'v0*cos(ang*pi/180)', vy: 'v0*sin(ang*pi/180)' }, d: { px: 'vx', py: 'vy', vx: '-k*vx*sqrt(vx^2+vy^2)', vy: '-g-k*vy*sqrt(vx^2+vy^2)' }, stop: 'py<0', tmax: 12, dt: 0.01, draw: { x: 'px', y: 'py' }, plot: ['vx', 'vy'], phase: ['px', 'py'] }], views: [{ type: 'graph', x: [-2, 45], y: [-2, 24] }, { type: 'time' }, { type: 'table' }] },
    pendulum: { name: '单摆', cat: 'phys', params: { L: P(1, 0.2, 3), g: P(9.8, 1, 20, 0.1), c: P(0.1, 0, 2), th0: P(60, 1, 179, 1) }, items: [{ kind: 'ode', vars: { th: 'th0*pi/180', w: 0 }, d: { th: 'w', w: '-g/L*sin(th)-c*w' }, tmax: 20, dt: 0.005, draw: { x: 'L*sin(th)', y: '-L*cos(th)', rod: true }, plot: ['th', 'w'], phase: ['th', 'w'] }], views: [{ type: 'graph', x: [-2, 2], y: [-2.2, 0.6] }, { type: 'time' }, { type: 'phase' }] },
    spring: { name: '弹簧阻尼振子', cat: 'phys', params: { m: P(1, 0.1, 5), k: P(4, 0.1, 20), c: P(0.3, 0, 5), x0: P(1, -2, 2) }, items: [{ kind: 'ode', vars: { x: 'x0', v: 0 }, d: { x: 'v', v: '-(k*x+c*v)/m' }, tmax: 20, dt: 0.005, draw: { x: 'x', y: '0', anchor: [-3, 0] }, plot: ['x', 'v'], phase: ['x', 'v'] }], views: [{ type: 'graph', x: [-3.5, 3], y: [-1.5, 1.5] }, { type: 'time' }, { type: 'phase' }] },
    resonance: { name: '受迫振动 · 共振', cat: 'phys', params: { m: P(1, 0.1, 5), k: P(4, 0.1, 20), c: P(0.2, 0, 3), F: P(1, 0, 5), wd: P(2, 0.1, 6) }, items: [{ kind: 'ode', vars: { x: 0, v: 0 }, d: { x: 'v', v: '(F*cos(wd*t)-k*x-c*v)/m' }, tmax: 40, dt: 0.01, plot: ['x'], phase: ['x', 'v'] }], views: [{ type: 'time' }, { type: 'phase' }] },
    orbit: { name: '行星轨道', cat: 'phys', params: { GM: P(1, 0.2, 3), v0: P(1.1, 0.3, 1.6) }, items: [{ kind: 'point', x: '0', y: '0', label: '★' }, { kind: 'ode', vars: { x: 1, y: 0, vx: 0, vy: 'v0' }, d: { x: 'vx', y: 'vy', vx: '-GM*x/(x^2+y^2)^1.5', vy: '-GM*y/(x^2+y^2)^1.5' }, tmax: 30, dt: 0.002, draw: { x: 'x', y: 'y' }, plot: ['x', 'y'], phase: ['x', 'vx'] }], views: [{ type: 'graph', x: [-3, 3], y: [-2.2, 2.2] }, { type: 'time' }] },
    lorenz: { name: '洛伦兹吸引子', cat: 'phys', params: { s: P(10, 1, 20), r: P(28, 1, 50), b: P(2.667, 0.5, 5) }, items: [{ kind: 'ode', vars: { x: 1, y: 1, z: 1 }, d: { x: 's*(y-x)', y: 'x*(r-z)-y', z: 'x*y-b*z' }, tmax: 40, dt: 0.005, draw: { x: 'x', y: 'z' }, plot: ['x'], phase: ['x', 'y'] }], views: [{ type: 'graph', x: [-25, 25], y: [0, 52] }, { type: 'time' }, { type: 'phase' }] },
    predator: { name: '捕食者-猎物', cat: 'phys', params: { a: P(1.1, 0.1, 3), b: P(0.4, 0.05, 1), c: P(0.4, 0.05, 1), d: P(0.1, 0.01, 0.5) }, items: [{ kind: 'ode', vars: { r: 10, f: 5 }, d: { r: 'a*r-b*r*f', f: 'd*r*f-c*f' }, tmax: 60, dt: 0.01, plot: ['r', 'f'], phase: ['r', 'f'] }], views: [{ type: 'time' }, { type: 'phase' }] },
    rc: { name: 'RC 充放电', cat: 'phys', params: { E: P(5, 1, 12), R: P(1, 0.1, 5), C: P(1, 0.1, 5) }, items: [{ kind: 'fn', y: 'E*(1-exp(-x/(R*C)))' }, { kind: 'fn', y: 'E*exp(-x/(R*C))' }], views: [{ type: 'graph', x: [-0.5, 10], y: [-0.5, 13] }, { type: 'table' }] },
    charges: { name: '两点电荷电场', cat: 'phys', params: { q1: P(1, -3, 3), q2: P(-1, -3, 3) }, items: [{ kind: 'field', u: 'q1*(x+1)/((x+1)^2+y^2)^1.5+q2*(x-1)/((x-1)^2+y^2)^1.5', v: 'q1*y/((x+1)^2+y^2)^1.5+q2*y/((x-1)^2+y^2)^1.5' }, { kind: 'point', x: '-1', y: '0', label: 'q1' }, { kind: 'point', x: '1', y: '0', label: 'q2' }], views: [{ type: 'graph', x: [-3, 3], y: [-2, 2] }] },
    waves: { name: '波的叠加 · 驻波', cat: 'phys', params: { A: P(1, 0, 2), k: P(1, 0.2, 3), w: P(2, 0.2, 6) }, items: [{ kind: 'fn', y: 'A*sin(k*x-w*t)' }, { kind: 'fn', y: 'A*sin(k*x+w*t)' }, { kind: 'fn', y: '2*A*sin(k*x)*cos(w*t)' }], views: [{ type: 'graph', x: [-7, 7], y: [-2.5, 2.5] }], time: { tmax: 12 } },
    freefall: { name: '自由落体与空气阻力', cat: 'phys', params: { g: P(9.8, 1, 20, 0.1), k: P(0.2, 0, 2) }, items: [{ kind: 'ode', vars: { h: 100, v: 0 }, d: { h: '-v', v: 'g-k*v^2' }, stop: 'h<0', tmax: 30, dt: 0.01, plot: ['h', 'v'], phase: ['v', 'h'] }], views: [{ type: 'time' }, { type: 'table' }] },
    ellipse: { name: '椭圆与焦点', cat: 'math', params: { a: P(3, 0.5, 6), b: P(2, 0.5, 6) }, items: [{ kind: 'param', x: 'a*cos(t)', y: 'b*sin(t)', t: [0, 6.2832] }, { kind: 'point', x: 'sqrt(abs(a^2-b^2))', y: '0', label: 'F₂' }, { kind: 'point', x: '-sqrt(abs(a^2-b^2))', y: '0', label: 'F₁' }], views: [{ type: 'graph', x: [-7, 7] }] },
    hyperbola: { name: '双曲线', cat: 'math', params: { a: P(1, 0.3, 4), b: P(1, 0.3, 4) }, items: [{ kind: 'param', x: 'a*cosh(t)', y: 'b*sinh(t)', t: [-2.5, 2.5] }, { kind: 'param', x: '-a*cosh(t)', y: 'b*sinh(t)', t: [-2.5, 2.5] }, { kind: 'fn', y: 'b/a*x' }, { kind: 'fn', y: '-b/a*x' }], views: [{ type: 'graph', x: [-8, 8] }] },
    cycloid: { name: '摆线', cat: 'math', params: { r: P(1, 0.3, 3) }, items: [{ kind: 'param', x: 'r*(t-sin(t))', y: 'r*(1-cos(t))', t: [0, 18.85] }, { kind: 'point', x: 'r*(T-sin(T))', y: 'r*(1-cos(T))' }], views: [{ type: 'graph', x: [-1, 20] }], time: { tmax: 18.85 } },
    tangent: { name: '三角函数 tan', cat: 'math', params: { k: P(1, 0.2, 3) }, items: [{ kind: 'fn', y: 'tan(k*x)' }, { kind: 'fn', y: 'sin(k*x)' }, { kind: 'fn', y: 'cos(k*x)' }], views: [{ type: 'graph', x: [-7, 7], y: [-4, 4] }] },
    piecewise: { name: '分段与绝对值', cat: 'math', params: { a: P(1, -3, 3) }, items: [{ kind: 'fn', y: 'abs(x-a)' }, { kind: 'fn', y: 'if(x<0,-x^2,sqrt(x))' }, { kind: 'fn', y: 'floor(x)' }], views: [{ type: 'graph', x: [-5, 5] }, { type: 'table' }] },
    shm: { name: '简谐运动', cat: 'phys', params: { A: P(1, 0.1, 3), w: P(2, 0.2, 8), p: P(0, -3.14, 3.14) }, items: [{ kind: 'fn', y: 'A*sin(w*x+p)' }, { kind: 'fn', y: 'A*w*cos(w*x+p)' }, { kind: 'point', x: 'T', y: 'A*sin(w*T+p)' }], views: [{ type: 'graph', x: [0, 10], y: [-8, 8] }, { type: 'table' }], time: { tmax: 10 } },
    beats: { name: '拍频', cat: 'phys', params: { f1: P(5, 1, 12), f2: P(5.6, 1, 12) }, items: [{ kind: 'fn', y: 'sin(2*pi*f1*x)+sin(2*pi*f2*x)' }, { kind: 'fn', y: '2*abs(cos(pi*(f1-f2)*x))' }], views: [{ type: 'graph', x: [0, 4], y: [-2.5, 2.5] }] },
    damped: { name: '阻尼振荡曲线', cat: 'phys', params: { A: P(1, 0.1, 3), g: P(0.3, 0, 2), w: P(4, 0.5, 12) }, items: [{ kind: 'fn', y: 'A*exp(-g*x)*cos(w*x)' }, { kind: 'fn', y: 'A*exp(-g*x)' }, { kind: 'fn', y: '-A*exp(-g*x)' }], views: [{ type: 'graph', x: [0, 12], y: [-1.5, 1.5] }] },
    sho_field: { name: '谐振子相流', cat: 'phys', params: { w: P(1, 0.2, 3), c: P(0.2, 0, 2) }, items: [{ kind: 'field', u: 'y', v: '-w^2*x-c*y' }, { kind: 'ode', vars: { x: 2, y: 0 }, d: { x: 'y', y: '-w^2*x-c*y' }, tmax: 30, dt: 0.01, draw: { x: 'x', y: 'y' } }], views: [{ type: 'graph', x: [-3, 3], y: [-3, 3] }] },
  };

  /* ---------- 4. 读模型给的数据（宽容、有界） ---------- */
  const KINDS = ['fn', 'param', 'polar', 'field', 'surface', 'point', 'ode'], VIEWS = ['graph', 'time', 'phase', 'table', 'heat'];
  const COLORS = ['#8B7CFF', '#1FD1B6', '#FFB547', '#FF6B8A', '#5AB8FF', '#C6F36B', '#F78CFF', '#FFFFFF'];
  const s80 = v => String(v ?? '').slice(0, 400);
  const rng = (r, d) => (Array.isArray(r) && r.length === 2 && r.every(Number.isFinite) && r[1] > r[0] ? [+r[0], +r[1]] : d);
  function readDoc(d0) {
    const d = d0 && typeof d0 === 'object' ? d0 : {}, pre = LIB[d.preset] || null, base = pre ? JSON.parse(JSON.stringify(pre)) : {};
    const params = {}; Object.entries({ ...(base.params || {}), ...(d.params && typeof d.params === 'object' ? d.params : {}) }).slice(0, 12).forEach(([k, p]) => { if (!/^[a-zA-Z_]\w{0,11}$/.test(k) || CONST[k] !== undefined && k !== 'e') return; const o = typeof p === 'number' ? { v: p } : p || {}; const v = Number.isFinite(+o.v) ? +o.v : Number.isFinite(+o.value) ? +o.value : 1, min = Number.isFinite(+o.min) ? +o.min : Math.min(v, 0) - Math.abs(v || 1) * 2, max = Number.isFinite(+o.max) ? +o.max : Math.max(v, 0) + Math.abs(v || 1) * 2; params[k] = { v, min: Math.min(min, v), max: Math.max(max, v), step: Number.isFinite(+o.step) && +o.step > 0 ? +o.step : (max - min) / 200 || 0.01 }; });
    const raw = Array.isArray(d.items) && d.items.length ? d.items : base.items || [];
    const items = raw.slice(0, 12).map((it, i) => {
      const o = it && typeof it === 'object' ? it : { kind: 'fn', y: String(it) }, kind = KINDS.includes(o.kind) ? o.kind : o.z ? 'surface' : o.r ? 'polar' : o.u ? 'field' : o.vars ? 'ode' : o.x && o.y && !o.label ? 'param' : 'fn';
      const r = { id: 'i' + i, kind, color: /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : COLORS[i % COLORS.length], hide: !!o.hide, label: s80(o.label).slice(0, 20) };
      if (kind === 'fn') r.y = s80(o.y ?? o.expr ?? o.f);
      if (kind === 'param') { r.x = s80(o.x); r.y = s80(o.y); r.t = rng(o.t, [0, 6.2832]); }
      if (kind === 'polar') { r.r = s80(o.r); r.th = rng(o.th, [0, 6.2832]); }
      if (kind === 'field') { r.u = s80(o.u); r.v = s80(o.v); }
      if (kind === 'surface') r.z = s80(o.z);
      if (kind === 'point') { r.x = s80(o.x); r.y = s80(o.y); }
      if (kind === 'ode') { const vars = {}; Object.entries(o.vars || {}).slice(0, 8).forEach(([k, v]) => { if (/^[a-zA-Z_]\w{0,11}$/.test(k)) vars[k] = typeof v === 'number' ? v : s80(v); }); r.vars = vars; r.d = {}; Object.keys(vars).forEach(k => (r.d[k] = s80(o.d?.[k] ?? '0'))); r.dt = +o.dt || 0.01; r.tmax = +o.tmax || 10; r.stop = o.stop ? s80(o.stop) : ''; r.draw = o.draw && typeof o.draw === 'object' ? { x: s80(o.draw.x), y: s80(o.draw.y), rod: !!o.draw.rod, anchor: Array.isArray(o.draw.anchor) ? o.draw.anchor.slice(0, 2).map(Number) : null } : null; const ks = Object.keys(vars); r.plot = (Array.isArray(o.plot) ? o.plot : ks.slice(0, 3)).filter(k => vars[k] !== undefined).slice(0, 4); r.phase = (Array.isArray(o.phase) ? o.phase : ks.slice(0, 2)).filter(k => vars[k] !== undefined).slice(0, 2); }
      return r;
    });
    const hasOde = items.some(i => i.kind === 'ode'), hasSurf = items.some(i => i.kind === 'surface');
    const defViews = base.views || (hasSurf ? [{ type: 'heat' }, { type: 'graph' }] : hasOde ? [{ type: 'graph' }, { type: 'time' }, { type: 'phase' }] : [{ type: 'graph' }, { type: 'table' }]);
    const views = (Array.isArray(d.views) && d.views.length ? d.views : defViews).slice(0, 4).map(v => ({ type: VIEWS.includes(v?.type) ? v.type : 'graph', x: rng(v?.x, null), y: rng(v?.y, null) }));
    const tmax = Math.max(1, Math.min(600, +(d.time?.tmax ?? base.time?.tmax) || Math.max(10, ...items.filter(i => i.kind === 'ode').map(i => i.tmax))));
    return { title: s80(d.title || pre?.name || '').slice(0, 60), preset: pre ? d.preset : '', params, items, views, layout: ['1', '2', '3', '4'].includes(String(d.layout)) ? String(d.layout) : String(Math.min(4, views.length)), tmax };
  }

  /* ---------- 5. 画图 ---------- */
  const nice = span => { const r = Math.pow(10, Math.floor(Math.log10(span / 6))), m = span / 6 / r; return r * (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10); };
  const fmt = v => { const a = Math.abs(v); return a === 0 ? '0' : a >= 1e4 || a < 1e-3 ? v.toExponential(1) : +v.toFixed(a < 1 ? 3 : 2) + ''; };
  function autoRange(doc, sims, type, vi) { // 没给范围：按内容估一个
    if (type === 'time') { let lo = Infinity, hi = -Infinity; sims.forEach(({ it, sim }) => sim && it.plot.forEach(k => { const a = sim.S[sim.names.indexOf(k)]; for (let i = 0; i < a.length; i += 4) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; } })); if (!Number.isFinite(lo)) { lo = -1; hi = 1; } const pad = (hi - lo || 1) * 0.1; return { x: [0, Math.max(...sims.map(s => (s.sim ? s.sim.T[s.sim.n - 1] : doc.tmax)), 1)], y: [lo - pad, hi + pad] }; }
    if (type === 'phase') { const s = sims.find(x => x.sim && x.it.phase.length === 2); if (!s) return { x: [-1, 1], y: [-1, 1] }; const [a, b] = s.it.phase.map(k => s.sim.S[s.sim.names.indexOf(k)]); const ext = arr => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < arr.length; i += 3) { lo = Math.min(lo, arr[i]); hi = Math.max(hi, arr[i]); } const p = (hi - lo || 1) * 0.12; return [lo - p, hi + p]; }; return { x: ext(a), y: ext(b) }; }
    return { x: [-10, 10], y: [-6, 6] };
  }
  function grid(g, W, H, R, label, noBg) {
    const X = x => ((x - R.x[0]) / (R.x[1] - R.x[0])) * W, Y = y => H - ((y - R.y[0]) / (R.y[1] - R.y[0])) * H;
    if (!noBg) { g.fillStyle = '#0c0d12'; g.fillRect(0, 0, W, H); }
    const sx = nice(R.x[1] - R.x[0]), sy = nice(R.y[1] - R.y[0]), dpr = g._dpr;
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.055)'; g.beginPath();
    for (let x = Math.ceil(R.x[0] / sx) * sx; x <= R.x[1]; x += sx) { g.moveTo(Math.round(X(x)) + 0.5, 0); g.lineTo(Math.round(X(x)) + 0.5, H); }
    for (let y = Math.ceil(R.y[0] / sy) * sy; y <= R.y[1]; y += sy) { g.moveTo(0, Math.round(Y(y)) + 0.5); g.lineTo(W, Math.round(Y(y)) + 0.5); }
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.beginPath(); const ax = Math.max(0, Math.min(W, X(0))), ay = Math.max(0, Math.min(H, Y(0))); g.moveTo(ax, 0); g.lineTo(ax, H); g.moveTo(0, ay); g.lineTo(W, ay); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.42)'; g.font = `${10 * dpr}px ui-monospace,Menlo,monospace`; g.textAlign = 'center'; g.textBaseline = 'top';
    for (let x = Math.ceil(R.x[0] / sx) * sx; x <= R.x[1]; x += sx) if (Math.abs(x) > sx / 2) g.fillText(fmt(x), X(x), Math.min(H - 12 * dpr, ay + 3 * dpr));
    g.textAlign = 'left'; g.textBaseline = 'middle';
    for (let y = Math.ceil(R.y[0] / sy) * sy; y <= R.y[1]; y += sy) if (Math.abs(y) > sy / 2) g.fillText(fmt(y), Math.min(W - 30 * dpr, ax + 4 * dpr), Y(y));
    if (label) { g.textAlign = 'right'; g.textBaseline = 'top'; g.fillStyle = 'rgba(255,255,255,.35)'; g.fillText(label, W - 6 * dpr, 6 * dpr); }
    return { X, Y };
  }
  function line(g, pts, color, w) { g.strokeStyle = color; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath(); let pen = false; for (const p of pts) { if (!p) { pen = false; continue; } if (!pen) { g.moveTo(p[0], p[1]); pen = true; } else g.lineTo(p[0], p[1]); } g.stroke(); }
  function dot(g, x, y, r, color, glow) { g.save(); if (glow) { g.shadowColor = color; g.shadowBlur = r * 3; } g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore(); }
  function drawGraph(g, W, H, R, doc, env, sims, t) {
    const { X, Y } = grid(g, W, H, R), dpr = g._dpr, lw = 2 * dpr;
    for (const it of doc.items) {
      if (it.hide) continue;
      if (it.kind === 'field') { const fu = compile(it.u).f, fv = compile(it.v).f, nx = 22, ny = Math.max(8, Math.round((22 * H) / W)), cells = []; let mx = 0;
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const x = R.x[0] + ((i + 0.5) / nx) * (R.x[1] - R.x[0]), y = R.y[0] + ((j + 0.5) / ny) * (R.y[1] - R.y[0]); env.x = x; env.y = y; const u = fu(env), v = fv(env), m = Math.hypot(u, v); if (Number.isFinite(m)) { cells.push([x, y, u, v, m]); mx = Math.max(mx, Math.min(m, 1e6)); } }
        const len = (W / nx) * 0.42; g.lineWidth = 1.3 * dpr;
        for (const [x, y, u, v, m] of cells) { const k = Math.log1p(m) / Math.log1p(mx || 1), a = Math.atan2(v, u), px = X(x), py = Y(y), ex = px + Math.cos(a) * len, ey = py - Math.sin(a) * len; g.strokeStyle = g.fillStyle = `hsla(${200 - 170 * k},90%,${55 + 15 * k}%,${0.35 + 0.65 * k})`; g.beginPath(); g.moveTo(px - Math.cos(a) * len * 0.5, py + Math.sin(a) * len * 0.5); g.lineTo(ex, ey); g.stroke(); g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - Math.cos(a - 0.45) * 5 * dpr, ey + Math.sin(a - 0.45) * 5 * dpr); g.lineTo(ex - Math.cos(a + 0.45) * 5 * dpr, ey + Math.sin(a + 0.45) * 5 * dpr); g.fill(); }
      }
      if (it.kind === 'fn') { const f = compile(it.y).f, pts = []; let prev = null; const N = Math.min(2400, W);
        for (let i = 0; i <= N; i++) { const x = R.x[0] + (i / N) * (R.x[1] - R.x[0]); env.x = x; const y = f(env); if (!Number.isFinite(y)) { pts.push(null); prev = null; continue; } const py = Y(y); if (prev !== null && Math.abs(py - prev) > H * 1.5) pts.push(null); pts.push([X(x), Math.max(-H, Math.min(2 * H, py))]); prev = py; }
        line(g, pts, it.color, lw); }
      if (it.kind === 'param' || it.kind === 'polar') { const [a, b] = it.kind === 'param' ? it.t : it.th, fx = it.kind === 'param' ? compile(it.x).f : null, fy = it.kind === 'param' ? compile(it.y).f : null, fr = it.kind === 'polar' ? compile(it.r).f : null, pts = []; const N = 1600, T0 = env.t;
        for (let i = 0; i <= N; i++) { const s = a + (i / N) * (b - a); let x, y; if (fr) { env.th = s; env.theta = s; const r = fr(env); x = r * Math.cos(s); y = r * Math.sin(s); } else { env.T = T0; env.t = s; x = fx(env); y = fy(env); } pts.push(Number.isFinite(x) && Number.isFinite(y) ? [X(x), Y(y)] : null); }
        env.t = T0; line(g, pts, it.color, lw); }
      if (it.kind === 'point') { const x = compile(it.x).f(env), y = compile(it.y).f(env); if (Number.isFinite(x) && Number.isFinite(y)) { dot(g, X(x), Y(y), 5 * dpr, it.color, true); if (it.label) { g.fillStyle = '#fff'; g.font = `${11 * dpr}px system-ui,sans-serif`; g.textAlign = 'left'; g.fillText(it.label, X(x) + 8 * dpr, Y(y) - 8 * dpr); } } }
    }
    for (const { it, sim } of sims) { // 模拟：轨迹 + 当前位置（单摆画摆杆、弹簧画锚点）
      if (!sim || it.hide || !it.draw) continue;
      const fx = compile(it.draw.x).f, fy = compile(it.draw.y).f, e2 = { ...env }, pts = [], cur = Math.min(sim.n - 1, Math.round(t / sim.dt)), step = Math.max(1, Math.floor(sim.n / 1500));
      for (let i = 0; i <= cur; i += step) { e2.t = sim.T[i]; sim.names.forEach((nm, k) => (e2[nm] = sim.S[k][i])); const x = fx(e2), y = fy(e2); pts.push(Number.isFinite(x) && Number.isFinite(y) ? [X(x), Y(y)] : null); }
      g.globalAlpha = 0.85; line(g, pts, it.color, 1.6 * dpr); g.globalAlpha = 1;
      e2.t = sim.T[cur]; sim.names.forEach((nm, k) => (e2[nm] = sim.S[k][cur])); const x = fx(e2), y = fy(e2);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        const an = it.draw.anchor || (it.draw.rod ? [0, 0] : null);
        if (an) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2 * dpr; g.beginPath(); if (it.draw.rod) { g.moveTo(X(an[0]), Y(an[1])); g.lineTo(X(x), Y(y)); } else { const n = 12, x0 = X(an[0]), x1 = X(x), yy = Y(y); g.moveTo(x0, yy); for (let i = 1; i <= n; i++) g.lineTo(x0 + ((x1 - x0) * i) / n, yy + (i === n ? 0 : (i % 2 ? -1 : 1) * 7 * dpr)); } g.stroke(); dot(g, X(an[0]), Y(an[1]), 3 * dpr, '#fff'); }
        dot(g, X(x), Y(y), (it.draw.rod || an ? 9 : 6) * dpr, it.color, true);
      }
    }
    return { X, Y };
  }
  function drawTime(g, W, H, R, sims, t) {
    const { X, Y } = grid(g, W, H, R, 't'), dpr = g._dpr; let ci = 0;
    for (const { it, sim } of sims) { if (!sim || it.hide) continue; for (const k of it.plot) { const a = sim.S[sim.names.indexOf(k)], pts = [], step = Math.max(1, Math.floor(sim.n / 2000)); for (let i = 0; i < sim.n; i += step) pts.push([X(sim.T[i]), Y(a[i])]); const col = COLORS[(ci++) % COLORS.length]; line(g, pts, col, 1.8 * dpr); const i = Math.min(sim.n - 1, Math.round(t / sim.dt)); dot(g, X(sim.T[i]), Y(a[i]), 4 * dpr, col, true); g.font = `${11 * dpr}px ui-monospace,monospace`; g.textAlign = 'left'; g.textBaseline = 'middle'; const ly = (14 + 16 * (ci - 1)) * dpr; g.fillStyle = 'rgba(12,13,18,.85)'; g.fillRect(4 * dpr, ly - 7 * dpr, g.measureText(k).width + 22 * dpr, 14 * dpr); g.fillStyle = col; g.fillRect(8 * dpr, ly - 1, 8 * dpr, 2 * dpr); g.fillText(k, 20 * dpr, ly); } }
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([4 * dpr, 4 * dpr]); g.beginPath(); g.moveTo(X(t), 0); g.lineTo(X(t), H); g.stroke(); g.setLineDash([]);
    return { X, Y };
  }
  function drawPhase(g, W, H, R, sims, t) {
    const s = sims.find(x => x.sim && x.it.phase.length === 2 && !x.it.hide), [a, b] = s ? s.it.phase : ['', ''], { X, Y } = grid(g, W, H, R, s ? `${a} → ${b}` : ''), dpr = g._dpr;
    if (!s) return { X, Y };
    const A = s.sim.S[s.sim.names.indexOf(a)], B = s.sim.S[s.sim.names.indexOf(b)], cur = Math.min(s.sim.n - 1, Math.round(t / s.sim.dt)), pts = [], step = Math.max(1, Math.floor(s.sim.n / 2500));
    for (let i = 0; i < s.sim.n; i += step) pts.push([X(A[i]), Y(B[i])]);
    g.globalAlpha = 0.35; line(g, pts, s.it.color, 1.4 * dpr); g.globalAlpha = 1; const done = []; for (let i = 0; i <= cur; i += step) done.push([X(A[i]), Y(B[i])]); line(g, done, s.it.color, 2 * dpr); dot(g, X(A[cur]), Y(B[cur]), 5 * dpr, s.it.color, true);
    return { X, Y };
  }
  function drawHeat(g, W, H, R, doc, env) {
    const it = doc.items.find(i => i.kind === 'surface' && !i.hide); if (!it) return grid(g, W, H, R, '');
    const f = compile(it.z).f, sc = 2 * g._dpr, w = Math.ceil(W / sc), h = Math.ceil(H / sc), Z = new Float32Array(w * h); let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { env.x = R.x[0] + ((i + 0.5) / w) * (R.x[1] - R.x[0]); env.y = R.y[1] - ((j + 0.5) / h) * (R.y[1] - R.y[0]); const z = f(env); Z[j * w + i] = z; if (Number.isFinite(z)) { lo = Math.min(lo, z); hi = Math.max(hi, z); } }
    const img = g.createImageData(w, h), span = hi - lo || 1;
    const lvl = k => Math.floor(((Z[k] - lo) / span) * 10);
    for (let k = 0; k < w * h; k++) { const q = (Z[k] - lo) / span, i = k % w, iso = (i < w - 1 && lvl(k) !== lvl(k + 1)) || (k + w < w * h && lvl(k) !== lvl(k + w)); const [r, gg, b] = Number.isFinite(q) ? cmap(q) : [0, 0, 0]; const m = iso ? 0.45 : 0; img.data[k * 4] = r + (255 - r) * m; img.data[k * 4 + 1] = gg + (255 - gg) * m; img.data[k * 4 + 2] = b + (255 - b) * m; img.data[k * 4 + 3] = 255; } // 等高线：相邻像素跨过一个等值
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(c, 0, 0, W, H);
    return grid(g, W, H, R, `z ∈ [${fmt(lo)}, ${fmt(hi)}]`, true);
  }
  const cmap = q => { q = Math.max(0, Math.min(1, q)); const stops = [[20, 16, 60], [85, 60, 200], [30, 190, 200], [250, 200, 70], [255, 245, 220]], p = q * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i; return stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f)); };

  G.MxGraph = { lex, parse, compile, simulate, stateAt, readDoc, LIB, cmap, nice };

  const M = G.MXUI; if (!M?.register || !G.document) return;
  const { E, T } = M;
  const VNAME = { graph: '坐标', time: '时间', phase: '相图', table: '数值', heat: '热力' }, KNAME = { fn: 'y =', param: '参数', polar: 'r =', field: '场', surface: 'z =', point: '点', ode: "y' =" };
  const exprOf = it => (it.kind === 'fn' ? it.y : it.kind === 'polar' ? it.r : it.kind === 'surface' ? it.z : it.kind === 'field' ? `(${it.u}, ${it.v})` : it.kind === 'param' || it.kind === 'point' ? `(${it.x}, ${it.y})` : Object.entries(it.d || {}).map(([k, v]) => `${k}'=${v}`).join('; '));
  const merged = st => { const o = st.observed || {}; return { ...st.doc, params: { ...st.doc.params, ...Object.fromEntries(Object.entries(o.pv || {}).filter(([k]) => st.doc.params[k]).map(([k, v]) => [k, { ...st.doc.params[k], v }])) }, items: o.items || st.doc.items, views: o.views || st.doc.views, layout: o.layout || st.doc.layout }; };
  const envOf = (doc, t) => { const e = { t, T: t }; Object.entries(doc.params).forEach(([k, p]) => (e[k] = p.v)); return e; };

  function paintAll(el, doc, rt, t) {
    const env = envOf(doc, t), pv = JSON.stringify([doc.params, doc.items]);
    if (!rt.sims || rt.simKey !== pv) { rt.simKey = pv; rt.sims = doc.items.filter(i => i.kind === 'ode').map(it => { let sim = null; try { sim = simulate(it, env); } catch {} return { it, sim }; }); }
    el.querySelectorAll('.gl-vp').forEach((vp, vi) => {
      const v = doc.views[vi]; if (!v) return;
      if (v.type === 'table') return tableInto(vp.querySelector('.gl-tb'), doc, rt.sims, env, rt.ranges?.[0] || doc.views[0]);
      const cv = vp.querySelector('canvas'); if (!cv) return;
      const dpr = Math.min(2, G.devicePixelRatio || 1), W = Math.max(10, cv.clientWidth * dpr), H = Math.max(10, cv.clientHeight * dpr); if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const g = cv.getContext('2d'); g._dpr = dpr;
      rt.ranges ||= []; let R = rt.ranges[vi];
      if (!R) { const a = autoRange(doc, rt.sims, v.type, vi); R = rt.ranges[vi] = { x: (v.x || a.x).slice(), y: (v.y || a.y).slice() };
        if ((v.type === 'graph' || v.type === 'heat') && !v.y) { const half = ((R.x[1] - R.x[0]) * H) / W / 2; R.y = [-half, half]; } } // 没给 y 范围：按画布比例取，圆不会变成椭圆
      const m = v.type === 'time' ? drawTime(g, W, H, R, rt.sims, t) : v.type === 'phase' ? drawPhase(g, W, H, R, rt.sims, t) : v.type === 'heat' ? drawHeat(g, W, H, R, doc, env) : drawGraph(g, W, H, R, doc, env, rt.sims, t);
      vp._map = { R, W, H, dpr };
    });
  }
  function tableInto(box, doc, sims, env, view) {
    if (!box) return; const s = sims.find(x => x.sim);
    if (s) { const n = 11, rows = []; const tm = s.sim.T[s.sim.n - 1]; for (let i = 0; i < n; i++) { const st = stateAt(s.sim, (tm * i) / (n - 1)); rows.push(`<tr><td>${fmt(st.t)}</td>${s.sim.names.map(k => `<td>${fmt(st[k])}</td>`).join('')}</tr>`); } box.innerHTML = `<table><tr><th>t</th>${s.sim.names.map(k => `<th>${E(k)}</th>`).join('')}</tr>${rows.join('')}</table>`; return; }
    const fns = doc.items.filter(i => i.kind === 'fn' && !i.hide).slice(0, 5), R = view?.x || [-5, 5], n = 11;
    if (!fns.length) { box.innerHTML = ''; return; }
    const xs = [...Array(n)].map((_, i) => R[0] + ((R[1] - R[0]) * i) / (n - 1));
    box.innerHTML = `<table><tr><th>x</th>${fns.map(f => `<th style="color:${f.color}">${E(f.y.slice(0, 18))}</th>`).join('')}</tr>${xs.map(x => { env.x = x; return `<tr><td>${fmt(x)}</td>${fns.map(f => `<td>${fmt(compile(f.y).f(env))}</td>`).join('')}</tr>`; }).join('')}</table>`;
  }

  M.register('GraphLab', {
    label: '图形台', icon: '∿', wide: true, addable: true,
    kw: /函数|图像|画.{0,3}(图|曲线)|曲线|坐标|方程|导数|积分|极坐标|参数方程|向量场|电场|磁场|单摆|抛体|弹簧|振动|轨道|波|物理|模拟|plot|graph|function|curve|equation|physics|simulat|pendulum|projectile|oscillat|orbit|field|wave/i,
    read: d => readDoc(d),
    proj: s => { const d = merged(s); return { preset: d.preset, items: d.items.map(i => ({ kind: i.kind, expr: exprOf(i) })), params: Object.fromEntries(Object.entries(d.params).map(([k, p]) => [k, p.v])), views: d.views.map(v => v.type) }; },
    tool: {
      init: d => ({ doc: d }),
      title: st => st.doc.title,
      paint(el, st) { paintAll(el, st.doc, {}, 0); }, // 模型还在写：边写边画
      view(st, ro, ctx) {
        const d = merged(st), rt = ctx.runtime || {}, L = d.layout;
        const vps = d.views.slice(0, +L).map((v, i) => `<div class="gl-vp" data-v="${i}"><div class="gl-vh"><select data-vt="${i}">${['graph', 'time', 'phase', 'table', 'heat'].map(k => `<option value="${k}"${k === v.type ? ' selected' : ''}>${E(T(VNAME[k]))}</option>`).join('')}</select><span class="gl-rd" data-rd="${i}"></span><button type="button" class="gl-x" data-x="max:${i}" title="${E(T('放大'))}">⤢</button></div>${v.type === 'table' ? '<div class="gl-tb"></div>' : '<canvas></canvas>'}</div>`).join('');
        const items = d.items.map((it, i) => `<div class="gl-it${it.hide ? ' off' : ''}"><button type="button" class="gl-dot" data-x="vis:${i}" style="--c:${it.color}" title="${E(T('显示 / 隐藏'))}"></button><span class="gl-k">${E(KNAME[it.kind])}</span>${it.kind === 'ode' || it.kind === 'field' || it.kind === 'param' || it.kind === 'point' ? `<code class="gl-ro" title="${E(exprOf(it))}">${E(exprOf(it))}</code>` : `<input class="gl-ex${compile(exprOf(it)).err ? ' bad' : ''}" data-ex="${i}" value="${E(exprOf(it))}" spellcheck="false">`}</div>`).join('');
        const params = Object.entries(d.params).map(([k, p]) => `<label class="gl-p"><span>${E(k)}</span><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.v}" data-p="${E(k)}"><b data-pv="${E(k)}">${fmt(p.v)}</b></label>`).join('');
        const lib = `<select class="gl-lib" data-lib title="${E(T('公式库'))}"><option value="">${E(T('公式库'))}</option><optgroup label="${E(T('数学'))}">${Object.entries(LIB).filter(([, x]) => x.cat === 'math').map(([k, x]) => `<option value="${k}">${E(T(x.name))}</option>`).join('')}</optgroup><optgroup label="${E(T('物理'))}">${Object.entries(LIB).filter(([, x]) => x.cat === 'phys').map(([k, x]) => `<option value="${k}">${E(T(x.name))}</option>`).join('')}</optgroup></select>`;
        return `<div class="gl"><div class="gl-bar"><button type="button" class="gl-play" data-x="play" title="${E(T('播放'))}">${rt.playing ? '❚❚' : '▶'}</button><input type="range" class="gl-t" min="0" max="${d.tmax}" step="0.01" value="${rt.t || 0}" data-t><span class="gl-tv mono">t=${fmt(rt.t || 0)}</span><span class="sp"></span>${['1', '2', '3', '4'].map(n => `<button type="button" class="gl-lay${L === n ? ' on' : ''}" data-x="lay:${n}" title="${n}">${{ 1: '▢', 2: '◫', 3: '⊟', 4: '⊞' }[n]}</button>`).join('')}${btn2('fit', '⌖', T('复位'))}${btn2('png', '⤓', T('导出 PNG'))}</div>
          <div class="gl-main"><div class="gl-vps l${L}">${vps}</div><aside class="gl-side">${lib}<div class="gl-sec">${items}${ro ? '' : `<input class="gl-ex gl-new" data-new placeholder="+ y = …" spellcheck="false">`}</div>${params ? `<div class="gl-sec">${params}</div>` : ''}</aside></div></div>`;
      },
      bind(el, st, ro, ctx) {
        const rt = ctx.runtime, doc = () => merged(ctx.st); rt.t ||= 0;
        const repaint = () => { paintAll(el, doc(), rt, rt.t); const tv = el.querySelector('.gl-tv'); if (tv) tv.textContent = 't=' + fmt(rt.t); const ts = el.querySelector('[data-t]'); if (ts && document.activeElement !== ts) ts.value = rt.t; };
        const ro2 = new ResizeObserver(() => repaint()); el.querySelectorAll('.gl-vp').forEach(v => ro2.observe(v)); rt.ro?.disconnect(); rt.ro = ro2;
        requestAnimationFrame(repaint);
        const save = patch => ctx.obs(patch, false);
        el.querySelectorAll('[data-p]').forEach(r => (r.oninput = () => { const pv = { ...(ctx.st.observed.pv || {}), [r.dataset.p]: +r.value }; ctx.st.observed.pv = pv; el.querySelector(`[data-pv="${r.dataset.p}"]`).textContent = fmt(+r.value); repaint(); }, r.onchange = () => save({ pv: ctx.st.observed.pv })));
        const setItems = items => { save({ items }); ctx.st.observed.items = items; rt.simKey = ''; };
        el.querySelectorAll('[data-ex]').forEach(inp => (inp.oninput = () => { const i = +inp.dataset.ex, it = { ...doc().items[i] }, v = inp.value.slice(0, 400), bad = !!compile(v).err; inp.classList.toggle('bad', bad); if (bad) return; if (it.kind === 'fn') it.y = v; else if (it.kind === 'polar') it.r = v; else if (it.kind === 'surface') it.z = v; const items = doc().items.slice(); items[i] = it; setItems(items); repaint(); }));
        const nw = el.querySelector('[data-new]'); if (nw) nw.onkeydown = e => { if (e.key !== 'Enter' || !nw.value.trim() || compile(nw.value).err) return; const items = [...doc().items, { id: 'u' + Date.now().toString(36), kind: 'fn', y: nw.value.trim().replace(/^y\s*=\s*/, '').slice(0, 400), color: COLORS[doc().items.length % COLORS.length] }]; ctx.obs({ items }); };
        const lib = el.querySelector('[data-lib]'); if (lib) lib.onchange = () => { const p = lib.value; if (!p) return; const nd = readDoc({ preset: p }); rt.ranges = []; rt.t = 0; rt.simKey = ''; ctx.set({ doc: nd }); ctx.obs({ items: null, pv: null, views: null, layout: null }); };
        el.querySelectorAll('[data-vt]').forEach(s => (s.onchange = () => { const views = doc().views.slice(); views[+s.dataset.vt] = { type: s.value, x: null, y: null }; rt.ranges = []; ctx.obs({ views }); }));
        const ts = el.querySelector('[data-t]'); if (ts) ts.oninput = () => { rt.t = +ts.value; repaint(); };
        // 平移 / 缩放 / 读数
        el.querySelectorAll('.gl-vp').forEach(vp => {
          const cv = vp.querySelector('canvas'); if (!cv) return; const vi = +vp.dataset.v, rd = vp.querySelector('[data-rd]');
          const toW = (cx, cy) => { const m = vp._map; if (!m) return null; const r = cv.getBoundingClientRect(); return [m.R.x[0] + ((cx - r.left) / r.width) * (m.R.x[1] - m.R.x[0]), m.R.y[1] - ((cy - r.top) / r.height) * (m.R.y[1] - m.R.y[0])]; };
          cv.onwheel = e => { e.preventDefault(); const m = vp._map, p = toW(e.clientX, e.clientY); if (!m || !p) return; const k = Math.exp(e.deltaY * 0.0015); m.R.x = m.R.x.map(v => p[0] + (v - p[0]) * k); m.R.y = m.R.y.map(v => p[1] + (v - p[1]) * k); repaint(); };
          let drag = null; cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, R: { x: vp._map.R.x.slice(), y: vp._map.R.y.slice() } }; };
          cv.onpointermove = e => { const p = toW(e.clientX, e.clientY); if (rd && p) rd.textContent = `${fmt(p[0])}, ${fmt(p[1])}`; if (!drag) return; const m = vp._map, r = cv.getBoundingClientRect(), dx = ((e.clientX - drag.x) / r.width) * (drag.R.x[1] - drag.R.x[0]), dy = ((e.clientY - drag.y) / r.height) * (drag.R.y[1] - drag.R.y[0]); m.R.x = drag.R.x.map(v => v - dx); m.R.y = drag.R.y.map(v => v + dy); repaint(); };
          cv.onpointerup = cv.onpointercancel = () => (drag = null); cv.onpointerleave = () => rd && (rd.textContent = '');
          cv.ondblclick = () => { rt.ranges[vi] = null; repaint(); };
        });
        const stop = () => { rt.playing = false; cancelAnimationFrame(rt.raf); const b = el.querySelector('.gl-play'); if (b) b.textContent = '▶'; };
        el.onclick = e => {
          const b = e.target.closest('[data-x]'); if (!b || !el.contains(b)) return; const [a, n] = b.dataset.x.split(':');
          if (a === 'play') { if (rt.playing) return stop(); rt.playing = true; b.textContent = '❚❚'; let last = performance.now(); const tmax = doc().tmax; const loop = now => { if (!rt.playing || !el.isConnected) return; rt.t += (now - last) / 1000; last = now; if (rt.t > tmax) rt.t = 0; repaint(); rt.raf = requestAnimationFrame(loop); }; rt.raf = requestAnimationFrame(loop); }
          if (a === 'lay') { rt.ranges = []; ctx.obs({ layout: n, views: (() => { const v = doc().views.slice(); while (v.length < +n) v.push({ type: ['graph', 'time', 'phase', 'table'][v.length] || 'graph', x: null, y: null }); return v; })() }); }
          if (a === 'max') { const views = doc().views.slice(), [x] = views.splice(+n, 1); views.unshift(x); rt.ranges = []; ctx.obs({ views, layout: '1' }); }
          if (a === 'vis') { const items = doc().items.map((it, i) => (i === +n ? { ...it, hide: !it.hide } : it)); setItems(items); ctx.set({}); }
          if (a === 'fit') { rt.ranges = []; repaint(); }
          if (a === 'png') { const cv = el.querySelector('.gl-vp canvas'); if (!cv) return; const x = document.createElement('a'); x.href = cv.toDataURL('image/png'); x.download = (doc().title || 'graph') + '.png'; x.click(); }
        };
      },
    },
  });
  function btn2(a, label, title) { return `<button type="button" class="gl-lay" data-x="${a}" title="${E(title)}">${label}</button>`; }

  M.hintExtra?.({ GraphLab: '{"preset":"' + Object.keys(LIB).join('|') + '","params":{"a":{"v":1,"min":0,"max":5}}} or {"items":[{"kind":"fn","y":"a*sin(x)"},{"kind":"param","x":"cos(t)","y":"sin(t)","t":[0,6.28]},{"kind":"polar","r":"…"},{"kind":"field","u":"…","v":"…"},{"kind":"surface","z":"…"},{"kind":"point","x":"…","y":"…"},{"kind":"ode","vars":{"x":1,"v":0},"d":{"x":"v","v":"-k*x"},"tmax":20,"draw":{"x":"x","y":"0"}}],"params":{…},"views":[{"type":"graph|time|phase|table|heat","x":[-5,5],"y":[-3,3]}]} — math syntax: ^, sin, ln, sqrt, pi, implicit 2x; t = time (animates); prefer a preset when one fits; use for math functions and physics' });
  M.hintKw?.({ GraphLab: /函数|图像|画.{0,3}(图|曲线|函数)|曲线|坐标|方程|导数|极坐标|参数方程|向量场|电场|单摆|抛体|弹簧|振动|轨道|波|物理|模拟|plot|graph|function|curve|equation|physics|simulat|pendulum|projectile|oscillat|orbit|field|wave/i });
  M.addWant?.(/函数|图像|画.{0,3}(图|曲线|函数)|曲线|方程|极坐标|参数方程|向量场|电场|单摆|抛体|弹簧|振动|轨道|驻波|物理|模拟|plot|graph|curve|physics|simulat|pendulum|projectile|orbit/i);
})();
