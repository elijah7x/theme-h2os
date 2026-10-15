// CDP helper for a harness Obsidian instance. Node >= 22 (global WebSocket, fetch).
// usage: node /tmp/h2os-harness/cdp.mjs <port> <command> [args]
//   eval '<js expression>'            evaluate in the Obsidian renderer (awaits promises), prints JSON
//   shot <out.png> [css-selector]     screenshot whole window, or just the element's box
//   open <note.md> <live|preview|source>   open a vault note in the active leaf in that mode
//   theme <light|dark>                switch Obsidian base theme (body.theme-light / body.theme-dark)
//   reload                            reload the window (re-reads theme.css)
//   style <selector> <prop,prop,...>  print computed styles of the first match
//   settings [tab-id]                 open settings modal (optionally a tab, e.g. appearance)
//   env CDP_TARGET=<title substring> picks another window (settings is a separate window: CDP_TARGET=设置)
//   size <w> <h>                      resize window content area
const [port, cmd, ...args] = process.argv.slice(2);
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const want = process.env.CDP_TARGET; // substring of window title, e.g. CDP_TARGET=设置 for the settings window (Obsidian 1.14 opens settings in its own window)
const pages = list.filter(t => t.type === 'page');
const page = (want && pages.find(t => t.title.includes(want))) || pages.find(t => /obsidian\.md/.test(t.url)) || pages[0];
if (!page) { console.error('no page target', list); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails));
  return r.result.result.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  if (cmd === 'eval') {
    console.log(JSON.stringify(await evalJs(args[0]), null, 2));
  } else if (cmd === 'shot') {
    const [out, sel] = args;
    let clip;
    if (sel) {
      const box = await evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
      if (!box) throw new Error('selector not found: ' + sel);
      clip = box;
    }
    const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
    (await import('node:fs')).writeFileSync(out, Buffer.from(r.result.data, 'base64'));
    console.log('wrote', out);
  } else if (cmd === 'open') {
    const [note, mode = 'live'] = args;
    console.log(await evalJs(`(async()=>{const f=app.vault.getAbstractFileByPath(${JSON.stringify(note)});if(!f)return 'not found';const leaf=app.workspace.getLeaf(false);await leaf.openFile(f,{state:{mode:${JSON.stringify(mode)}==='preview'?'preview':'source',source:${JSON.stringify(mode)}==='source'}});await new Promise(r=>setTimeout(r,500));return 'opened '+f.path+' as ${mode}'})()`));
  } else if (cmd === 'theme') {
    const t = args[0] === 'dark' ? 'obsidian' : 'moonstone';
    console.log(await evalJs(`(async()=>{ app.changeTheme(${JSON.stringify(t)}); await new Promise(r=>setTimeout(r,800)); return document.body.className.match(/theme-\\w+/)[0] })()`));
  } else if (cmd === 'reload') {
    await send('Page.reload'); console.log('reloading'); await sleep(2500);
  } else if (cmd === 'style') {
    const [sel, props] = args;
    console.log(JSON.stringify(await evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const s=getComputedStyle(e);const o={};for(const p of ${JSON.stringify(props.split(','))})o[p]=s.getPropertyValue(p);const r=e.getBoundingClientRect();o.rect=[r.x,r.y,r.width,r.height].map(n=>Math.round(n*10)/10);return o})()`), null, 2));
  } else if (cmd === 'settings') {
    console.log(await evalJs(`(async()=>{app.setting.open();${args[0] ? `app.setting.openTabById(${JSON.stringify(args[0])});` : ''}await new Promise(r=>setTimeout(r,600));return 'settings open'})()`));
  } else if (cmd === 'size') {
    await send('Emulation.setDeviceMetricsOverride', { width: +args[0], height: +args[1], deviceScaleFactor: 2, mobile: false });
    console.log('sized');
  } else { console.error('unknown command'); process.exit(2); }
} finally { ws.close(); }
process.exit(0);
