# AGENTS.md — H2 OS

Obsidian theme. Single-file CSS, no build step. Aesthetic: **H2OS 现代化几何美学**
— 白底、降饱和一加红点缀、圆/三角/方几何语法、氢视窗签名。基调是"生活化、克制、
有辨识度"，2026 年精度重做的执行层，不是 2015 年 MD 旧皮肤。

完整设计文档（主文档）在作者本地知识库，不随仓库发布。
与本文件冲突时以主文档为准。宣传素材放在仓库外的上级目录 `../promo/`，不进本仓库。

---

## 纪律（必须遵守）

### 一、设计纪律（差异化核心，不可妥协）

这几条是主题的灵魂，写代码时每次都要回看。任一失守，整个体系就退化成普通极简主题。

1. **几何语法不可妥协。**
   - 圆 = 默认 / 中性 / 可交互（checkbox、tag、状态点、active rail）
   - 开关（toggle）是例外：v2.0 起由作者原创为「折三角」——平行四边形轨道（两个等边三角拼成）+ 一个三角，关 = 左边正立灰三角，开 = 沿斜边折成右边倒立红三角
   - 方 = 结构性内容（code block、table、inline code、callout 主体）
   - 三角 = 签名（只在氢视窗 + 折叠标记两处出现，不滥用）
   - 砍范围时优先级：**几何语法 > 红色 > 氢视窗**。红色可降级、氢视窗可延期，几何归属不能乱给。

2. **每个嵌套选择器显式写 `&`。**
   - `& .callout-title` ✓，裸 `.callout-title` ✗。
   - CSS Nesting 失败是静默的，整条规则丢弃不报错。显式 `&` 把兼容线压到 Chromium 112 / Safari 16.5。

3. **间距落在 4px 网格，2px 是半格、不是例外。**
   - 块级布局间距（margin / block padding）落在 4px 网格上。
   - **inline 元素的纵向微 padding 允许取 2px 半格**（inline code、tag 等——套 4px 会臃肿）。半格是网格规则的一部分，不是"inline 可以例外"的豁免，以后遇到同类情况不需要再拍板。
   - 孤儿值禁令依旧：**1px 只留给 hairline border**，3px / 5px / 7px / 11px / 13px 永远非法。
   - 这是"现代 vs 旧"的信号，不是洁癖。直角路线对执行精度零容忍。

4. **现代化优先于还原。**
   - H2OS 已停更。遇到"原版如此"与"今天更好"冲突，选后者。
   - 但前 3 条纪律不受此影响——纪律保留，执行层现代化。

5. **日常辨识度 > 氢视窗。**
   - Phase 1–2 的高频元素（checkbox 圆、callout 三角折角、table hairline）是门面。
   - 氢视窗是彩蛋不是门面。辨识度测试：遮住氢视窗，和 Minimal 并排，3 秒认不出就返工高频元素。

### 二、代码纪律

1. **只改 `theme.css`，且只在本目录（`H2 OS`）。** 这是唯一的 `main` 分支工作区。
   - **单分支架构**：所有开发在 main 上，无 dev 分支。
   - 发布流程是 `bump version + commit + tag + push`，由 GitHub Action 自动发 release。
