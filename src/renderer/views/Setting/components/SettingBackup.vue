<template lang="pug">
dt#backup {{ $t('setting__backup') }}
dd
  h3#backup_part {{ $t('setting__backup_part') }}
  div
    base-btn.btn.gap-left(min @click="handleImportPlayList") {{ $t('setting__backup_part_import_list') }}
    base-btn.btn.gap-left(min @click="handleExportPlayList") {{ $t('setting__backup_part_export_list') }}
    base-btn.btn.gap-left(min @click="handleImportSetting") {{ $t('setting__backup_part_import_setting') }}
    base-btn.btn.gap-left(min @click="handleExportSetting") {{ $t('setting__backup_part_export_setting') }}
dd
  h3#backup_all {{ $t('setting__backup_all') }}
  div
    base-btn.btn.gap-left(min @click="handleImportAllData") {{ $t('setting__backup_all_import') }}
    base-btn.btn.gap-left(min @click="handleExportAllData") {{ $t('setting__backup_all_export') }}
dd
  h3#backup_other {{ $t('setting__backup_other') }}
  div
    base-btn.btn.gap-left(min @click="handleExportPlayListToText") {{ $t('setting__backup_other_export_list_text') }}
    base-btn.btn.gap-left(min @click="handleExportPlayListToCsv") {{ $t('setting__backup_other_export_list_csv') }}
</template>

<script>
import { toRaw } from '@common/utils/vueTools'
// import { mergeSetting } from '@common/utils'
// import { base as eventBaseName } from '@renderer/event/names'
// import { defaultList, loveList, userLists } from '@renderer/core/share/list'
import {
  toNewMusicInfo,
  // toOldMusicInfo,
  filterMusicList,
  fixNewMusicInfoQuality,
} from '@renderer/utils'
import {
  showSelectDialog,
  openSaveDir,
  getUserApiList,
  getUserApiScript,
  importUserApi,
} from '@renderer/utils/ipc'
// import { currentStting } from '../setting'
import { dialog } from '@renderer/plugins/Dialog'
import useImportTip from '@renderer/utils/compositions/useImportTip'
import { useI18n } from '@renderer/plugins/i18n'
import { getListMusics, overwriteListFull, overwriteListMusics } from '@renderer/store/list/action'
import { LIST_IDS } from '@common/constants'
import { defaultList, loveList, userLists } from '@renderer/store/list/state'
import { userApi } from '@renderer/store'
import { appSetting, updateSetting } from '@renderer/store/setting'
import migrateSetting from '@common/utils/migrateSetting'


