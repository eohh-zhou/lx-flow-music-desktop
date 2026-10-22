import type { Message } from '@root/lang'

type MessageKey = keyof Message

export const settingCategories = [
  { id: 'SettingBasic', targetId: 'basic', titleKey: 'setting__basic' },
  { id: 'SettingPlay', targetId: 'play', titleKey: 'setting__play' },
  { id: 'SettingPlayDetail', targetId: 'play_detail', titleKey: 'setting__play_detail' },
  { id: 'SettingDesktopLyric', targetId: 'desktop_lyric', titleKey: 'setting__desktop_lyric' },
  { id: 'SettingSearch', targetId: 'search', titleKey: 'setting__search' },
  { id: 'SettingList', targetId: 'list', titleKey: 'setting__list' },
  { id: 'SettingDownload', targetId: 'download', titleKey: 'setting__download' },
  { id: 'SettingHotKey', targetId: 'hot_key', titleKey: 'setting__hot_key' },
  { id: 'SettingSync', targetId: 'sync', titleKey: 'setting__sync' },
  { id: 'SettingOpenAPI', targetId: 'sync', titleKey: 'setting__open_api' },
  { id: 'SettingNetwork', targetId: 'network', titleKey: 'setting__network' },
  { id: 'SettingOdc', targetId: 'odc', titleKey: 'setting__odc' },
  { id: 'SettingBackup', targetId: 'backup', titleKey: 'setting__backup' },
  { id: 'SettingQQMusic', targetId: 'qq_music', titleKey: 'qq_music_setting' },
  { id: 'SettingNeteaseMusic', targetId: 'netease_music', titleKey: 'netease_music_setting' },
  { id: 'SettingOther', targetId: 'other', titleKey: 'setting__other' },
  { id: 'SettingUpdate', targetId: 'update', titleKey: 'setting__update' },
  { id: 'SettingAbout', targetId: 'about', titleKey: 'setting__about' },
] as const

export type SettingCategory = (typeof settingCategories)[number]['id']