2. **改前先读。** 定位区段（见下"theme.css 区段地图"）再动手。
3. **最小改动。** 不重构、不加装饰注释、不"顺手优化"未要求的部分。
4. **改完即验**（见下"可视化验证回路"）。纯 CSS 必须肉眼确认。
5. **亮色 + 暗色双模式**（v1.4 起，作者拍板）：亮色 token 在 `body.theme-light`，暗色整段镜像在 `theme.css` 末尾的 DARK MODE 段（`body.theme-dark`）。组件规则优先走 token，token 自动跟模式；**写死的颜色字面量**（rgba/hex/data-URI 内的色值）必须在 DARK MODE 段补暗色覆盖。新增任何视觉规则，亮暗两个模式都要渲染确认。
6. Obsidian 约定：**优先用官方变量**（`--toggle-*`、`--checkbox-*`、`--tab-*`、`--radius-*`）；自造变量统一 `--h2-*` 前缀，分 primitive / semantic / component 三层。
7. **阴影统一走 token 出口**：组件只 `box-shadow: var(--h2-shadow-2)`，不内联散值。显脏可清空 token 全局退回。
8. **过渡动画限定具体属性**（`color` / `background-color` / `border-color` / `opacity` / `transform`），不用 `transition: all`，不动 layout 属性。用 `--h2-duration-*` token，不用魔法时长。
9. `:has()` 不写到 `body` / `.workspace` 级别（沿用前两作教训，避免 Canvas 白屏）。
10. 设置页强制回退系统字体（沿用前两作教训，避免 Geometric Sans metrics 破坏原生布局）。
11. **manifest name 永远是 `H2 OS`**。Obsidian 审核读 tag 关联 commit 的 manifest，name 不符会被拒。
12. **写任何 Obsidian 内部组件的选择器前，先实测类名，禁止凭记忆写。** Phase 3 踩坑实录：连续两轮用 `::before` 抢 tab 顶线失败（Obsidian 默认主题占用伪元素）、凭空猜 `.is-pinned`/`.pin-icon`（DOM 里根本不存在）。Obsidian 内部 DOM 不稳定且无文档，凭记忆猜的选择器大概率不命中，且失败是静默的（规则写了但不生效，难排查）。

    **实测有三条路，按代价从低到高：**
    - **路 A（默认，自己动手）**：从安装包挖 asar。`app.css` 里有官方样式表原文，选择器、类名、变量名都能翻出来——比 devtools 还硬（devtools 看某一刻的 DOM，asar 看官方原文）：
      ```bash
      # 一次性解包（在 /tmp 临时目录，别污染仓库）
      npx --yes @electron/asar extract /Applications/Obsidian.app/Contents/Resources/obsidian.asar /tmp/obs-asar
      # 然后挖选择器
      grep -oE '\.vertical-tab[a-z-]*' /tmp/obs-asar/app.css | sort -u
      ```
    - **路 B（路 A 看不准时，找作者）**：少数东西 asar 查不准——某个类只在特定交互瞬间挂上（hover 中、拖拽中、运行时 JS 注入）。把问题列清楚（"选中 X 元素，告诉我 Elements 面板里的类名"），作者 `Cmd+Opt+I` 截图或复制过来。
    - **路 C（只有 GUI 权限的人能走）**：`Cmd+Opt+I` 自己看。agent 走不了这条路。

    这条规矩是为杜绝"隔着截图猜 DOM"的撞墙循环。Phase 4 验 `data-type="empty"`、v0.4 设置页/控件选择器全部走路 A 验过。

13. **Style Settings 适配**（v2.1 起）：配置块是 `theme.css` 文件头的 `/* @settings … */` 注释（YAML，中文走 `title.zh`/`description.zh`）。
    - 类开关（`class-toggle`）：规则写在文件末尾「Style Settings 适配」段，选择器带 `body.h2-xxx`，特异性比被覆盖的默认规则高一级。
    - 数值/字体/字重走 `--h2-set-*` 覆盖口：token 写成 `var(--h2-set-x, 默认值)`，**默认不定义该变量**。不要让 Style Settings 直接写 `body.is-mobile` / `body.theme-*` 里定义的 token——它写在 `body.css-settings-manager`（0,1,1），与这些块同特异性，胜负取决于 `<style>` 顺序。只有仅定义在 `body {}` 的 token（`--h2-margin-ratio`、`--h2-line-height-body`）可以直接开放。
    - 新增/改动配置项后：用真实插件在 harness 里验一遍（装进 vault 的 `.obsidian/plugins/obsidian-style-settings`，`app.plugins.enablePlugin`，`settingsManager.setSetting('h2os', id, value)`），再跑 `regress.mjs`。
    - 不开放：几何语法（圆角、折三角开关、checkbox 圆）、4px 网格、红色只做交互点缀。强调色暂未开放（红色硬编码约 50 处，含 data-URI SVG，需先改 mask-image）。

---

## 可视化验证回路

