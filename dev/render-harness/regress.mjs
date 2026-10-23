// 细节回归检查：每次改 theme.css、交付之前跑一遍。
// usage: node dev/render-harness/regress.mjs <cdp-port>      （先用 launch.sh 起一个实例，主题目录指向本仓库）
// 每条检查对应一个"以前出过问题、修过、后来又被别的改动弄坏"的细节；FAIL 时退出码为 1。
// 新踩到的细节坑，必须在这里补一条检查，再去修。
import fs from 'node:fs';

const port = process.argv[2];
if (!port) { console.error('usage: node regress.mjs <cdp-port>'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); };

async function connect(match) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const pages = list.filter(t => t.type === 'page');
  const page = (match && pages.find(t => match.test(t.title))) || pages.find(t => /obsidian\.md/.test(t.url)) || pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails));
    return r.result.result.value;
  };
  return { send, ev, close: () => ws.close() };
}

const main = await connect();
await main.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(500);
const open = async (note, mode) => main.ev(`(async()=>{const f=app.vault.getAbstractFileByPath(${JSON.stringify(note)});const leaf=app.workspace.getLeaf(false);await leaf.openFile(f,{state:{mode:${JSON.stringify(mode)}==='preview'?'preview':'source',source:false}});app.workspace.setActiveLeaf(leaf,{focus:true});await new Promise(r=>setTimeout(r,700));return 1})()`);

// ── 准备：嵌套文件夹（文件树折叠线）、两种模式的样本、基础配置 ─────────────
await main.ev(`(async()=>{
  const v=app.vault;
  for (const f of ['Config','Config/Agents','Config/Agents/Sub']) if(!v.getAbstractFileByPath(f)) await v.createFolder(f);
  for (const n of ['Config/Agents/a.md','Config/Agents/Sub/deep.md']) if(!v.getAbstractFileByPath(n)) await v.create(n,'# '+n);
  app.vault.setConfig('showInlineTitle', true); app.vault.setConfig('readableLineLength', true);
  app.workspace.iterateRootLeaves(l=>l.detach());   // 清掉上次遗留的标签页，保证检查只面对当前这一页
  app.workspace.leftSplit.expand(); app.workspace.rightSplit.expand();
  return 1})()`);

// ── 1. 折叠竖线必须在折叠箭头正下方（文件树 + 大纲）────────────────────────
const guideJs = (sel) => `(()=>{const root=document.querySelector(${JSON.stringify(sel)});if(!root)return {err:'no root'};
  const out=[];for(const t of root.querySelectorAll('.tree-item')){const ch=t.querySelector(':scope > .tree-item-children');if(!ch||!ch.children.length)continue;
   const self=t.querySelector(':scope > .tree-item-self');const icon=self&&self.querySelector('.tree-item-icon');if(!icon)continue;
   const ir=icon.getBoundingClientRect(),cr=ch.getBoundingClientRect();if(!ir.width||!cr.width)continue;
   const bw=parseFloat(getComputedStyle(ch).borderLeftWidth)||0;
   out.push({name:(self.textContent||'').trim().slice(0,14),diff:+((cr.left+bw/2)-(ir.left+ir.width/2)).toFixed(2)});}
  return {out};})()`;
{
  await main.ev(`(async()=>{const leaf=app.workspace.getLeavesOfType('file-explorer')[0];if(leaf)await leaf.view.revealInFolder(app.vault.getAbstractFileByPath('Config/Agents/Sub/deep.md'));return 1})()`);
  await sleep(500);
  const ex = await main.ev(guideJs('.workspace-leaf-content[data-type=file-explorer]'));
  const bad = (ex.out || []).filter(o => Math.abs(o.diff) > 1.5);
  check('文件树：折叠竖线在箭头正下方', !ex.err && ex.out.length > 0 && bad.length === 0, JSON.stringify(ex.err ? ex : (bad.length ? bad : ex.out.map(o => o.diff))));
  // 行高：相邻两行的间距不得超过原生（原生约 27px；2.0 初版曾做到 34px，一屏少看 20% 的行）
  const pitch = await main.ev(`(()=>{const rows=[...document.querySelectorAll('.workspace-leaf-content[data-type=file-explorer] .tree-item-self')].filter(r=>r.getBoundingClientRect().height>0);if(rows.length<4)return null;const t=rows.map(r=>r.getBoundingClientRect().top);const d=[];for(let i=1;i<t.length;i++)d.push(+(t[i]-t[i-1]).toFixed(1));d.sort((a,b)=>a-b);return d[Math.floor(d.length/2)]})()`);
  check('文件树：行距不超过原生（≤ 28px）', pitch !== null && pitch <= 28, `median pitch=${pitch}`);
  // 嵌套：子文件夹的箭头必须明显缩进到父级竖线右侧（≥ 12px），否则箭头会贴在上一层的线上
  const indent = await main.ev(`(()=>{const root=document.querySelector('.workspace-leaf-content[data-type=file-explorer]');const out=[];
    for(const t of root.querySelectorAll('.tree-item')){const ch=t.querySelector(':scope > .tree-item-children');if(!ch)continue;const gx=ch.getBoundingClientRect().left;
      for(const c of ch.querySelectorAll(':scope > .tree-item')){const ic=c.querySelector(':scope > .tree-item-self .tree-item-icon');if(!ic)continue;const r=ic.getBoundingClientRect();if(!r.width)continue;out.push(+((r.left+r.width/2)-gx).toFixed(1))}}
    return out})()`);
  check('文件树：子文件夹箭头相对父级竖线缩进 ≥ 12px', indent.length > 0 && indent.every(v => v >= 12), JSON.stringify(indent));
  await open('Everything.md', 'preview');
  await main.ev(`app.commands.executeCommandById('outline:open')`); await sleep(1200);
  const ol = await main.ev(guideJs('.workspace-leaf-content[data-type=outline]'));
  const bad2 = (ol.out || []).filter(o => Math.abs(o.diff) > 1.5);
  check('大纲：折叠竖线在箭头正下方', !ol.err && ol.out.length > 0 && bad2.length === 0, JSON.stringify(ol.err ? ol : (bad2.length ? bad2 : ol.out.map(o => o.diff))));
}

