# GalNavi

GalNavi 是一款面向 Windows 10/11 x64 的本地 Galgame 攻略导航工具。它把粘贴或导入的纯文本攻略解析为带语义连接的流程图，并以路线图和带行号原文两种方式显示。路线图同时承担攻略浏览、路线选择和游玩推进。项目、人工修正和游玩进度均保存在本机，不需要账号、API Key 或网络服务。

当前版本：`0.1.0`。目前仅保留 NSIS 安装程序，没有 MSI。

## 功能

- 通过粘贴文字或上传 TXT 创建攻略项目，并支持打开、重命名和删除项目；
- 解析中、日、英混合的普通文本攻略；
- 识别章节、日期小节、步骤、选择组、SAVE、LOAD、条件和多类结局；
- 把 LOAD 解析为指向 SAVE 的引用连接，不让引用环影响主流程布局；
- 显示解析统计，以及可定位到原文行或图节点的警告与错误；警告可忽略到下次重新解析；
- 使用路线图和原文两种视图查看攻略，并直接在路线图中推进游玩；
- 修改节点类型、标题、详情、存档槽位、结局类型及连接类型；
- 创建或删除节点、拆分节点、合并相邻文本节点，创建或删除连接，手动绑定 LOAD/SAVE；
- 拖动节点时实时更新画面，松开鼠标后保存位置；
- 图编辑支持撤销和重做，包括拖动、自动布局、节点/连接编辑、忽略原文和重新解析；
- 按事件历史前进、选择分支和回退游玩进度；
- 普通窗口、始终置顶和精简窗口模式；
- 自动保存、备份恢复，以及经过 Zod 校验的 JSON 导入和导出；导出时可选择是否携带游玩进度。

## 安装和使用

### 安装

运行以下 NSIS 安装程序：

```text
src-tauri/target/release/bundle/nsis/GalNavi_0.1.0_x64-setup.exe
```

安装程序未进行商业代码签名。Windows SmartScreen 可能显示“未知发布者”，这是个人开发版本的预期行为。请只运行自己构建或从可信来源取得的安装程序。

GalNavi 使用系统 WebView2。安装程序配置为在目标电脑缺少 WebView2 Runtime 时下载微软 Bootstrapper。

### 创建攻略

1. 启动 GalNavi，点击左侧项目栏的“新建”；
2. 输入项目名称并粘贴纯文本攻略，或点击“上传 TXT”读取本地 `.txt` 文件；
3. 点击“创建项目”；
4. 查看顶部统计和右侧解析诊断；
5. 点击诊断可跳转到对应原文行，再按需要修正节点。

### 项目导入和导出

- 顶部“导入”读取 GalNavi 项目 JSON，其中包含攻略原文、路线图和项目数据；
- 顶部“导出”会询问是否携带游玩进度；选择携带时保留当前位置和历史，选择不携带时导出副本从 `root` 重新开始；
- 不携带进度只会清理导出副本，不会改变当前打开项目的本地进度；
- TXT 上传用于创建攻略，不等同于项目 JSON 导入。

### 跟踪进度

1. 在路线图中选中节点；
2. 在右侧点击“设为当前进度”；
3. 使用底部“完成并前进”推进；
4. 遇到多条可选连接时，在分支对话框中明确选择；
5. “上一步”按实际事件历史回退，不会根据图入边猜测路线。

### 路线图交互锁

路线图左下角控制栏中的锁是 React Flow 画布交互锁。锁定后不能选择、拖动或连接节点，游玩模式下点击节点也不会改变当前位置；画布平移、缩放、适应视图和 MiniMap 导航仍可使用。它不会锁定项目文件、禁止自动保存或锁定游玩进度，也不同于顶部的“窗口置顶”。切换回开锁图标即可恢复节点交互。

### 撤销图编辑

- 路线图右上角和节点属性栏都提供撤销、重做按钮；
- `Ctrl+Z` 撤销，`Ctrl+Y` 或 `Ctrl+Shift+Z` 重做；
- 在输入框内使用快捷键时仍由输入框处理文字撤销；
- 图编辑历史和游玩进度历史互相独立；
- 当前会话保留最近 100 个图编辑快照，切换项目后重新开始记录。

### 精简模式

点击顶部“精简模式”后，窗口会缩小并置顶。窗口标题区域用于拖动；右上角按钮恢复主窗口。精简模式主要支持窗口化和无边框窗口化游戏，不保证覆盖独占全屏窗口。

## 解析规则

解析流水线位于 `src/parser/`：

```text
原始文本
  → normalizeText
  → tokenizeLines
  → groupBlocks
  → inferStructure
  → buildGraph
  → resolveLoadReferences
  → validateGraph
```

解析时保留原始文本、行号、原始行和缩进信息。节点 ID 由稳定内容特征生成，不直接使用数组索引。

### 日期和章节

