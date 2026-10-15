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
for (const mode of ['live', 'preview']) {
  await open('Everything.md', mode);
  const r = await main.ev(`(()=>{const v=document.querySelector('.workspace-leaf.mod-active '+${JSON.stringify(mode === 'live' ? '.markdown-source-view' : '.markdown-preview-view')});if(!v)return null;const m=v.querySelector('.metadata-container'),t=v.querySelector('.inline-title');if(!m||!t)return null;return {m:m.getBoundingClientRect().left,t:t.getBoundingClientRect().left}})()`);
  check(`属性区左缘对齐标题（${mode}）`, !!r && Math.abs(r.m - r.t) <= 1, JSON.stringify(r));
}

// ── 3. 实时预览与阅读模式的标题颜色一致 ───────────────────────────────────
{
  await open('Everything.md', 'live');
  const lp = await main.ev(`getComputedStyle(document.querySelector('.workspace-leaf.mod-active .markdown-source-view .cm-header-1')).color`);
  await open('Everything.md', 'preview');
  const pv = await main.ev(`getComputedStyle(document.querySelector('.workspace-leaf.mod-active .markdown-preview-view h1')).color`);
  check('H1 颜色：实时预览 = 阅读模式', lp === pv, `${lp} / ${pv}`);
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
