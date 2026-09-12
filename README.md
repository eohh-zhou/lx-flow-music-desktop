<p align="center"><a href="https://github.com/eohh-zhou/lx-flow-music-desktop"><img width="200" src="./doc/images/icon.png" alt="LX Flow Music logo"></a></p>

<h1 align="center">LX Flow Music</h1>

<p align="center">
  <a href="https://github.com/eohh-zhou/lx-flow-music-desktop/releases"><img src="https://img.shields.io/github/release/eohh-zhou/lx-flow-music-desktop" alt="Release version"></a>
  <a href="https://github.com/eohh-zhou/lx-flow-music-desktop/actions/workflows/release.yml"><img src="https://github.com/eohh-zhou/lx-flow-music-desktop/actions/workflows/release.yml/badge.svg" alt="Build status"></a>
</p>

<p align="center">基于 LX Music Desktop 的个人使用修改版，当前最新版本为 3.0.5。专注于企鹅音乐与网易云音乐的账号推荐、歌单联动，以及更干净的桌面播放界面。</p>

## 个人使用版说明

这是我基于 [LX Music Desktop](https://github.com/lyswhut/lx-music-desktop) 修改维护的个人使用版，并非原项目官方发行版。原项目的版权、许可和署名均保留在本仓库中；本项目同样遵循 Apache License 2.0。

原项目：<https://github.com/lyswhut/lx-music-desktop>

## 我增加和调整的功能

### 企鹅音乐

- 左侧导航可直接进入企鹅音乐推荐，不必再翻到深层歌单页。
- 账号视图包含主页推荐、我的歌单、雷达推荐、推荐歌单、推荐新歌；「我的歌单」可浏览账号创建和收藏的歌单并在应用内播放。
- 独立企鹅音乐设置页：用登录窗口获取登录状态，不必手动粘贴 Cookie；登录信息只保存在本机。
- 「我的列表」右键「同步到企鹅音乐」，预览匹配结果后可新建企鹅音乐歌单，不会覆盖或删除已有歌单。

### 网易云音乐

- 登录后可浏览账号创建和收藏的歌单。
- 支持每日推荐、私人 FM、推荐歌单、推荐新歌。
- 本地歌单可匹配后增量同步到网易云音乐，保留现有歌曲并按本地顺序排列。

### 界面与播放

- 工具栏换肤按钮可立即切换当前皮肤，点哪个就用哪个。
- 提供多套纯色主题，以及雨天、黄昏海、极光、山湖、手绘原野、乡云等图片主题；壁纸会透过侧栏和列表，并保留可读的半透明底与较轻的毛玻璃。
- 播放栏改为接近网易云的布局：圆形封面、居中控制按钮、顶边进度条。
- Windows Setup 安装版可通过 GitHub Releases 在软件内检查、下载和安装后续更新。

## 下载与更新

请从 [GitHub Releases](https://github.com/eohh-zhou/lx-flow-music-desktop/releases) 下载 Windows x64 版本。当前发布版本：[v3.0.5](https://github.com/eohh-zhou/lx-flow-music-desktop/releases/tag/v3.0.5)。

| 包类型 | 文件名示例 | 适用场景 |
| --- | --- | --- |
| Setup 安装版 | `LXFlowMusic-v3.0.5-x64-Setup.exe` | 推荐。安装后可在软件内完成后续更新。 |
| 绿色免安装版 | `LXFlowMusic-v3.0.5-win_x64-green.7z` | 解压后直接运行 `LXFlowMusic.exe`。不支持自动安装更新。 |

从绿色版迁移到支持自动更新的版本时，只需安装一次 Setup 安装版。

## 用户界面

<p><img width="100%" src="./doc/images/app.png" alt="LX Flow Music 界面预览"></p>
