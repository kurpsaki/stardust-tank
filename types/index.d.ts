/** 背景の状態。idle: 待機中、busy: Claude が作業中（送信の瞬間に星屑が光る） */
export type Pulse = {
  mode: 'idle' | 'busy'
  /** 背景を最初に設定した時刻（ミリ秒）。0 はまだ */
  start: number
  /** いまの状態に切り替えた時刻（ミリ秒）。送信時のきらめきを、描き直しても光り直さないようにする */
  since: number
}

declare module 'claude-code' {
  interface PluginState {
    'stardust-tank': { pulse: Pulse }
  }
}