// ── 2. 属性区左缘 = 标题左缘（Obsidian 原生有 translateX(-4px)，被压掉过一次）──
// 量 .metadata-properties（内容）而不是容器：固定的属性栏容器左伸 4px 给聚焦环留位，内容左缘才是要对齐的。
for (const mode of ['live', 'preview']) {
  await open('Everything.md', mode);
  const r = await main.ev(`(()=>{const v=document.querySelector('.workspace-leaf.mod-active '+${JSON.stringify(mode === 'live' ? '.markdown-source-view' : '.markdown-preview-view')});if(!v)return null;const m=v.querySelector('.metadata-properties'),t=v.querySelector('.inline-title');if(!m||!t)return null;return {m:m.getBoundingClientRect().left,t:t.getBoundingClientRect().left}})()`);
  check(`属性区左缘对齐标题（${mode}）`, !!r && Math.abs(r.m - r.t) <= 1, JSON.stringify(r));
}

// ── 2b. 页边图谱：实时预览滚下去后属性栏仍在视口里（sticky）；h2-atlas-scroll 撤掉固定 ──
// 阅读模式不测：Obsidian 滚过约 1000px 会卸载属性区，固定不了，主题里也没写规则。
// 双列要容器 ≥ 1040px：窗口放到 1700 并收起两侧栏（同 3c）。
{
  await main.send('Emulation.setDeviceMetricsOverride', { width: 1700, height: 900, deviceScaleFactor: 1, mobile: false });
  await main.ev(`app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); 1`); await sleep(500);
  await open('Other.md', 'live');
  await open('Everything.md', 'live');
  const probe = () => main.ev(`(async()=>{const L=document.querySelector('.workspace-leaf.mod-active');const sc=L.querySelector('.markdown-source-view .cm-scroller');const m=L.querySelector('.metadata-container');if(!sc||!m)return null;
    sc.scrollTop=800;await new Promise(r=>setTimeout(r,400));const r=m.getBoundingClientRect(),s=sc.getBoundingClientRect();
    const o={pos:getComputedStyle(m).position,top:Math.round(r.top),bottom:Math.round(r.bottom),sTop:Math.round(s.top),sBottom:Math.round(s.bottom)};sc.scrollTop=0;await new Promise(r=>setTimeout(r,200));return o})()`);
  const pinned = await probe();
  check('页边图谱：实时预览滚动后属性栏仍在视口内', !!pinned && pinned.pos === 'sticky' && pinned.top >= pinned.sTop && pinned.bottom <= pinned.sBottom, JSON.stringify(pinned));
  await main.ev(`document.body.classList.add('h2-atlas-scroll'); 1`); await sleep(250);
  const away = await probe();
  await main.ev(`document.body.classList.remove('h2-atlas-scroll'); 1`); await sleep(250);
  check('页边图谱：h2-atlas-scroll 开启后属性栏随页滚走', !!away && away.pos !== 'sticky' && away.top < away.sTop, JSON.stringify(away));
  await main.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await main.ev(`app.workspace.leftSplit.expand(); app.workspace.rightSplit.expand(); 1`); await sleep(300);
}

