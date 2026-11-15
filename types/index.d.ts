/** 背景の状態。idle: 待機中、busy: Claude が作業中（送信の波紋も出す） */
export type Pulse = {
  mode: 'idle' | 'busy'
  /** 背景を最初に設定した時刻（ミリ秒）。0 はまだ */
  start: number
  /** いま描き直すときに、背景の動きを何秒進めた所から再生するか */
  t0: number
}

declare module 'claude-code' {
  interface PluginState {
    'stardust-tank': { pulse: Pulse }
  }
}