**首选：渲染 harness**（`dev/render-harness/`，见其中 README）。独立的真实 Obsidian 实例 + CDP，可程序化切亮/暗、切实时预览/阅读模式、截图、量 computed style / getBoundingClientRect。实时预览与阅读模式是两套 DOM，只看代码看不出差异，必须两模式都渲染对照；改动尽量用 `style` 量数值，不只看截图。

**交付前必跑细节回归**：`node dev/render-harness/regress.mjs <port>`（先用 `launch.sh` 起一个主题目录指向本仓库的实例），全部检查 PASS 才算完成。它检查的都是"修过又被别的改动弄坏"的细节：折叠竖线对齐箭头、属性区左缘对齐标题、实时预览与阅读模式标题同色、限制行宽有效、右栏收起后视图切换钮仍在、徽记在、设置页左栏宽度、开关几何与折叠态。**踩到新的细节坑，先在 regress.mjs 补一条检查，再去修。**改 token（尤其 `--nav-*`、`--file-line-width`、`--toggle-*`）时必须想一想它被哪些几何依赖。

备选：DEV_VAULT 通过 symlink 把本主题挂进 `../../../DEV_VAULT/.obsidian/themes/H2 OS`。
改完 `theme.css` 后：

1. 在 `../../../DEV_VAULT/.obsidian/appearance.json` 把 `cssTheme` 切到 `H2 OS`，然后 reload（`Cmd+R`）或外观设置切换主题。
2. 用测试文档对照（待建：表格 / callout / checkbox / 几何语法测试.md）。
3. 桌面截图比对（Electron，用系统截图）。
4. 验收时按主文档 Phase 1/2 验收标准检查（hairline 一致性、4px 网格、遮色层级、辨识度测试）。

---

## 调试方法论（改 CSS bug 前先读）

综合 Folio + Opendian 两个姊妹项目踩过的坑，核心要点：

### 1. 先给 bug 分类，两类修法完全不同

- **确定性修复**：成因能从 CSS 直接看出来（某属性值不对）→ 选择器写对 + 特异性够就一次生效，可以直接改。
- **渲染态修复**：成因在 DOM 布局 / 层叠 / 裁剪（被裁 / 被盖 / 位置错位）→ **必须先用 devtools 量真实渲染，拿到数据再改。禁止无数据连改多版。**

### 2. 症状在 X 元素上 ≠ 病根在 X 元素上

被裁 / 被盖类症状，病根十有八九在祖先容器，不在元素自己。

真实例子（Folio v1.2.0）：modal 输入框焦点环底部被削平，头几轮都在输入框自己的 `border / outline / box-shadow` 上试 → 全无效。真凶是祖先 `.modal-content` 的 `overflow: hidden` 底边正好与输入框底边同一条 y 线，在那条线上把焦点环裁掉。**在元素本身上怎么改都没用，因为裁剪发生在外层。**

### 2.5 病根可能来自共享底层语法的兄弟规则

A 元素表现异常，先查是不是 B 元素的规则通过共享语法 / 共享 class 漏过来的。Obsidian 里三对高发区：

| 共享语法 | 外观层 | 编辑态底层 | 误伤场景 |
|----------|--------|-----------|---------|
| callout ↔ blockquote | callout 是独立块 | callout 底层就是 `>`（`HyperMD-quote`） | blockquote 的引号伪装会命中 callout 展开后的源码行 |
| embed ↔ image | `![[x]]` 嵌入 | 同图片语法 | 图片规则可能波及嵌入 |
| tag ↔ link | `#tag` 胶囊 | 同链接底层 | 链接规则可能波及 tag |

真实例子（Folio v1.4.4）：callout 编辑态冒大空白 + 引号图标，五轮全在 callout 自己的 CSS 里找 → 全无效。真凶是 blockquote 的引号伪装规则越界——callout 展开成源码时每行 `>` 带 `HyperMD-quote`，被 blockquote 的 `::before` 误伤。**callout 的 CSS 一行都没错，是引用块规则漏过来了。**

**判据**：当 A 的症状无法用 A 自己的任何 CSS 解释、且 A 在底层和 B 共享语法时——先怀疑 B 的规则漏过来了。