// ── 2c. 非 active tab 悬停：官方画在外层 header 上的底部内阴影线和圆角脚要关掉，只留 pill ──
// 官方规则 app.css 7002-7018；用 CDP 强制 :hover，不依赖真实鼠标（鼠标悬停的渲染不稳）。
{
  await main.ev(`(async()=>{const f=app.workspace.getLeaf(false);await f.openFile(app.vault.getAbstractFileByPath('Everything.md'));app.workspace.setActiveLeaf(f,{focus:true});const l=app.workspace.getLeaf('tab');await l.openFile(app.vault.getAbstractFileByPath('Other.md'));app.workspace.setActiveLeaf(f,{focus:true});await new Promise(r=>setTimeout(r,500));return 1})()`);
  await main.send('DOM.enable'); await main.send('CSS.enable');
  const hoverProbe = async (sel) => {
    await main.ev(`document.querySelectorAll('[data-h2probe]').forEach(e=>e.removeAttribute('data-h2probe')); [...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>!x.classList.contains('is-active')&&x.getBoundingClientRect().width>0)?.setAttribute('data-h2probe','1'); 1`);
    const doc = await main.send('DOM.getDocument', { depth: 0 });
    const q = await main.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '[data-h2probe="1"]' });
    if (!q.result.nodeId) return null;
    await main.send('CSS.forcePseudoState', { nodeId: q.result.nodeId, forcedPseudoClasses: ['hover'] });
    await sleep(400);
    const r = await main.ev(`(()=>{const h=document.querySelector('[data-h2probe="1"]');const g=(p)=>getComputedStyle(h,p);return {shadow:g().boxShadow,before:g('::before').display,after:g('::after').display}})()`);
    await main.send('CSS.forcePseudoState', { nodeId: q.result.nodeId, forcedPseudoClasses: [] });
    await main.ev(`document.querySelector('[data-h2probe]')?.removeAttribute('data-h2probe'); 1`);
    return r;
  };
  const rootTab = await hoverProbe('.mod-root .workspace-tab-header');
  const sideTab = await hoverProbe('.workspace-split.mod-left-split .workspace-tab-header');
  check('tab 悬停：无官方外层内阴影线与圆角脚（主区 / 侧栏）', !!rootTab && !!sideTab && rootTab.shadow === 'none' && rootTab.before === 'none' && rootTab.after === 'none' && sideTab.shadow === 'none', JSON.stringify({ rootTab, sideTab }));
}