// Targets are existing headings or controls; searching never mounts inactive settings.
// Keep aliases for common names that differ from the displayed setting label.
const settingItems: Record<SettingCategory, Array<[string, MessageKey, string?]>> = {
  SettingBasic: [
    ['setting_show_animate', 'setting__basic_show_animation'],
    ['setting_animate', 'setting__basic_animation'],
    ['setting_start_in_fullscreen', 'setting__basic_start_in_fullscreen'],
    ['setting_to_tray', 'setting__basic_to_tray', '托盘 托盤 最小化 关闭 關閉 退出 tray close exit'],
    ['basic_play_timeout', 'setting__play_timeout', '睡眠 定时 定時 计时 計時 自动停止 自動停止 sleep timer'],
    ['basic_theme', 'setting__basic_theme', '皮肤 皮膚 换肤 換膚 壁纸 桌布 背景 深色 浅色 暗色 theme skin wallpaper dark light'],
    ['basic_source', 'setting__basic_source', '音源 插件 导入 导入源 導入 source plugin api js'],
    ['basic_window_size', 'setting__basic_window_size'],
    ['basic_font', 'setting__basic_font', '字号 字號 字体 字體 大小 font size'],
    ['basic_lang', 'setting__basic_lang', '语言 語言 language locale english 中文'],
    ['basic_sourcename', 'setting__basic_sourcename', '别名 別名 原名 平台 名称 名稱 alias'],
    ['basic_control_btn_position', 'setting__basic_control_btn_position', '窗口 按钮 按鈕 左右 关闭 關閉 minimize close'],
    ['basic_playbar_progress_style', 'setting__basic_playbar_progress_style', '播放栏 播放欄 进度条 進度條 progress bar'],
  ],
  SettingPlay: [
    ['setting_player_startup_auto_play', 'setting__play_startup_auto_play'],
    ['setting_player_power_save_blocker', 'setting__play_power_save_blocker', '休眠 睡眠 锁屏 鎖屏 防止 sleep'],
    ['setting_player_save_play_time', 'setting__play_save_play_time', '记忆 記憶 进度 進度 断点 斷點 resume'],
    ['setting_player_auto_clean_played_list', 'setting__play_auto_clean_played_list'],
    ['setting_player_lyric_transition', 'setting__play_lyric_transition', '歌词翻译 歌詞翻譯 translation'],
    ['setting_player_lyric_roma', 'setting__play_lyric_roma', '罗马音 羅馬音 拼音 romanization'],
    ['setting_player_awap_lyric_trans_roma', 'setting__player_swap_lyric_trans_roma'],
    ['setting_player_auto_skip_on_error', 'setting__play_auto_skip_on_error'],
    ['setting_player_lyric_s2t', 'setting__play_lyric_s2t'],
    ['setting_player_lyric_play_lxlrc', 'setting__play_lyric_lxlrc', '逐字歌词 逐字歌詞 卡拉OK karaoke lxlrc'],
    ['setting_player_showTaskProgess', 'setting__play_task_bar'],
    ['setting_player_showStatusBarLyric', 'setting__play_statusbar_lyric'],
    ['setting_player_isMaxOutputChannelCount', 'setting__play_max_output_channel_count'],
    ['setting_player_isMediaDeviceRemovedStopPlay', 'setting__play_mediaDevice_remove_stop_play'],
    ['basic_play_quality', 'setting__play_playQuality', '音质 音質 无损 無損 高品质 高品質 flac 320k 128k quality bitrate'],
    ['play_mediaDevice', 'setting__play_mediaDevice', '声卡 聲卡 耳机 耳機 扬声器 揚聲器 音频输出 音訊輸出 output speaker headphones'],
  ],
  SettingPlayDetail: [
    ['setting_play_detail_font_zoom_enable', 'setting__play_detail_font_zoom'],
    ['setting_play_detail_lyric_delayScroll', 'setting__play_detail_lyric_delay_scroll'],
    ['setting_play_detail_lyric_progress_enable', 'setting__play_detail_lyric_progress'],
    ['play_detail_align', 'setting__play_detail_align'],
  ],
  SettingDesktopLyric: [
    ['setting_desktop_lyric_enable', 'setting__desktop_lyric_enable'],
    ['setting_desktop_lyric_lock', 'setting__desktop_lyric_lock'],
    ['setting_desktop_lyric_fullscreen_hide', 'setting__desktop_lyric_fullscreen_hide'],
    ['setting_desktop_lyric_pause_hide', 'setting__desktop_lyric_pause_hide'],
    ['setting_desktop_lyric_audio_visualization', 'setting__desktop_lyric_audio_visualization', '频谱 頻譜 音频可视化 音訊視覺化 spectrum visualizer'],
    ['setting_desktop_lyric_delayScroll', 'setting__desktop_lyric_delay_scroll'],
    ['setting_desktop_lyric_alwaysOnTop', 'setting__desktop_lyric_always_on_top'],
    ['setting_desktop_lyric_showTaskbar', 'setting__desktop_lyric_show_taskbar'],
    ['setting_desktop_lyric_alwaysOnTopLoop', 'setting__desktop_lyric_always_on_top_loop'],
    ['setting_desktop_lyric_lockScreen', 'setting__desktop_lyric_lock_screen'],
    ['setting_desktop_lyric_hoverHide', 'setting__desktop_lyric_hover_hide', '鼠标穿透 滑鼠穿透 悬停 懸停 hover opacity'],
    ['setting_desktop_lyric_ellipsis', 'setting__desktop_lyric_ellipsis'],
    ['setting_desktop_lyric_zoom', 'desktop_lyric__lrc_active_zoom_on'],
    ['setting__desktop_lyric_font_weight', 'setting__desktop_lyric_font_weight'],
    ['desktop_lyric_shape', 'setting__desktop_lyric_shape', '单行 單行 多行 multi single line'],
    ['desktop_lyric_scroll_align', 'setting__desktop_lyric_scroll_align'],
    ['desktop_lyric_align', 'setting__desktop_lyric_align'],
    ['desktop_lyric_line_gap', 'setting__desktop_lyric_line_gap'],
    ['desktop_lyric_color', 'setting__desktop_lyric_color', '已播放 未播放 阴影 陰影 颜色 顏色 color shadow'],
    ['desktop_lyric_font', 'setting__desktop_lyric_font', '字体 字體 字号 字號 font'],
    ['desktop_lyric_reset', 'setting__desktop_lyric_reset'],
  ],
  SettingSearch: [
    ['setting_search_showHot_enable', 'setting__search_hot', '热搜 熱搜 hot search'],
    ['setting_search_showHistory_enable', 'setting__search_history', '历史 歷史 搜索记录 搜尋記錄 search history'],
    ['setting_search_focusSearchBox_enable', 'setting__search_focus_search_box'],
  ],
  SettingList: [
    ['setting_list_actionButtonsVisible_enable', 'setting__list_action_btn'],
    ['setting_list_showSource_enable', 'setting__list_source'],
    ['setting_list_scroll_enable', 'setting__list_scroll'],
    ['setting_list_clickAction_enable', 'setting__list_click_action'],
    ['list_addMusicLocationType', 'setting__list_add_music_location_type'],
  ],
  SettingDownload: [
    ['setting_download_enable', 'setting__download_enable'],
    ['setting_download_skip_exist_file', 'setting__download_skip_exist_file'],
    ['setting_download_save_group_list_name', 'setting_download_save_group_list_name'],
    ['download_path', 'setting__download_path', '保存位置 下载目录 下載目錄 文件夹 資料夾 folder path directory'],
    ['download_max_num', 'setting__download_max_num', '并发 並發 线程 線程 concurrent'],
    ['download_use_other_source', 'setting__download_use_other_source'],
    ['download_name', 'setting__download_name', '文件名 檔名 命名 filename template'],
    ['download_data_embed', 'setting__download_data_embed', '标签 標籤 封面 歌词 歌詞 id3 tag metadata cover'],
    ['download_lyric', 'setting__download_lyric'],
    ['download_lyric_format', 'setting__download_lyric_format', '歌词格式 歌詞格式 lrc utf8 gbk encoding'],
  ],
  SettingHotKey: [
    ['hot_key_local_title', 'setting__hot_key_local_title', '键盘 鍵盤 快捷键 快捷鍵 shortcut hotkey keyboard'],
    ['hot_key_global_title', 'setting__hot_key_global_title', '后台 背景 全局 全域 shortcut hotkey global'],
  ],
  SettingSync: [
    ['setting_sync_enable', 'setting__sync_enable'],
    ['sync_mode', 'setting__sync_mode', '手机 手機 设备 裝置 局域网 區域網 服务器 伺服器 客户端 用戶端 地址 密码 密碼 sync server client'],
  ],
  SettingOpenAPI: [
    ['setting_open_api_enable', 'setting__open_api_enable'],
    ['setting_open_api_bind_lan', 'setting__open_api_bind_lan'],
    ['open_api_port', 'setting__open_api_port', '端口 連接埠 port'],
  ],
  SettingNetwork: [
    ['network_proxy_title', 'setting__network_proxy_title', '代理 网络 網路 主机 主機 端口 連接埠 proxy host port http'],
  ],
  SettingOdc: [
    ['setting_odc_isAutoClearSearchInput', 'setting__odc_clear_search_input'],
    ['setting_odc_isAutoClearSearchList', 'setting__odc_clear_search_list'],
  ],
  SettingBackup: [
    ['backup_part', 'setting__backup_part', '导入 導入 导出 匯出 备份 備份 恢复 還原 歌单 歌單 import export restore'],
    ['backup_all', 'setting__backup_all', '迁移 遷移 完整备份 完整備份 backup restore'],
    ['backup_other', 'setting__backup_other'],
  ],
  SettingQQMusic: [
    ['setting_qq_music_enabled', 'qq_music_enable'],
  ],
  SettingNeteaseMusic: [
    ['setting_netease_music_enabled', 'netease_music_enable'],
  ],
  SettingOther: [
    ['setting_transparent_window', 'setting__other_transparent_window'],
    ['other_tray_theme', 'setting__other_tray_theme'],
    ['other_resource_cache', 'setting__other_resource_cache', '缓存 快取 空间 空間 清理 cache storage clear'],
    ['other_other_source', 'setting__other_other_cache', '缓存 快取 歌曲链接 歌曲連結 原始歌词 原始歌詞 换源 換源 cache url lyrics'],
    ['other_dislike_list', 'setting__other_dislike_list', '黑名单 黑名單 不喜欢 不喜歡 不感兴趣 不感興趣 屏蔽 dislike blacklist'],
    ['other_lyric_edited', 'setting__other_lyric_edited_cache', '已编辑歌词 已編輯歌詞 清理 清除 cache lyrics'],
    ['other_listdata', 'setting__other_listdata', '清空 重置 歌单 歌單 reset clear'],
  ],
  SettingUpdate: [
    ['setting__update_tryAutoUpdate', 'setting__update_try_auto_update'],
    ['setting__update_showChangeLog', 'setting__update_show_change_log'],
  ],
  SettingAbout: [
  ],
}

