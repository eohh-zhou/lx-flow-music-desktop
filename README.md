<p align="center"><a href="https://github.com/eohh-zhou/lx-flow-music-desktop"><img width="200" src="./doc/images/icon.png" alt="LX Flow Music logo"></a></p>

<h1 align="center">LX Flow Music</h1>

<p align="center">
  <a href="https://github.com/eohh-zhou/lx-flow-music-desktop/releases"><img src="https://img.shields.io/github/release/eohh-zhou/lx-flow-music-desktop" alt="Release version"></a>
  <a href="https://github.com/eohh-zhou/lx-flow-music-desktop/actions/workflows/release.yml"><img src="https://github.com/eohh-zhou/lx-flow-music-desktop/actions/workflows/release.yml/badge.svg" alt="Build status"></a>
</p>

<p align="center">基于 LX Music Desktop 的个人使用修改版，当前最新版本为 3.2.1。支持 LX个性化推荐、AI推荐、Bilibili 音乐，以及企鹅音乐与网易云音乐的账号推荐和歌单联动。</p>

## v3.2.1 更新亮点

- **侧栏一键收起**：点击顶部返回按钮左边的开关，为歌曲列表腾出更多空间；下次启动会记住展开或收起状态。
- **推荐结果完整展示**：LX推荐和 AI推荐改为一首一行，本次推荐一次列出，移除「换一批」。
- **AI推荐更贴合需求**：结合多个搜索方向筛选真实歌曲，加强重复、已有歌曲和不符合需求结果的过滤。
- **减少额外内存占用**：精简歌单封面和推荐所需的数据读取，限制浏览与音效缓存增长，窗口隐藏时暂停频谱绘制。

查看[完整更新公告](https://github.com/eohh-zhou/lx-flow-music-desktop/releases/tag/v3.2.1)。

## 个人使用版说明

这是我基于 [LX Music Desktop](https://github.com/lyswhut/lx-music-desktop) 修改维护的个人使用版，并非原项目官方发行版。原项目的版权、许可和署名均保留在本仓库中；本项目同样遵循 Apache License 2.0。

原项目：<https://github.com/lyswhut/lx-music-desktop>

## 我增加和调整的功能

### 为你推荐

- LX推荐以「我的列表」歌单为基础，逐步结合近期完播、反复播放、实际收听时长和主动跳过记录，推荐歌单里没有的单曲。
- 可选择曲库范围、探索程度和参考歌单，支持不感兴趣反馈；每首参考歌曲在一次推荐的完整结果中最多带出两首，兼顾不同歌手和专辑。
- AI推荐可配置兼容模型接口，先规划多个搜索方向，再从真实曲库候选中筛选与排序；候选不足时适量补充检索，避免用不符合需求的歌曲凑数。可自行选择是否使用个人听歌偏好。
- 两种推荐均以单列歌曲列表展示本次全部合格结果，支持直接播放、加入歌单和不感兴趣反馈。
- 收听统计保存在本机；LX推荐不调用模型 API，AI推荐仅在手动生成时调用，打开页面和切换平台读取缓存。

### Bilibili 音乐

- 支持导入公开收藏夹、合集、系列与分 P 视频歌单，以及浏览热门和最新音乐合集。
- 内置 Bilibili 音频播放，并提供歌曲艺术家识别和歌词匹配。
- 企鹅音乐、网易云和 bili 音乐的平台推荐统一收纳在侧栏「音乐推荐」中。

### 企鹅音乐

- 左侧导航可直接进入企鹅音乐推荐，不必再翻到深层歌单页。
- 账号视图包含主页推荐、我的歌单、雷达推荐、推荐歌单、推荐新歌；「我的歌单」可浏览账号创建和收藏的歌单并在应用内播放。
- 独立企鹅音乐设置页：用登录窗口获取登录状态，不必手动粘贴 Cookie；登录信息只保存在本机。
- 「我的列表」右键「同步到企鹅音乐」，预览匹配结果后会复用已有同名歌单、补充缺少的歌曲；没有同名歌单时新建，不会删除已有歌曲或歌单。

### 网易云音乐

- 登录后可浏览账号创建和收藏的歌单。
- 支持每日推荐、私人 FM、推荐歌单、推荐新歌；当前播放歌曲会在列表和歌单封面显示节奏条，悬停可暂停或继续。
- 本地歌单可匹配后增量同步到网易云音乐，保留现有歌曲并按本地顺序排列。

### 界面与播放

- 左侧导航栏支持一键收起和展开，并记住上次状态；收起后搜索、设置及窗口控制按钮仍可使用。
- 工具栏换肤按钮可立即切换当前皮肤，点哪个就用哪个；皮肤弹窗可单独调整左侧栏透明度、右侧栏透明度，以及左侧栏、右侧栏各自的毛玻璃强度。
- 提供多套纯色主题，以及雨天、黄昏海、极光、山湖、手绘原野、乡云等图片主题；壁纸会透过侧栏和列表，并保留可读的半透明底与较轻的毛玻璃。
- 搜索支持歌曲、歌单、歌手、专辑；可打开歌手详情查看歌曲和专辑。
- 播放栏提供六种进度条样式，默认接近网易云：圆形封面、居中控制按钮、全宽顶边进度条。
- 桌面歌词改为接近网易云的单行条：每次打开都在桌面顶部水平居中；悬停显示工具栏；贴到屏幕顶部时工具栏会移到歌词下方。
- 基本设置可选择字体和字号；窗口最小化、最大化、关闭按钮改为圆角矩形。
- Windows Setup 安装版可通过 GitHub Releases 在软件内检查、下载和安装后续更新。

### 运行与资源占用

- 歌单封面按需读取，侧栏收起或窗口隐藏时暂停后续封面加载。
- 推荐只读取歌曲身份与偏好所需的信息，继续完整排除「我的列表」里已有的歌曲。
- 在线歌单、排行榜、歌手资料及混响音效使用有上限的缓存，减少长时间浏览与切换音效带来的额外内存积累。
- 频谱在暂停、停止播放或窗口隐藏时停止绘制，恢复显示后随播放状态继续。

## 下载与更新

请从 [GitHub Releases](https://github.com/eohh-zhou/lx-flow-music-desktop/releases) 下载 Windows x64 版本。当前发布版本：[v3.2.1](https://github.com/eohh-zhou/lx-flow-music-desktop/releases/tag/v3.2.1)。

| 包类型 | 文件名示例 | 适用场景 |
| --- | --- | --- |
| Setup 安装版 | `LXFlowMusic-v3.2.1-x64-Setup.exe` | 推荐。安装后可在软件内完成后续更新。 |
| 绿色免安装版 | `LXFlowMusic-v3.2.1-win_x64-green.7z` | 解压后直接运行 `LXFlowMusic.exe`。不支持自动安装更新。 |

从绿色版迁移到支持自动更新的版本时，只需安装一次 Setup 安装版。

## 用户界面

<p><img width="100%" src="./doc/images/app.png" alt="LX Flow Music 界面预览"></p>