### 3. 裁剪 / 遮挡类 bug 的标准第一步：devtools 量祖先链

`Cmd+Opt+I` → Console，从目标元素往上逐层打印每个祖先的 rect + overflow。

判据：**哪个祖先的某条边 ≈ 目标元素的同一条边，且该祖先 `overflow` 非 `visible`，它就是真凶。**

这一步约 5 分钟，能省掉 5 次以上的瞎改。参考探针（在 Console 顶层跑）：

```js
copy((()=>{const el=document.querySelector('要查的选择器');let n=el,out=[];
while(n&&n!==document.body){const r=n.getBoundingClientRect(),s=getComputedStyle(n);
out.push(`${n.tagName.toLowerCase()}.${(''+n.className).trim().replace(/\s+/g,'.')} `+
`| top=${r.top.toFixed(1)} bottom=${r.bottom.toFixed(1)} overflow=${s.overflow}`);
n=n.parentElement;}return out.join('\n');})())
```

- 坑：`copy()` 只在 Console **顶层**可用；放进 `setTimeout` 回调里会 `copy is not defined`。
- 想看某元素完整聚焦态样式，直接打 `getComputedStyle(el)` 的 `border / borderColor / outline / outlineOffset / boxShadow / overflow`。

### 3.5 改之前先确认目标元素的真实 DOM 类名

视觉相似 ≠ DOM 相同。改之前先确认你改的选择器真的命中了目标元素。

真实例子（Opendian v1.13.1）：frontmatter tag 下沿 descender 被裁，连改三轮 `.tag` 的 padding/line-height 都没变化。根因：frontmatter 的 tag 根本不是 `.tag`，是 `.multi-select-pill`，两套机制完全不共享 CSS。**改错元素 = 永远没变化，且很难排查。**

### 3.6 没有证据就不写规则（No Rule Without Evidence）

如果你不能指出一个 asar / devtools 观察来支撑一条规则，就不要写它。"我觉得这样可能修好"不是证据。

每次改侧栏 / chrome 布局前，**四场景脑内走查**：
1. 左文件树
2. 右大纲
3. 右第三方插件视图（如 Git）
4. 右反向链接 / 标签面板

任何场景的行为不明确，就不写这条规则。

### 4. 一版一验，不累计未验证改动

纯 CSS 看不到渲染就是盲改。用户说"没生效"时不要猜——要么要截图 / computed style，要么直说需要更多信息。

### 5. 覆盖官方规则：特异性 + 顺序双保险

压不过 Obsidian 官方规则就上 `!important`，并把规则放在被覆盖规则之后。本主题在"覆盖官方长选择器"场景本就用 `!important`。

### 6. 记录"什么没用"（防止未来重蹈覆辙）

每次踩坑后，在注释或 Journal 里记录**试过但失败的方案 + 失败原因**。未来的 session 不会浪费同样的时间。

Opendian sidebar-debug 的真实例子：`position: absolute` 解耦、负 margin 抵消、`opacity: 0` 遮盖、兄弟选择器推内容——五种方案全试过全失败，记录后永远不再重试。

---

## theme.css 区段地图

行号近似，大改后会漂移。重新生成大节标题：
`awk '/════════/{getline t; if(t!~/════/) print NR": "t}' theme.css`

| 行号 | 区段 |
|------|------|
| 1    | **HEADER**：文件头注释（字体、色彩、几何语法一句话） |
| —    | **TOKENS**：primitive 色阶 → semantic 别名 → 圆角 → 排版节奏 → 字体栈 → elevation 阴影 → 动效 |
| —    | 仅 `body.theme-light`：亮色色板（唯一模式） |
| —    | **TYPOGRAPHY**（Phase 1）：标题 → 正文 → 链接 → 引用 → 代码 → 语法高亮 → 列表 → 分隔线 → 标签 → 复选框 |
| —    | **SEMANTIC BLOCKS**（Phase 2）：callout（三角折角）→ table → blockquote → checkbox |
| —    | **UI CHROME**（Phase 3）：标签栏 → 文件树 → 设置页 → 状态栏 |
| —    | **SIGNATURE**（Phase 4）：氢视窗（空标签页几何构图）→ 区域撞色 |
| —    | **FINISH**（Phase 5）：移动端 → 打印 → 收尾 |