下列内容会识别为章节或日期标题，本身不会变成选项：

```text
1月1日
01月02日（周二）
二月十五日
十二月二十九日（周五）
1/3
第一章
第2章 相遇
序章
Chapter 3
```

`第一章`、`第2章 相遇`、`序章` 和 `Chapter 3` 会形成 `section` 节点。日期以及“第 X 幕”“第 X 冠”一类仅用于显示的标题会附加到后续步骤或章节的详情中，不一定单独形成节点。

两个或更多连续、同缩进的明确编号项会组成 `choice_group`；单独出现的编号项只会形成一个 `choice`：

```text
1月1日
1. 去车站
2. 留在家里
```

### SAVE/LOAD

支持 `SAVE 1`、`存档 1`、`セーブ 1`、`QS 1` 及对应的 LOAD/读档/ロード/QL 写法，也支持 `【SAVE 1】` 一类括号包裹格式。只有唯一 SAVE 候选时才自动创建 `load_reference`；缺失或歧义候选会生成诊断，不会随机绑定。有效 LOAD 不参与普通流程入口校验：校验器会检查唯一且同槽位的 `load_reference`，并确认它能投影为 `SAVE → LOAD → 后续分支`。引用有效时不会产生 `NO_ENTRY`；缺少引用、多个候选、无效目标或没有后续显示分支时会给出对应诊断。

### 完整标准文字攻略示例

下面的示例可以直接复制到“新建攻略项目”的文本框中。它集中展示了 GalNavi 可从纯文本识别的全部元素；实际编写时不必保留示例中的说明性名称，也不要求每份攻略都包含所有结局类型。

```text
# GalNavi 标准文字攻略示例
备注：编号选项需要连续书写；SAVE 与 LOAD 使用相同槽位编号。

序章
1月1日（周一）
阅读开场剧情并前往车站。
与站台上的少女交谈。
条件：完成序章后解锁共同路线。

SAVE 1
1. 接受少女的邀请
前往旧图书馆寻找第一条线索。
GOOD END「约定之日」

LOAD 1
2. 婉拒并独自调查
调查站台遗留的信件后直接回家。
错过关键线索，事件没有得到解决。
BAD END「擦肩而过」

二周目
第一章 再会
NOTE：二周目会从标题画面开始，已读文本可以跳过。
前提：已经完成任意一个结局。

【SAVE 2】
1. 告诉她全部真相
完成日常事件并观看章节尾声。
NORMAL END「平凡的明天」

【LOAD 2】
2. 暂时保守秘密
交出收集到的证据，但隐瞒最后一份记录。
进入地下资料室并阅读研究记录。
TRUE END「星空导航」

三周目
隐藏路线
要求：收集其他路线中的全部关键线索。

存档 3
1. 打开上锁的旧门
阅读隐藏档案，完成额外剧情。
【回忆结局】

无手动存档路线
1. 调查左侧壁画
2. 调查右侧石碑
```

上述文本与路线图元素的对应关系如下：

| 文本写法 | 解析结果 |
| --- | --- |
| `序章`、`第一章 再会`、`隐藏路线`、`二周目` | 章节或独立周目 `section` |
| 普通叙述行 | 操作步骤 `step` |
| 单独出现的 `1.` 或 `2.` 编号行 | 单个 `choice`，常用于 SAVE/LOAD 后指定本次应选分支 |
| 两个或更多连续、同缩进的编号行 | 一个 `choice_group` 及其中的多个 `choice`，适用于需要同时展示多个可选项的场景 |
| `条件：`、`前提：`、`要求：` | `condition` |
| `备注：`、`NOTE：` | `note` |
| `SAVE 1`、`【SAVE 2】`、`存档 3` | `save` |
| `LOAD 1`、`【LOAD 2】` | `load`，并按槽位连接对应 SAVE |
| `TRUE/GOOD/BAD/NORMAL END` | 带明确语义的 `ending` |
| `【回忆结局】` | 类型为 `unknown` 的普通结局 `ending` |

路线图的 `root` 由 GalNavi 自动创建，不应在攻略正文中手动添加。空行只用于提高原文可读性；形成选择组的编号项应保持连续并使用相同缩进。在典型回收流程中，应先在 SAVE 后写本次选择，结局后写 LOAD，再只写尚未回收的另一个选择；不要在 LOAD 后重复列出整个选项组。每个 LOAD 槽位最好只对应一个 SAVE，否则会产生歧义诊断。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面容器 | Tauri v2、Rust stable、系统 WebView2 |
| 前端 | React 19、TypeScript strict、Vite 8 |
| 样式与图标 | Tailwind CSS 4、Lucide React、项目内扁平桌面组件样式 |
| 流程图 | `@xyflow/react` 12 |
| 自动布局 | ELK / `elkjs`，按需动态加载 |
| 状态 | Zustand 5 |
| 数据校验 | Zod 4 |
| 测试 | Vitest 4、React Testing Library、jsdom |
| 安装包 | NSIS（通过 Tauri bundler） |

