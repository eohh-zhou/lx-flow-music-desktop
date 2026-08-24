<template lang="pug">
dt#netease_music {{ $t('netease_music_setting') }}
dd
  div
    .p
      base-checkbox(
        id="setting_netease_music_enabled" :model-value="appSetting['neteaseMusic.enabled']"
        :label="$t('netease_music_enable')" @update:model-value="updateSetting({'neteaseMusic.enabled': $event})")
    .p(aria-live="polite")
      span {{ neteaseMusicStatus.configured ? $t('netease_music_cookie_configured') : $t('netease_music_cookie_unconfigured') }}
    .p
      base-btn.btn(min :disabled="isLogging" @click="handleLogin") {{ neteaseMusicStatus.configured ? $t('netease_music_login_again') : $t('netease_music_login') }}
      base-btn.btn(min :disabled="isLogging || !neteaseMusicStatus.configured" @click="clearLogin") {{ $t('netease_music_cookie_clear') }}
    .p(v-if="isLogging")
      span.auto-hidden {{ $t('netease_music_login_waiting') }}
    .p(v-else-if="loginFailed")
      span.auto-hidden {{ $t('netease_music_login_failed') }}
    .p
      span.auto-hidden {{ $t('netease_music_cookie_tip') }}
</template>

<script>
import { onMounted, ref } from '@common/utils/vueTools'
import { getNeteaseMusicStatus, loginNeteaseMusic, setNeteaseMusicCookie } from '@renderer/utils/ipc'
import { appSetting, updateSetting } from '@renderer/store/setting'

export default {
  name: 'SettingNeteaseMusic',
  setup() {
    const neteaseMusicStatus = ref({ configured: false })
    const isLogging = ref(false)
    const loginFailed = ref(false)

    const refreshStatus = async() => {
      neteaseMusicStatus.value = await getNeteaseMusicStatus()
    }

    const handleLogin = async() => {
      isLogging.value = true
      loginFailed.value = false
      try {
        neteaseMusicStatus.value = await loginNeteaseMusic()
      } catch {
        loginFailed.value = true
      } finally {
        isLogging.value = false
      }
    }

    const clearLogin = async() => {
      await setNeteaseMusicCookie('')
      await refreshStatus()
    }

    onMounted(() => {
      void refreshStatus()
    })

    return {
      appSetting,
      updateSetting,
      neteaseMusicStatus,
      isLogging,
      loginFailed,
      handleLogin,
      clearLogin,
    }
  },
}
</script>