// ── 2d. 文件树重命名（issue #3）：全选后在选区里拖动不能变成拖文件——行须 -webkit-user-drag: none（Blink 找不到可拖祖先才退回选字）；
//        按住时也不缩放/变淡。普通行仍可拖、有按压反馈。CDP 模拟鼠标起不了真实拖拽，只能量样式。
{
  await main.ev(`app.workspace.leftSplit.expand(); 1`); await sleep(300);
  const pressProbe = async (rename) => {
    await main.ev(`(async()=>{const fe=app.workspace.getLeavesOfType('file-explorer')[0].view;const f=app.vault.getAbstractFileByPath('Other.md');await fe.revealInFolder(f);if(${rename})await fe.startRenameFile(f);await new Promise(r=>setTimeout(r,400));return 1})()`);
    const r = await main.ev(`(()=>{const s=${rename}?document.querySelector('.is-being-renamed [contenteditable]'):[...document.querySelectorAll('.workspace-leaf-content[data-type=file-explorer] .nav-file-title')].find(e=>!e.classList.contains('is-being-renamed'));if(!s)return null;const b=s.getBoundingClientRect();return {x:b.x+4,y:b.y+b.height/2}})()`);
    if (!r) return null;
    await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await sleep(250);
    const st = await main.ev(`(()=>{const s=document.querySelector(':is(.tree-item-self):active');if(!s)return null;const g=getComputedStyle(s);return {renaming:s.classList.contains('is-being-renamed'),transform:g.transform,opacity:g.opacity,drag:g.webkitUserDrag}})()`);
    await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await main.ev(`(async()=>{const el=document.querySelector('.is-being-renamed [contenteditable]');if(el){el.blur();}await new Promise(r=>setTimeout(r,300));return 1})()`);
    return st;
  };
  const ren = await pressProbe(true);
  const plain = await pressProbe(false);
  check('文件树重命名：行不可拖（拖选文字不会变成拖文件）、按住时不缩放不变淡；普通行仍可拖、有按压反馈', !!ren && ren.renaming && ren.drag === 'none' && ren.transform === 'none' && ren.opacity === '1' && !!plain && plain.drag === 'element' && plain.transform !== 'none',
    JSON.stringify({ ren, plain }));
}

// ── 3. 实时预览与阅读模式的标题颜色一致 ───────────────────────────────────
{
  await open('Everything.md', 'live');
  const lp = await main.ev(`getComputedStyle(document.querySelector('.workspace-leaf.mod-active .markdown-source-view .cm-header-1')).color`);
  await open('Everything.md', 'preview');
  const pv = await main.ev(`getComputedStyle(document.querySelector('.workspace-leaf.mod-active .markdown-preview-view h1')).color`);
  check('H1 颜色：实时预览 = 阅读模式', lp === pv, `${lp} / ${pv}`);
}

// ── 3b. 标题三段线一页一条：开内嵌标题 → H1 不画线；关 → H1 画线 ────────────
{
  const h1Line = async (mode, inline) => {
    await main.ev(`app.vault.setConfig('showInlineTitle', ${inline}); app.updateInlineTitleDisplay(); 1`);
    await open('Everything.md', mode);
    return main.ev(`getComputedStyle(document.querySelector('.workspace-leaf.mod-active ${mode === 'live' ? '.markdown-source-view .cm-line.HyperMD-header-1' : '.markdown-preview-view h1'}'), '::after').content`);
  };
  const got = {};
  for (const mode of ['live', 'preview']) for (const inline of [true, false]) got[`${mode}/${inline ? 'on' : 'off'}`] = await h1Line(mode, inline);
  await main.ev(`app.vault.setConfig('showInlineTitle', true); app.updateInlineTitleDisplay(); 1`);
  check('H1 三段线：开内嵌标题时不画、关闭时画（两种模式）',
    got['live/on'] === 'none' && got['preview/on'] === 'none' && got['live/off'] === '""' && got['preview/off'] === '""', JSON.stringify(got));
}