依赖的准确版本以 `package-lock.json` 和 `src-tauri/Cargo.lock` 为准。

## 项目架构

```text
GalNavi/
├─ src/
│  ├─ domain/          # 领域模型、Zod Schema、图校验、进度纯函数
│  ├─ parser/          # 文本规范化、分词、结构推断和建图
│  ├─ layout/          # ELK 分层布局适配
│  ├─ storage/         # 项目序列化和仓储接口
│  ├─ platform/        # Tauri 窗口和文件能力封装
│  ├─ stores/          # 项目列表、工作区、UI 状态
│  ├─ features/
│  │  ├─ projects/     # 项目列表
│  │  ├─ import/       # 新建与文本导入
│  │  ├─ graph/        # React Flow 路线图
│  │  ├─ source/       # 原文和诊断定位
│  │  ├─ editor/       # 节点、连接和撤销编辑
│  │  └─ mini-mode/    # 精简窗口
│  ├─ components/      # 顶栏、状态栏、对话框、错误边界
│  └─ App.tsx
├─ src-tauri/
│  ├─ capabilities/    # 最小窗口/对话框权限
│  ├─ icons/           # Windows 图标
│  ├─ src/lib.rs       # 原子保存、备份、导入导出命令
│  └─ tauri.conf.json  # Windows 与 NSIS 配置
├─ tests/              # 解析、图、进度、存储、UI、真实语料验收
├─ package.json
└─ README.md
```

底层攻略是带语义边的有向图。攻略节点不保存“当前”或“已完成”状态；这些状态由独立的 `PlaySession` 和 `ProgressEvent` 推导。

## 本地存储

桌面项目保存在 Tauri 的应用数据目录：

```text
%APPDATA%\com.galnavi.desktop\projects\<project-id>.json
```

保存流程为：写入 `.tmp`、同步到磁盘、把原文件轮换为 `.bak`、再替换正式文件。读取损坏项目时会尝试合法备份；单个损坏文件不会阻止其他项目启动。

窗口位置等轻量偏好由 WebView2 的本地存储保存。浏览器开发模式下，项目仓储也使用带 `galnavi.project.` 前缀的 `localStorage`。

清除本地数据前请退出 GalNavi，然后删除：

```text
%APPDATA%\com.galnavi.desktop
%LOCALAPPDATA%\com.galnavi.desktop
```

## 性能策略

- 路线图、步骤和原文视图通过 `React.lazy` 按需加载；
- ELK 仅在执行自动布局时动态加载，不常驻首次启动路径；
- React Flow 只渲染可见节点，LOAD 引用使用静态虚线而非持续动画；
- 拖动节点只更新前端局部状态，松开鼠标时才进行一次持久化；
- 原文行使用浏览器 `content-visibility` 跳过视口外布局；
- 主界面统计直接从已解析图推导，不在每次 React 渲染时重新解析完整攻略；
- 窗口位置写入采用 250ms 防抖。

## 开发

### 环境

- Windows 10/11 x64；
- Node.js 22 或兼容版本；
- npm；
- Rust stable `x86_64-pc-windows-msvc`；
- Visual Studio 2022 C++ Build Tools；
- WebView2 Runtime。

### 安装依赖

```powershell
npm install
```

### 前端开发

```powershell
npm run dev
```

### Tauri 开发

```powershell
npm run tauri -- dev
```

### 验证

```powershell
npm run typecheck
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

### 构建 NSIS 安装包

```powershell
npm run tauri -- build --bundles nsis
```

输出位置：

```text
src-tauri/target/release/galnavi.exe
src-tauri/target/release/bundle/nsis/GalNavi_<version>_x64-setup.exe
```

项目不会配置、下载或生成 MSI/WiX 产物。

## 安全和隐私

- 默认不发起攻略内容网络请求；
- 不执行 Shell 命令，不注入游戏进程，不读取游戏存档；
- 项目 JSON 的导入和导出必须由用户通过文件对话框明确选择；创建攻略时上传 TXT 也必须由用户主动选择文件；
- 项目 JSON 导入限制为 10 MB，并在进入状态前经过 Zod 校验；TXT 只作为新建项目的攻略原文读取，不作为项目数据执行；
- Tauri capability 只包含实际使用的窗口与文件对话框权限；
- 错误日志不输出完整攻略正文。

## 已知限制

- 规则解析无法保证理解所有自然语言格式，低置信度区块需要人工确认；
- 独占全屏游戏可能覆盖精简窗口；
- 当前没有云同步、登录、OCR、网页抓取、LLM、自动更新或全局快捷键；
- 安装程序未签名，Windows 可能显示 SmartScreen 提示；
- 图编辑撤销历史只保留在当前运行会话，不随项目文件永久保存。