export default {
  name: 'SettingUpdate',
  setup() {
    const t = useI18n()
    // const setting = useRefGetter('setting')
    // const settingVersion = useRefGetter('settingVersion')
    // const setSettingVersion = useCommit('setSettingVersion')
    // const setList = useCommit('list', 'setList')
    const showImportTip = useImportTip()

    const showBackupError = (error) => {
      console.error(error)
      void dialog({
        message: t('setting__backup_error'),
        confirmButtonText: t('ok'),
      })
    }
    const runBackupTask = async(task) => {
      try {
        await task()
      } catch (error) {
        showBackupError(error)
      }
    }

    const getAllLists = async() => {
      const lists = []
      lists.push(await getListMusics(defaultList.id).then(musics => ({ ...defaultList, list: toRaw(musics) })))
      lists.push(await getListMusics(loveList.id).then(musics => ({ ...loveList, list: toRaw(musics) })))

      for await (const list of userLists) {
        lists.push(await getListMusics(list.id).then(musics => ({ ...toRaw(list), list: toRaw(musics) })))
      }

      return lists
    }

    const importOldListData = async(lists) => {
      const allLists = await getAllLists()
      for (const list of lists) {
        try {
          const targetList = allLists.find(l => l.id == list.id)
          if (targetList) {
            targetList.list = filterMusicList(list.list.map(m => toNewMusicInfo(m)))
          } else {
            allLists.push({
              name: list.name,
              id: list.id,
              list: filterMusicList(list.list.map(m => toNewMusicInfo(m))),
              source: list.source,
              sourceListId: list.sourceListId,
              locationUpdateTime: list.locationUpdateTime ?? null,
            })
          }
        } catch (err) {
          console.log(err)
        }
      }
      const defaultList = allLists.shift().list
      const loveList = allLists.shift().list
      await overwriteListFull({ defaultList, loveList, userList: allLists })
    }
    const importNewListData = async(lists) => {
      const allLists = await getAllLists()
      for (const list of lists) {
        try {
          const targetList = allLists.find(l => l.id == list.id)
          if (targetList) {
            targetList.list = filterMusicList(list.list).map(m => fixNewMusicInfoQuality(m))
          } else {
            allLists.push({
              name: list.name,
              id: list.id,
              list: filterMusicList(list.list).map(m => fixNewMusicInfoQuality(m)),
              source: list.source,
              sourceListId: list.sourceListId,
              locationUpdateTime: list.locationUpdateTime ?? null,
            })
          }
        } catch (err) {
          console.log(err)
        }
      }
      const defaultList = allLists.shift().list
      const loveList = allLists.shift().list
      await overwriteListFull({ defaultList, loveList, userList: allLists })
    }
    const getImportSetting = (setting, apiIdMap = new Map()) => {
      const importedSetting = { ...setting }
      const sourceId = importedSetting['common.apiSource']
      if (/^user_api/.test(sourceId)) {
        const mappedSourceId = apiIdMap.get(sourceId)
        if (mappedSourceId) importedSetting['common.apiSource'] = mappedSourceId
        else delete importedSetting['common.apiSource']
      }
      importedSetting['common.isAgreePact'] = false
      return importedSetting
    }
    const importOldSettingData = (setting, apiIdMap) => {
      console.log(setting)
      setting = migrateSetting(setting)
      updateSetting(getImportSetting(setting, apiIdMap))
    }
    const importNewSettingData = (setting, apiIdMap) => {
      updateSetting(getImportSetting(setting, apiIdMap))
    }
    const restoreUserApis = async(backupApis = []) => {
      const apiIdMap = new Map()
      const existingApis = await getUserApiList()
      const existingScripts = new Map()
      for (const api of existingApis) {
        apiIdMap.set(api.id, api.id)
        const script = await getUserApiScript(api.id)
        if (script) existingScripts.set(script, api.id)
      }

      if (Array.isArray(backupApis)) {
        for (const backupApi of backupApis) {
          if (!backupApi || !backupApi.id || typeof backupApi.script != 'string' || !backupApi.script) continue
          let targetId = existingScripts.get(backupApi.script)
          if (!targetId) {
            const result = await importUserApi(backupApi.script)
            targetId = result.apiInfo.id
            existingScripts.set(backupApi.script, targetId)
          }
          apiIdMap.set(backupApi.id, targetId)
        }
      }
      userApi.list = await getUserApiList()
      return apiIdMap
    }


    const importAllData = async(path) => {
      await runBackupTask(async() => {
        const allData = await window.lx.worker.main.readLxConfigFile(path)
        if (!allData || typeof allData != 'object') {
          showImportTip()
          return
        }

        const apiIdMap = await restoreUserApis(allData.userApis)
        switch (allData.type) {
          case 'allData':
            // 兼容0.6.2及以前版本的列表数据
            if (allData.defaultList) await overwriteListMusics({ listId: LIST_IDS.DEFAULT, musicInfos: filterMusicList(allData.defaultList.list.map(m => toNewMusicInfo(m))) })
            else await importOldListData(allData.playList)
            importOldSettingData(allData.setting, apiIdMap)
            break
          case 'allData_v2':
            await importNewListData(allData.playList)
            importNewSettingData(allData.setting, apiIdMap)
            break
          default: { showImportTip(allData.type) }
        }
      })
    }
    const handleImportAllData = () => {
      void showSelectDialog({
        title: t('setting__backup_all_import_desc'),
        properties: ['openFile'],
        filters: [
          { name: 'Setting', extensions: ['json', 'lxmc'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      }).then(result => {
        if (result.canceled) return
        void dialog.confirm({
          message: t('setting__backup_all_import_confirm'),
          cancelButtonText: t('cancel_button_text'),
          confirmButtonText: t('confirm_button_text'),
        }).then(confirm => {
          if (!confirm) return
          void importAllData(result.filePaths[0])
        })
      })
    }

    const exportAllData = async(path) => {
      await runBackupTask(async() => {
        const allData = {
          type: 'allData_v2',
          setting: { ...appSetting },
          playList: await getAllLists(),
          userApis: await Promise.all((await getUserApiList()).map(async api => ({
            ...api,
            script: await getUserApiScript(api.id),
          }))),
        }
        await window.lx.worker.main.saveLxConfigFile(path, allData)
      })
    }
    const handleExportAllData = () => {
      void openSaveDir({
        title: t('setting__backup_all_export_desc'),
        defaultPath: 'lx_datas_v2.lxmc',
      }).then(result => {
        if (result.canceled) return
        void exportAllData(result.filePath)
      })
    }

    const exportSetting = async(path) => {
      await runBackupTask(async() => {
        const data = {
          type: 'setting_v2',
          data: { ...appSetting },
        }
        await window.lx.worker.main.saveLxConfigFile(path, data)
      })
    }
    const handleExportSetting = () => {
      void openSaveDir({
        title: t('setting__backup_part_export_setting_desc'),
        defaultPath: 'lx_setting_v2.lxmc',
      }).then(result => {
        if (result.canceled) return
        void exportSetting(result.filePath)
      })
    }

    const importSetting = async(path) => {
      await runBackupTask(async() => {
        const settingData = await window.lx.worker.main.readLxConfigFile(path)
        if (!settingData || typeof settingData != 'object') {
          showImportTip()
          return
        }

        const apiIdMap = await restoreUserApis()
        switch (settingData.type) {
          case 'setting':
            importOldSettingData(settingData.data, apiIdMap)
            break
          case 'setting_v2':
            importNewSettingData(settingData.data, apiIdMap)
            break
          default: { showImportTip(settingData.type) }
        }
      })
    }
    const handleImportSetting = () => {
      void showSelectDialog({
        title: t('setting__backup_part_import_setting_desc'),
        properties: ['openFile'],
        filters: [
          { name: 'Setting', extensions: ['json', 'lxmc'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      }).then(result => {
        if (result.canceled) return
        void importSetting(result.filePaths[0])
      })
    }

    const exportPlayList = async(path) => {
      await runBackupTask(async() => {
        const data = {
          type: 'playList_v2',
          data: await getAllLists(),
        }
        await window.lx.worker.main.saveLxConfigFile(path, data)
      })
    }
    const handleExportPlayList = () => {
      void openSaveDir({
        title: t('setting__backup_part_export_list_desc'),
        defaultPath: 'lx_list.lxmc',
      }).then(result => {
        if (result.canceled) return
        void exportPlayList(result.filePath)
      })
    }

    const importPlayList = async(path) => {
      await runBackupTask(async() => {
        const listData = await window.lx.worker.main.readLxConfigFile(path)
        if (!listData || typeof listData != 'object') {
          showImportTip()
          return
        }

        switch (listData.type) {
          case 'defautlList': // 兼容0.6.2及以前版本的列表数据
            await overwriteListMusics({ listId: LIST_IDS.DEFAULT, musicInfos: filterMusicList(listData.data.list.map(m => toNewMusicInfo(m))) })
            break
          case 'playList':
            await importOldListData(listData.data)
            break
          case 'playList_v2':
            await importNewListData(listData.data)
            break
          case 'allData':
            if (listData.defaultList) await overwriteListMusics({ listId: LIST_IDS.DEFAULT, musicInfos: filterMusicList(listData.defaultList.list.map(m => toNewMusicInfo(m))) })
            else await importOldListData(listData.playList)
            break
          case 'allData_v2':
            await importNewListData(listData.playList)
            break
          default: { showImportTip(listData.type) }
        }
      })
    }
    const handleImportPlayList = () => {
      void showSelectDialog({
        title: t('setting__backup_part_import_list_desc'),
        properties: ['openFile'],
        filters: [
          { name: 'Play List', extensions: ['json', 'lxmc'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      }).then(result => {
        if (result.canceled) return
        void dialog.confirm({
          message: t('setting__backup_part_import_list_confirm'),
          cancelButtonText: t('cancel_button_text'),
          confirmButtonText: t('confirm_button_text'),
        }).then(confirm => {
          if (!confirm) return
          void importPlayList(result.filePaths[0])
        })
      })
    }

    const exportPlayListToText = async(savePath, isMerge) => {
      await runBackupTask(async() => {
        const lists = await getAllLists()
        await window.lx.worker.main.exportPlayListToText(savePath, lists, isMerge)
      })
    }
    const handleExportPlayListToText = async() => {
      const confirm = await dialog.confirm({
        message: t('setting__backup_other_export_list_text_confirm'),
        cancelButtonText: t('cancel_button_text'),
        confirmButtonText: t('confirm_button_text'),
      })
      if (confirm) {
        void openSaveDir({
          title: t('setting__backup_other_export_dir'),
          defaultPath: 'lx_list_all.txt',
        }).then(result => {
          if (result.canceled) return
          let path = result.filePath
          if (!path.endsWith('.txt')) path += '.txt'
          void exportPlayListToText(path, true)
        })
      } else {
        void showSelectDialog({
          title: t('setting__backup_other_export_dir'),
          // defaultPath: currentStting.value.download.savePath,
          properties: ['openDirectory'],
        }).then(result => {
          if (result.canceled) return
          void exportPlayListToText(result.filePaths[0], false)
        })
      }
    }

    const exportPlayListToCsv = async(savePath, isMerge) => {
      await runBackupTask(async() => {
        const lists = await getAllLists()
        await window.lx.worker.main.exportPlayListToCSV(savePath, lists, isMerge, `${t('music_name')},${t('music_singer')},${t('music_album')}\n`)
      })
    }
    const handleExportPlayListToCsv = async() => {
      const confirm = await dialog.confirm({
        message: t('setting__backup_other_export_list_text_confirm'),
        cancelButtonText: t('cancel_button_text'),
        confirmButtonText: t('confirm_button_text'),
      })
      if (confirm) {
        void openSaveDir({
          title: t('setting__backup_other_export_dir'),
          defaultPath: 'lx_list_all.csv',
        }).then(result => {
          if (result.canceled) return
          let path = result.filePath
          if (!path.endsWith('.csv')) path += '.csv'
          void exportPlayListToCsv(path, true)
        })
      } else {
        void showSelectDialog({
          title: t('setting__backup_other_export_dir'),
          // defaultPath: currentStting.value.download.savePath,
          properties: ['openDirectory'],
        }).then(result => {
          if (result.canceled) return
          void exportPlayListToCsv(result.filePaths[0], false)
        })
      }
    }

    // window.eventHub.on(eventBaseName.set_config, handleUpdateSetting)

    // onBeforeUnmount(() => {
    //   window.eventHub.off(eventBaseName.set_config, handleUpdateSetting)
    // })

    return {
      // currentStting,
      handleExportPlayList,
      handleImportPlayList,
      handleExportSetting,
      handleImportSetting,
      handleExportAllData,
      handleImportAllData,
      handleExportPlayListToText,
      handleExportPlayListToCsv,
    }
  },
}
</script>

<style lang="less" module>
.savePath {
  font-size: 12px;
}
</style>