// ── 3c. Style Settings 适配：类开关与 --h2-set-* 覆盖口生效，且默认值不变 ─────────
// 不依赖插件：直接在 body 上加类 / 写内联变量，等价于 Style Settings 写入 body.css-settings-manager。
{
  await main.send('Emulation.setDeviceMetricsOverride', { width: 1700, height: 900, deviceScaleFactor: 1, mobile: false });
  await main.ev(`app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); app.vault.setConfig('showInlineTitle', true); app.updateInlineTitleDisplay(); 1`); await sleep(500);
  await open('Everything.md', 'live');
  const probe = () => main.ev(`(()=>{const L=document.querySelector('.workspace-leaf.mod-active');const t=L.querySelector('.inline-title'),h=L.querySelector('.markdown-source-view .cm-line.HyperMD-header-1'),m=L.querySelector('.metadata-container');
    const g=(e,k,ps)=>getComputedStyle(e,ps)[k];
    return {noise:g(document.body,'display','::after'),float:g(m,'float'),titleRule:g(t,'content','::after'),titleBg:g(t,'backgroundImage','::after'),
      titleSize:g(t,'fontSize'),h1Size:g(h,'fontSize'),titleW:g(t,'fontWeight'),h1W:g(h,'fontWeight'),titleFont:g(t,'fontFamily'),h1Font:g(h,'fontFamily'),
      bodyLH:g(L.querySelector('.cm-line:not(.HyperMD-header-1)'),'lineHeight'),
      levels:[2,3,4,5,6].map(n=>{const e=L.querySelector('.markdown-source-view .cm-line.HyperMD-header-'+n);return e?g(e,'fontSize')+'/'+g(e,'fontWeight'):'-'}).join(' ')}})()`);
  const withCls = async (cls, on) => { await main.ev(`document.body.classList.${on ? 'add' : 'remove'}(${JSON.stringify(cls)}); 1`); await sleep(250); return probe(); };
  const withVar = async (k, v) => { await main.ev(`${v === null ? `document.body.style.removeProperty(${JSON.stringify(k)})` : `document.body.style.setProperty(${JSON.stringify(k)}, ${JSON.stringify(v)})`}; 1`); await sleep(250); return probe(); };
  const d = await probe();
  const noise = await withCls('h2-no-noise', true); await withCls('h2-no-noise', false);
  const atlas = await withCls('h2-no-margin-atlas', true); await withCls('h2-no-margin-atlas', false);
  const ruleOff = await withCls('h2-title-rule-off', true); await withCls('h2-title-rule-off', false);
  const solid = await withCls('h2-rule-solid', true); await withCls('h2-rule-solid', false);
  const size = await withVar('--h2-set-title-size', '60px'); await withVar('--h2-set-title-size', null);
  const wt = await withVar('--h2-set-h1-weight', '700'); await withVar('--h2-set-h1-weight', null);
  const iwt = await withVar('--h2-set-inline-title-weight', '600'); await withVar('--h2-set-inline-title-weight', null);
  const font = await withVar('--h2-set-heading-font', 'Georgia, serif'); await withVar('--h2-set-heading-font', null);
  const lh = await withVar('--h2-line-height-body', '2'); await withVar('--h2-line-height-body', null);
  const lvSet = async (kind, vals) => { for (const [n, v] of vals) await withVar(`--h2-set-h${n}-${kind}`, v); const out = await probe(); for (const [n] of vals) await withVar(`--h2-set-h${n}-${kind}`, null); return out.levels; };
  const lvSize = await lvSet('size', [[2, '44px'], [3, '32px'], [4, '24px'], [5, '18px'], [6, '14px']]);
  const lvWeight = await lvSet('weight', [[2, '700'], [3, '500'], [4, '400'], [5, '700'], [6, '500']]);
  const back = await probe();
  check('Style Settings：默认值不变（标题 48px、H1 500、三段线在、页边图谱在、噪点在）',
    d.titleSize === '48px' && d.h1Size === '48px' && d.h1W === '500' && d.titleW === '400' && d.titleRule === '""' && d.float === 'left' && d.noise === 'block', JSON.stringify({ size: [d.titleSize, d.h1Size], w: [d.titleW, d.h1W], rule: d.titleRule, float: d.float, noise: d.noise }));
  check('Style Settings：噪点 / 页边图谱 / 标题线 / 实线 开关', noise.noise === 'none' && atlas.float === 'none' && ruleOff.titleRule === 'none' && !/31%/.test(solid.titleBg) && /31%/.test(d.titleBg),
    JSON.stringify({ noise: noise.noise, float: atlas.float, rule: ruleOff.titleRule, solidBg: solid.titleBg.slice(0, 60) }));
  check('Style Settings：标题字号 / 字重 / 字体 / 正文行高 覆盖口', size.titleSize === '60px' && size.h1Size === '60px' && wt.h1W === '700' && iwt.titleW === '600'
    && font.titleFont.startsWith('Georgia') && font.h1Font.startsWith('Georgia') && lh.bodyLH === '32px',
    JSON.stringify({ size: [size.titleSize, size.h1Size], wt: wt.h1W, iwt: iwt.titleW, font: [font.titleFont.slice(0, 12), font.h1Font.slice(0, 12)], lh: lh.bodyLH }));
  check('Style Settings：H2–H6 字号 / 字重覆盖口，默认不变', d.levels === '36px/500 28px/600 20px/600 16px/600 12px/600'
    && lvSize === '44px/500 32px/600 24px/600 18px/600 14px/600' && lvWeight === '36px/700 28px/500 20px/400 16px/700 12px/500',
    JSON.stringify({ d: d.levels, size: lvSize, weight: lvWeight }));
  check('Style Settings：撤销后回到默认', JSON.stringify(back) === JSON.stringify(d), JSON.stringify({ size: back.titleSize, float: back.float, noise: back.noise }));
  await main.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await main.ev(`app.workspace.leftSplit.expand(); app.workspace.rightSplit.expand(); 1`); await sleep(300);
}

