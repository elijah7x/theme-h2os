# 渲染验证 harness（开发用，不进 release）

用真实 Obsidian 渲染主题，CDP 截图与量样式。**独立实例**：自己的 profile 和临时 vault，不碰日常 vault。

    cp -R dev/render-harness /tmp/h2os-harness
    /tmp/h2os-harness/launch.sh <name> <port> <主题目录绝对路径> [light|dark]   # 等约 8 秒；会清空 /tmp/h2os-harness/<name>/
    node /tmp/h2os-harness/cdp.mjs <port> open Everything.md live|preview|source
    node /tmp/h2os-harness/cdp.mjs <port> theme light|dark
    node /tmp/h2os-harness/cdp.mjs <port> shot out.png [css选择器]
    node /tmp/h2os-harness/cdp.mjs <port> eval '<js>'      # 渲染进程里，app 是 Obsidian 对象
    node /tmp/h2os-harness/cdp.mjs <port> style '<选择器>' 'prop1,prop2'
    node /tmp/h2os-harness/cdp.mjs <port> reload           # 改完 theme.css 后重载

要点（都是踩过的）：

- Obsidian 1.14 的设置页是**独立窗口**：`CDP_TARGET=设置 node cdp.mjs <port> shot ...`；切 tab 要在主窗口 eval `app.setting.openTabById('editor')`。
- 换基础主题用 `app.changeTheme('obsidian'|'moonstone')`，`app.setTheme` 不管用。
- macOS 右键菜单默认是系统原生菜单，主题改不了；要测 DOM 菜单先 `app.vault.setConfig('nativeMenus', false)`。
- 第三方插件：把插件目录拷进 `<name>/vault/.obsidian/plugins/`，eval `await app.plugins.loadManifests(); await app.plugins.enablePlugin('<id>')`；reload 之后要重新 enable。
- 不要连日常 Obsidian，不要用 DEV_VAULT（obsidian-git 每 15 秒自动提交推送）。
- `Everything.md`（所有 Markdown 构造）和 `Tasks.md`（完成任务 + 行内代码 + 标签）是回归样本。
- **细节回归检查**：`node dev/render-harness/regress.mjs <port>`。改完 theme.css、交付之前跑一遍，全部 PASS 才算完成；新踩到的细节坑先在里面补一条检查（折叠竖线、属性区对齐、标题同色、限制行宽、右下角视图切换钮、设置页、开关几何……）。它会清掉实例里已有的标签页，并在 vault 里建 `Config/Agents/Sub` 测试文件夹，只用独立实例跑。
