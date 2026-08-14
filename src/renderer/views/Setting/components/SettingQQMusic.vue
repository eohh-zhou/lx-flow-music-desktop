<template lang="pug">
dt#qq_music {{ $t('qq_music') }}
dd
  div
    .p
      base-checkbox(
        id="setting_qq_music_enabled" :model-value="appSetting['qqMusic.enabled']"
        :label="$t('qq_music_enable')" @update:model-value="updateSetting({'qqMusic.enabled': $event})")
    .p(aria-live="polite")
      span {{ qqMusicStatus.configured ? $t('qq_music_cookie_configured') : $t('qq_music_cookie_unconfigured') }}
    .p
      base-btn.btn(min :disabled="isLogging" @click="handleLogin") {{ qqMusicStatus.configured ? $t('qq_music_login_again') : $t('qq_music_login') }}
      base-btn.btn(min :disabled="isLogging || !qqMusicStatus.configured" @click="clearLogin") {{ $t('qq_music_cookie_clear') }}
    .p(v-if="isLogging")
      span.auto-hidden {{ $t('qq_music_login_waiting') }}
    .p(v-else-if="loginFailed")
      span.auto-hidden {{ $t('qq_music_login_failed') }}
    .p
      span.auto-hidden {{ $t('qq_music_cookie_tip') }}
</template>

<script>
import { onMounted, ref } from '@common/utils/vueTools'
import { getQQMusicStatus, loginQQMusic, setQQMusicCookie } from '@renderer/utils/ipc'
import { appSetting, updateSetting } from '@renderer/store/setting'

export default {
  name: 'SettingQQMusic',
  setup() {
    const qqMusicStatus = ref({ configured: false })
    const isLogging = ref(false)
    const loginFailed = ref(false)

    const refreshQQMusicStatus = async() => {
      qqMusicStatus.value = await getQQMusicStatus()
    }

    const handleLogin = async() => {
      isLogging.value = true
      loginFailed.value = false
      try {
        const result = await loginQQMusic()
        qqMusicStatus.value = result
      } catch {
        loginFailed.value = true
      } finally {
        isLogging.value = false
      }
    }

    const clearLogin = async() => {
      await setQQMusicCookie('')
      await refreshQQMusicStatus()
    }

    onMounted(() => {
      void refreshQQMusicStatus()
    })

    return {
      appSetting,
      updateSetting,
      qqMusicStatus,
      isLogging,
      loginFailed,
      handleLogin,
      clearLogin,
    }
  },
}
</script>