// ── 4. 限制行宽开关真的有效（无属性的笔记：开 ≤800，关 ≥1200，窗口 1600）─────
{
  await main.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await main.ev(`app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); 1`); await sleep(500);
  await open('Other.md', 'preview');
  const w = async (on) => { await main.ev(`app.vault.setConfig('readableLineLength', ${on}); 1`); await sleep(700); return main.ev(`document.querySelector('.workspace-leaf.mod-active .markdown-preview-sizer').getBoundingClientRect().width`); };
  const on = await w(true), off = await w(false);
  await main.ev(`app.vault.setConfig('readableLineLength', true); 1`);
  check('限制行宽：开 ≤ 800、关 ≥ 1200', on <= 801 && off >= 1200, `on=${Math.round(on)} off=${Math.round(off)}`);
  await main.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await main.ev(`app.workspace.leftSplit.expand(); app.workspace.rightSplit.expand(); 1`); await sleep(500);
}

// Bases 的横向滑块不能随正文纵向滚动条一起隐藏。
{
  try {
    await main.ev(`(async()=>{
      const leaf=app.workspace.getLeaf(false);
      const ctx=window.__h2BasesRegression={leaf,state:leaf.getViewState(),theme:app.getTheme(),folder:'H2-Bases-Scrollbar-'+Date.now()};
      const v=app.vault, columns=Array.from({length:12},(_,i)=>'column'+i);
      await v.createFolder(ctx.folder);
      for(let i=0;i<3;i++) await v.create(ctx.folder+'/sample'+i+'.md',
        ['---',...columns.map(c=>c+': sample '+i+' '+c),'---','# Sample '+i].join('\\n'));
      // Installed app.js: Bases YAML parser accepts views/order/columnSize and file.inFolder().
      const order=['file.name',...columns.map(c=>'note.'+c)];
      const yaml=['filters:', '  and:', '    - '+JSON.stringify('file.inFolder("'+ctx.folder+'")'),
        '    - '+JSON.stringify('file.ext == "md"'), 'views:', '  - type: table', '    name: Scrollbar regression',
        '    order:', ...order.map(c=>'      - '+c), '    columnSize:', ...order.map(c=>'      '+c+': 240')].join('\\n');
      ctx.base=await v.create(ctx.folder+'/Wide.base',yaml);
      ctx.embed=await v.create(ctx.folder+'/Embed.md','![[Wide.base]]');
      return 1;
    })()`);
    for (const theme of ['moonstone', 'obsidian']) {
      await main.ev(`app.changeTheme(${JSON.stringify(theme)}); 1`); await sleep(700);
      for (const context of ['standalone', 'embed-preview', 'embed-live', 'sidebar']) {
        const r = await main.ev(`(async()=>{
          const ctx=window.__h2BasesRegression, context=${JSON.stringify(context)};
          const leaf=context==='sidebar'?(ctx.side||(ctx.side=app.workspace.getRightLeaf(true))):ctx.leaf;
          await leaf.openFile(context.startsWith('embed')?ctx.embed:ctx.base,
            {state:{mode:context==='embed-preview'?'preview':'source',source:false}});
          app.workspace.setActiveLeaf(leaf,{focus:true});
          let el;
          for(let i=0;i<50;i++){
            el=[...leaf.view.containerEl.querySelectorAll('.bases-view[data-view-type="table"]')].find(e=>e.clientWidth>0);
            if(el&&el.scrollWidth>el.clientWidth)break;
            await new Promise(r=>setTimeout(r,100));
          }
          if(!el)return {error:'No rendered Bases table'};
          const bar=getComputedStyle(el,'::-webkit-scrollbar'),thumb=getComputedStyle(el,'::-webkit-scrollbar-thumb');
          const before=el.scrollLeft;el.scrollLeft=before===0?80:0;
          const after=el.scrollLeft;el.scrollLeft=before;
          return {width:el.clientWidth,scrollWidth:el.scrollWidth,scrollbarWidth:getComputedStyle(el).scrollbarWidth,
            display:bar.display,height:bar.height,verticalWidth:bar.width,thumbDisplay:thumb.display,
            scrollbarColor:getComputedStyle(el).scrollbarColor,thumbColor:thumb.backgroundColor,thumbRadius:thumb.borderRadius,moved:after!==before};
        })()`);
        const label = `Bases 横向滚动条（${theme}/${context}）`;
        check(label, !!r && !r.error && r.width > 0 && r.scrollWidth > r.width && r.scrollbarWidth === 'auto'
          && r.display !== 'none' && r.thumbDisplay !== 'none' && r.height === '8px' && r.verticalWidth === '0px'
          && r.scrollbarColor === 'auto' && r.thumbColor !== 'rgba(0, 0, 0, 0)' && r.thumbRadius === '0px' && r.moved, JSON.stringify(r));
      }
      await main.ev(`app.workspace.setActiveLeaf(window.__h2BasesRegression.leaf,{focus:true}); 1`);
      for (const mode of ['live', 'preview']) {
        await open('Everything.md', mode);
        const r = await main.ev(`(()=>{
          const el=window.__h2BasesRegression.leaf.view.containerEl.querySelector(${JSON.stringify(mode === 'live' ? '.cm-scroller' : '.markdown-preview-view')});
          if(!el)return null;
          const bar=getComputedStyle(el,'::-webkit-scrollbar');
          return {width:getComputedStyle(el).scrollbarWidth,display:bar.display,height:bar.height};
        })()`);
        check(`正文滚动条仍隐藏（${theme}/${mode}）`, !!r && r.width === 'none' && r.display === 'none' && r.height === '0px', JSON.stringify(r));
      }
    }
  } catch (e) {
    check('Bases 横向滚动条：用例执行', false, String(e));
  } finally {
    await main.ev(`(async()=>{
      const ctx=window.__h2BasesRegression;if(!ctx)return 1;
      try {
        if(ctx.side)ctx.side.detach();
        await ctx.leaf.setViewState(ctx.state);
        app.workspace.setActiveLeaf(ctx.leaf,{focus:true});
      } finally {
        app.changeTheme(ctx.theme);
        delete window.__h2BasesRegression;
      }
      return 1;
    })()`);
    await sleep(700);
  }
}