const categoryAliases: Partial<Record<SettingCategory, string>> = {
  SettingDesktopLyric: '桌面歌词 桌面歌詞 desktop lyrics',
  SettingQQMusic: 'QQ 企鹅 企鵝 登录 登入 账号 帳號 cookie login account 推荐 推薦',
  SettingNeteaseMusic: '网易云 網易雲 登录 登入 账号 帳號 cookie login account 推荐 推薦',
  SettingUpdate: '检查更新 檢查更新 升级 升級 新版本 version update upgrade',
  SettingAbout: '版本 version author license',
}

export interface SettingSearchItem {
  id: string
  category: SettingCategory
  targetId: string
  title: string
  categoryTitle: string
  searchText: string
}

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
const shortTitle = (value: string) => value.split(/[（(]/)[0].trim()

export const createSettingSearchIndex = (
  translate: (key: MessageKey) => string,
  dictionaries: Array<Partial<Record<MessageKey, string>>>,
  platform: string,
): SettingSearchItem[] => settingCategories.flatMap(category => {
  const entries: Array<[string, MessageKey, string?]> = [
    [category.targetId, category.titleKey, categoryAliases[category.id]],
    ...settingItems[category.id],
  ]
  return entries.filter(([targetId]) => {
    if (targetId == 'setting_player_showStatusBarLyric') return platform == 'darwin'
    if (targetId == 'setting_desktop_lyric_hoverHide') return platform != 'linux'
    return true
  }).map(([targetId, titleKey, keywords]) => {
    const title = shortTitle(translate(titleKey))
    const categoryTitle = translate(category.titleKey)
    return {
      id: `${category.id}-${targetId}`,
      category: category.id,
      targetId,
      title,
      categoryTitle,
      searchText: normalize([
        translate(titleKey), categoryTitle, keywords ?? '',
        ...dictionaries.flatMap(dictionary => [dictionary[titleKey] ?? '', dictionary[category.titleKey] ?? '']),
      ].join(' ')),
    }
  })
})

export const searchSettings = (items: SettingSearchItem[], query: string): SettingSearchItem[] => {
  const text = normalize(query)
  if (!text) return []
  const terms = text.split(' ')
  return items.filter(item => terms.every(term => item.searchText.includes(term)))
    .map(item => {
      const title = normalize(item.title)
      const score = title == text ? 100 : title.startsWith(text) ? 60 : title.includes(text) ? 40 : 0
      return { item, score: score + terms.filter(term => title.includes(term)).length * 10 }
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
}