---

## 视觉品味（写/审样式时主动规避 AI 设计 tells）

沿用 Folio AGENTS.md，H2 OS 适配版：

- **不用纯黑/纯白做大面积。** 用 Gray 900 `#18181B`、Gray 50 `#FAFAFA` 这类带微调的中性色（主文档色板已如此）。
- **强调色克制：降饱和一加红，且只做点缀。** 禁 "AI 紫 / 霓虹蓝" 发光渐变。普通链接、heading、正文一律灰阶。
- **层级靠字重 + 字号，不靠颜色。** Heading 不参与撞色（红色只留给交互元素）。
- **阴影要么不用，要么极轻**（`--h2-shadow-*` token 已压到最重 `0 8px 24px rgba(0,0,0,0.08)`）。显脏就清 token 退回。
- **动画只动 transform 和 opacity**，绝不动 layout 属性（重排掉帧）。
- **色板走 token，别在组件里散写魔法色值。** 改色只动 `--h2-*`，Obsidian 原生变量层自动跟。
- **间距落在 4px 网格**，禁止孤儿值。这是现代感的来源。
- **v1.3 纸感材质层（作者拍板激进重塑）**：中性灰阶从 zinc 换 stone 暖灰系；全局 feTurbulence 噪点覆盖层（2% 级、fixed、pointer-events:none、打印隐藏）；阴影 token 统一暖黑 rgba(28,25,23,…)。目标是"白纸读成高级印刷纸"。
- **签名构造线 v1.3 地平线化**：横线两端 15% 消隐 + 整体 0.55 透明度，从"横梁"退为"地平线"；新增 active tab 短红游标（28×2 背景画法，句读级红导航例外同族）。空状态氢徽纪念碑化（340×360 + 层间投影 + 蓝图网格 + 桌面端操作 hover 浮现）。（v1.3.1：横线上移 8px 贴住 tab 栏下沿并与红游标相接；竖线同款消隐；噪点 0.06；氢徽方圆降 200/300 档；蓝图网格 5%）（v1.3.2：游标改 28×4 骑跨地平线（后被 v1.3.3 红环取代）；网格 64px 稀疏化 + mask 收紧；氢徽 idle 呼吸 h2-float 6s/4.5s 错频；图片 hairline 收边归入"方"；非 active tab hover 灰底 pill）（v1.3.3：横线 -8px 收回、线回原位与悬浮带保持距离；红游标退役——"线与 pill 间夹游离零件"两版均败）（v1.3.4：pill 红环试过即退役（作者否掉），active tab 定稿为灰底 + 红字渐隐渐变（background-clip:text，Red 600 起 → Red 500 → 末端 62% 隐，面积只限文字）；设置页左栏选中项 Gray-100 → 0.08 暖灰 tint 增强可辨度；左栏选中项字重 500→600（PingFang 上 500 肉眼无差）+ title 套同款红字渐隐渐变）（v1.3.5：红字渐隐渐变推广到文件树/大纲 active 项文字——1.13.7 起大纲并入 tree 组件，`.outline-item` 已失效，主题里仅留作旧版本兜底）

---

## 提交前

- `manifest.json` 的 `version` 是否需要 bump。
- 是否改到无关区段。
- hairline 一致性、4px 网格、字重层级是否失守（直角路线零容忍）。
- **如果要发版**：bump version 后打 tag（无 v 前缀，== version）并 `git push origin main --tags`，workflow 自动接管（见下）。

### 版本号升哪一位（作者裁决，2026-07-12）

- **patch（x.y.Z）**：默认档。bug 修复、视觉调优（密度/颜色/间距/单组件重画）、覆盖缺口补齐。
- **minor（x.Y.0）**：设计语言层面的新增或改变——新的签名元素、新的交互范式、空间结构重设计（如连续画布这种量级）。
- **major（X.0.0）**：只在作者明确拍板时用。
- **拿不准就 patch**；升 minor/major 前先问作者。教训：1.2.0 实际内容是表格调优 + tag 重画 + 链接 bug 修，本应是 1.1.1。