// ── 5. 右栏收起后，视图切换钮仍在右下角 ───────────────────────────────────
{
  await main.ev(`app.workspace.rightSplit.collapse(); 1`); await sleep(900);
  const p = await main.ev(`(()=>{const it=document.querySelector('.status-bar-item.plugin-editor-status');if(!it)return null;const r=it.getBoundingClientRect();const others=[...document.querySelectorAll('.status-bar-item:not(.plugin-editor-status)')].map(e=>getComputedStyle(e).opacity);return {right:innerWidth-r.right,bottom:innerHeight-r.bottom,op:getComputedStyle(it).opacity,others}})()`);
  check('右栏收起：视图切换钮在右下角且可见', !!p && Math.abs(p.right - 12) <= 2 && Math.abs(p.bottom - 12) <= 2 && p.op === '1' && p.others.every(o => o === '0'), JSON.stringify(p));
  await main.ev(`app.workspace.rightSplit.expand(); 1`);
}

// ── 6. 空标签页：徽记 + 字标 H₂ OS + 常显操作，整列居中 ───────────────────
{
  await main.ev(`app.workspace.iterateRootLeaves(l=>l.detach()); 1`); await sleep(500);
  await main.ev(`app.workspace.getLeaf('tab'); 1`); await sleep(1800);
  const b = await main.ev(`(()=>{const leaf=document.querySelector('.workspace-leaf-content[data-type=empty]');if(!leaf)return null;
    const c=leaf.querySelector('.empty-state-container'),t=leaf.querySelector('.empty-state-title'),l=leaf.querySelector('.empty-state-action-list');
    const cb=getComputedStyle(c,'::before'),tb=getComputedStyle(t,'::before'),ta=getComputedStyle(t,'::after');
    const lr=leaf.getBoundingClientRect(),cr=c.getBoundingClientRect();
    return {w:cb.width,bg:cb.backgroundImage.slice(0,28),h2:tb.content,os:ta.content,gap:getComputedStyle(t).columnGap,
      listOp:getComputedStyle(l).opacity,actions:l.querySelectorAll('.empty-state-action').length,
      dx:Math.abs((cr.left+cr.width/2)-(lr.left+lr.width/2))}})()`);
  check('空标签页：徽记 200px 内嵌 SVG', !!b && b.w === '200px' && b.bg.startsWith('url("data:image/svg+xml'), JSON.stringify(b && {w: b.w, bg: b.bg}));
  check('空标签页：字标 H₂ OS（下标 2，两段不贴在一起）', !!b && b.h2 === '"H₂"' && b.os === '"OS"' && parseFloat(b.gap) >= 6, JSON.stringify(b && {h2: b.h2, os: b.os, gap: b.gap}));
  check('空标签页：操作列表常显且整列居中', !!b && b.listOp === '1' && b.actions >= 3 && b.dx <= 3, JSON.stringify(b && {op: b.listOp, n: b.actions, dx: b.dx}));
}

