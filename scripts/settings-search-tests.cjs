const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const ts = require('typescript')

const root = path.join(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/renderer/views/Setting/searchIndex.ts'), 'utf8')
const moduleExports = {}
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: moduleExports })
const { createSettingSearchIndex, searchSettings, settingCategories } = moduleExports
const dictionaries = ['zh-cn', 'zh-tw', 'en-us'].map(locale => require(`../src/lang/${locale}.json`))
const index = (locale = 0, platform = 'win32') => createSettingSearchIndex(key => {
  assert.equal(typeof dictionaries[locale][key], 'string', `Missing translation: ${key}`)
  return dictionaries[locale][key]
}, dictionaries, platform)

test('Every indexed result has exactly one target in its settings component', () => {
  assert.equal(settingCategories.length, 18)
  const items = index(0, 'darwin')
  assert.equal(new Set(items.map(item => item.id)).size, items.length)
  for (const item of items) {
    const component = item.category === 'SettingSync' ? 'SettingSync/index' : item.category
    const content = fs.readFileSync(path.join(root, `src/renderer/views/Setting/components/${component}.vue`), 'utf8')
    const template = content.split('</template>')[0]
    const targets = template.match(new RegExp(`(?:#${item.targetId}(?![\\w-])|id="${item.targetId}")`, 'g')) || []
    assert.equal(targets.length, 1, `${item.category}: ${item.targetId}`)
  }
})

test('Simplified, traditional, English and common aliases work in every interface language', () => {
  for (const locale of [0, 1, 2]) {
    const items = index(locale)
    for (const query of ['音质', '無損', 'quality', 'ＦＬＡＣ']) {
      assert.ok(searchSettings(items, query).some(item => item.targetId === 'basic_play_quality'), query)
    }
    assert.ok(searchSettings(items, '黑名单').some(item => item.targetId === 'other_dislike_list'))
    assert.ok(searchSettings(items, '睡眠 定时').some(item => item.targetId === 'basic_play_timeout'))
    assert.ok(searchSettings(items, 'FONT').some(item => item.targetId === 'basic_font'))
    assert.ok(searchSettings(items, 'open api 端口').some(item => item.targetId === 'open_api_port'))
  }
})

test('Search combines keywords, normalizes whitespace and ranks exact titles first', () => {
  const items = index()
  const result = searchSettings(items, '  桌面\n 字体  ')
  assert.ok(result.length > 0)
  assert.ok(result.every(item => item.category === 'SettingDesktopLyric'))
  assert.ok(result.some(item => item.targetId === 'desktop_lyric_font'))
  const target = items.find(item => item.targetId === 'basic_play_quality')
  assert.equal(searchSettings(items, target.title)[0].id, target.id)
  assert.equal(searchSettings(items, '   ').length, 0)
  assert.equal(searchSettings(items, 'no-such-setting-12345').length, 0)
})

test('Search excludes controls unavailable on the current platform', () => {
  for (const platform of ['win32', 'linux', 'darwin']) {
    const ids = index(0, platform).map(item => item.targetId)
    assert.equal(ids.includes('setting_player_showStatusBarLyric'), platform === 'darwin')
    assert.equal(ids.includes('setting_desktop_lyric_hoverHide'), platform !== 'linux')
  }
})

function loadSettingsNavigation() {
  const history = { state: { back: null } }
  const navigation = { backCount: 0, replaced: null, afterEach: null }
  const exports = {}
  const routerSource = fs.readFileSync(path.join(root, 'src/renderer/router.ts'), 'utf8')
  vm.runInNewContext(ts.transpileModule(routerSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    require(name) {
      if (name !== 'vue-router') return { default: {} }
      return {
        createWebHashHistory: () => history,
        createRouter: options => ({
          options,
          afterEach: callback => { navigation.afterEach = callback },
          back: () => { navigation.backCount++ },
          replace: destination => { navigation.replaced = destination },
        }),
      }
    },
  })
  return { close: exports.closeSettings, navigation, history }
}

test('Closing settings returns to the previous music page with its query intact', () => {
  const { close, navigation, history } = loadSettingsNavigation()
  const destination = '/list?id=playlist-123'
  navigation.afterEach({ name: 'Setting' }, { name: 'List', fullPath: destination })
  history.state.back = destination
  close()
  assert.equal(navigation.backCount, 1)
  assert.equal(navigation.replaced, null)

  navigation.afterEach({ name: 'Setting' }, { name: 'Setting', fullPath: '/setting?name=SettingOther' })
  history.state.back = '/setting?name=SettingOther'
  close()
  assert.equal(navigation.replaced, destination, 'Changing settings routes does not trap the close action inside settings')
})

test('Opening directly into settings still has a safe return destination', () => {
  const { close, navigation } = loadSettingsNavigation()
  close()
  assert.equal(navigation.replaced, '/search')
  assert.equal(navigation.backCount, 0)
})
