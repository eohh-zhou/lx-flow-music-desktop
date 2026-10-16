# Bilibili 推荐歌单调研

调研日期：2026-10-15。目标是在软件中直接浏览 B 站歌单卡片，点开播放或收藏，不再依赖用户寻找、粘贴链接。热门/最新合集、分类、换一批及可选 AI 推荐已经接入当前源码，使用说明见 [Bilibili 歌单](bilibili-playlists.md)。以下保留调研依据与设计选择。

## 可以参考的开源项目

| 项目 | 源码中的实际能力 | 对本项目的参考价值 |
| --- | --- | --- |
| [Listen 1](https://github.com/listen1/listen1_chrome_extension/blob/master/js/provider/bilibili.js) | `show_playlist` 拉取音频区热门歌单，`bi_get_playlist` 拉取歌单信息和歌曲；音频区歌曲与视频分 P 分别处理 | 最直接的“显示歌单封面 → 打开歌单 → 播放”参考。热门歌单接口能用，但本次返回的内容较少、较旧 |
| [NaivG/bilimusic](https://github.com/NaivG/bilimusic/blob/main/lib/features/home/logic/recommendation_manager.dart) | 音乐分区推荐；基于最近播放的 5 个视频请求相关推荐，过滤音乐内容、去重，最多保留 20 首；缓存推荐结果 | 可以参考按需刷新、缓存和以后基于听歌历史的推荐。其接口主要返回单曲视频，不能直接当作外部歌单目录 |
| [Jmiao11/bili-music](https://github.com/Jmiao11/bili-music) | 根据收藏、歌单、听歌历史生成检索意图，再对真实搜索结果排序；推荐需要配置 AI 服务 | 可以参考用户偏好和真实结果相结合的思路。本项目第一版可以用分类与热度实现，无需引入 AI 服务 |
| [music-lib 的 Bilibili 模块](https://github.com/guohuiyuan/music-lib/blob/main/bilibili/playlist.go) | `SearchPlaylist` 先搜索视频，再查视频详情，把 `ugc_season` 合集和多 P 视频识别为歌单并去重 | 最适合参考“把 B 站视频内容整理成真正可展开的歌单”的处理方式。这是核心库，自身不提供播放器界面，也没有实现 B 站推荐歌单接口 |

以上结论根据对应源码确定，不把整个播放器的其他平台功能算作 Bilibili 已有功能。方案参考接口和数据结构，未复制这些项目的代码。

## 公开接口实测

请求使用浏览器 User-Agent 和 Bilibili Referer，没有提供账号 Cookie。这里记录单次调研的结果，不代表接口的长期可用性。

| 接口 | 本次结果 | 用途判断 |
| --- | --- | --- |
| `/audio/music-service-c/web/menu/hit?ps=20&pn=1` | `code=0`，`totalSize=11` | 可展示音频区热门歌单，适合作为补充入口 |
| `/audio/music-service-c/web/menu/info?sid=10624` | `code=0`，名称“新曲推荐” | 可取得音频歌单详情 |
| `/audio/music-service-c/web/song/of-menu?pn=1&ps=100&sid=10624` | `code=0`，16 首，最大 `passtime` 为 2022-04-14 | 该样本内容偏旧，不适合作为发现页的主要新内容来源 |
| `/audio/music-service-c/web/url?sid=2478206` | `code=0`，返回音频 CDN 地址 | 音频区需要单独适配 `au` 歌曲和 `am` 歌单；本次没有实际播放该音频 |
| `/x/web-interface/region/feed/rcmd`，`from_region=1003` | `code=0`，按请求返回 5 条视频 | 可以提供音乐视频推荐；还需要识别其中的合集，不能直接视为 5 个歌单 |
| `/x/web-interface/ranking/v2?rid=1003&type=all` | `code=-352` | 本环境请求受到风控，不作为首版必需的数据源 |
| `/x/web-interface/search/type`，`search_type=video`，关键词“音乐 合集”，`order=click` | `code=0`，返回真实 BV 号及封面、作者、热度等信息 | 可作为热门音乐合集的候选来源 |
| `/x/web-interface/view?bvid=BV1BDk2YCEHF` | `code=0`，150 个分 P | 确认搜索结果能识别为可逐曲展开的歌单，现有分 P 播放链路可复用 |

给搜索附加 `tids=3` 的一次请求返回 HTTP 412，附加 `tids=1003` 的一次请求返回空结果。推荐接口和搜索接口的分区参数不能直接通用；接入时应分别验证，不能只复制其他项目中的分区数字。

## 适合当前桌面版的接入方案

第一版提供“热门音乐合集”和风格分类，如华语、日语、古风、纯音乐、学习、睡前。分类对应检索主题，热度排序用于发现已有内容；页面明确称为“热门合集”，不声称是 B 站账号的个性化日推。

处理流程：

1. 用户进入“歌单 → 哔哩哔哩”，或切换分类、点击“换一批”时，获取一页候选视频。
2. 限制并发查询候选详情，只保留多个分 P 的视频，或包含多集的 UP 主合集。失效内容跳过；整个请求被限流时给出提示并允许手动重试。
3. 多 P 使用现有的 `video:BV号`，UP 合集使用现有的 `season:用户ID:合集ID`。按最终歌单 ID 去重，避免同一合集因为命中不同视频重复出现。
4. 卡片显示封面、名称、UP 主、曲目数和热度。点开沿用现有歌单详情、播放、收藏及本地刷新流程。
5. B 站视频搜索的总数包含单 P 等被过滤内容，不能直接显示成“歌单总数”。发现页优先使用“换一批”，避免展示不准确的歌单页数。

音频区的 11 个热门歌单可以后续独立增加“音频歌单”入口。这需要补充 `am`/`au` 的解析、歌曲类型和播放接口，不能直接当作现有 BV 视频处理。

## 在当前代码中的位置

- `src/renderer/utils/musicSdk/bili/discovery.js`：实现按需检索、游客身份、两路并发、分 P/合集识别、去重及有上限的缓存。
- `src/renderer/store/songList/state.ts`：Bilibili 加入可浏览的歌单来源；其余搜索类型继续根据能力过滤。
- `src/renderer/views/songList/List/components/BilibiliDiscovery.vue`：复用现有卡片，提供分类、“换一批”和手动 AI 推荐；离开页面取消在途请求。
- `src/renderer/views/songList/List/components/OpenListModal.vue`：可浏览来源包含 Bilibili 后，导入下拉框按来源去重。
- `src/renderer/store/songList/action.ts`：过期的其他来源请求失败时不覆盖新页面。
- `src/main/modules/winMain/rendererEvent/aiRecommendation.ts`：本机配置与加密 Key、Chat Completions 请求、超时取消和真实候选 ID 校验。

## 后台占用控制

推荐功能按页面操作发请求，不添加后台定时刷新、常驻服务或额外进程。建议首版每次搜索最多取 20 个候选，详情请求最多 2 个并发；页面结果缓存 10 分钟，最多保留 12 组分类结果，过期采用访问时淘汰，无需定时器。

封面沿用懒加载。推荐页只获取元数据，播放时才请求音频地址，不预加载整首音频。打开推荐页会增加网络请求和封面内存；空闲时无需持续推荐计算。具体内存和 CPU 增量仍需在接入后实测。