// ── 6b. 左下角设置按钮 = 红色 H₂ 矢量（亮 #D14A4A / 暗 #E5645F）──────────────
{
  const g = async (dark) => { await main.ev(`app.changeTheme(${dark ? "'obsidian'" : "'moonstone'"}); 1`); await sleep(900); return main.ev(`(()=>{const b=document.querySelector('.workspace-drawer-vault-actions > .clickable-icon:last-child');if(!b)return null;const cs=getComputedStyle(b);return {bg:cs.backgroundImage,size:cs.backgroundSize,svgHidden:getComputedStyle(b.querySelector('svg')).display}})()`); };
  const l = await g(false), d = await g(true);
  await main.ev(`app.changeTheme('moonstone'); 1`); await sleep(600);
  const ok = !!l && !!d && l.bg.includes('%23D14A4A') !== undefined && decodeURIComponent(l.bg).includes('#D14A4A') && decodeURIComponent(d.bg).includes('#E5645F') && l.size === '14px 12px' && l.svgHidden === 'none';
  check('设置按钮：红色 H₂ 矢量（亮暗各自红色）', ok, JSON.stringify(l && { size: l.size, svgHidden: l.svgHidden }));
}

// ── 7. 设置窗口：左栏不过宽；折三角开关几何与折叠态正确 ───────────────────
{
  await main.ev(`app.setting.open(); app.setting.openTabById('editor'); 1`); await sleep(2500);
  const st = await connect(/设置|Settings/i);
  const r = await st.ev(`(()=>{const h=document.querySelector('.modal.mod-settings .vertical-tab-header');
    const t=[...document.querySelectorAll('.checkbox-container')].map(e=>{const r=e.getBoundingClientRect(),a=getComputedStyle(e,'::after'),b=getComputedStyle(e,'::before');return {en:e.classList.contains('is-enabled'),w:+r.width.toFixed(1),h:+r.height.toFixed(2),afterTf:a.transform,aw:a.width,clip:b.clipPath}});
    return {nav:h&&Math.round(h.getBoundingClientRect().width),t}})()`);
  check('设置页左栏宽度 ≤ 256', r.nav && r.nav <= 256, `nav=${r.nav}`);
  const geomOk = r.t.length > 0 && r.t.every(x => Math.abs(x.w - 36) <= 0.5 && Math.abs(x.h - 20.78) <= 0.2 && x.aw === '24px' && x.clip.startsWith('polygon'));
  check('开关：平行四边形轨道 36×20.78、三角边长 24', geomOk, JSON.stringify(r.t.slice(0, 2)));
  const m = s => (s.match(/matrix3d\(([^)]*)\)/) || [, ''])[1].split(',').map(Number);
  const foldOk = r.t.every(x => { const v = m(x.afterTf); if (v.length < 6) return false; return x.en ? (Math.abs(v[0] + 0.5) < 0.01 && Math.abs(v[1] - 0.866) < 0.01) : (Math.abs(v[0] - 1) < 0.01 && Math.abs(v[1]) < 0.01); });
  check('开关：关=正立（单位矩阵），开=沿斜边折叠（镜像矩阵）', foldOk);
  st.close();
  await main.ev(`app.setting.close(); 1`);
}

main.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