> ⚠️ **别被 `versions.json` 误导。** 主题（theme）根本不读它——那是插件概念。留着无害，但**不要**把"同步 versions.json"当成发版必做项。

---

## 🚨 红线：发版必须合规，否则会被踢出主题市场索引

> 这条是 Folio 用被 de-index 的代价换来的教训。H2 OS 从第一个 release 开始就要守。

**这是运营铁律，比任何代码改动都重要：**

- 主题进了官方索引（`community-css-themes.json`）后，每次发版合规就能近乎实时跟进。
- **一旦发出一个不合规 release，会被官方直接剔除索引**，app 内立刻搜不到，只能等周期性扫描重新收录。
- 所以：**宁可慢，不可错。**

**"合规" = 每次发版都满足：**
1. release 的 tag **精确等于** manifest 的 `version`，**绝不带 `v` 前缀**。
2. tag 指向的 commit 的 manifest `name` 必须是 `"H2 OS"`、必填字段齐。
3. release 挂全资产（至少 `theme.css` + `manifest.json`）。
4. release 标为 **Latest**、非 draft。
5. `theme.css` 不引用外部网络资源 / 远程字体（审核硬性要求）。

**发完 30 秒强制自检（缺一不可）：**
```bash
gh api repos/elijah7x/theme-h2os/releases/latest --jq '.tag_name'  # == manifest version，无 v
gh release view <版本> --json assets --jq '.assets[].name'                          # theme.css / manifest.json 在
gh api repos/elijah7x/theme-h2os/releases --jq '.[]|select(.tag_name=="<版本>")|.draft'  # 必须 false
```
> 坑：`gh release create` 传大图可能客户端超时，把 release 卡在 draft 态。若自检发现 `draft=true`，用 `gh release edit <版本> --draft=false --latest` 转正。

---

## 发版流程（tag 触发，单分支，GitHub Action 自动发 release）

**单分支架构**：所有开发在 main 上。发版由 `.github/workflows/release.yml` 自动化——校验合规、打包白名单资产、发 release、自检。红线全部作为显式校验步骤硬编码——任一不符直接 fail，发不出不合规的 release。

### 日常发版（你的全部操作）

```bash
# 在 main 上：
# 1. 改 theme.css
# 2. bump manifest.json 的 version
# 3. commit + 打 tag（tag 必须无 v 前缀，必须 == version）+ 一条命令推送：
git add -A
git commit -m "vX.Y.Z: <改动摘要>"
git tag X.Y.Z
git push origin main --tags
# 完成。workflow 接管，约 1 分钟后 release 上线。
```

### workflow 做了什么（无需你管，但要知道）

1. **校验红线**：tag 无 `v`、tag == manifest version、manifest name == "H2 OS"、theme.css 无外部资源、必备文件齐全。任一不过 → fail。
2. **建 release**：`--latest`，非 draft，挂白名单资产（theme.css / manifest.json / README×2 / 截图）。开发文件（AGENTS.md / .github / .opencode）留在仓库但不进资产。
3. **自检**：latest tag == 推送 tag、theme.css + manifest.json 在、draft=false。任一不符 → fail。

### 仍需人工把关的（workflow 管不到的）

- **release notes 内容**：workflow 从 commit 历史生成。要精心写 changelog，在 commit message body 写清楚。
- **视觉验证**：workflow 不看截图，发版前必须肉眼验过。
- **Obsidian 市场确认**：发版成功后，回 Obsidian 点"检查更新"确认不报错。

### 手动发版（仅当 workflow 故障时的应急）

正常情况下**永远不要**手动发版。仅当 workflow 本身坏了：

```bash
# 应急流程（在 main 上）：
# 1. 确保 manifest version 已 bump、name 是 H2 OS
# 2. gh release create <version> --latest --title <version> theme.css manifest.json ...
# 3. 立刻修 workflow，避免下次又得手动
```
