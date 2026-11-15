import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { Pulse } from '../types'

import { problems, theme } from './palette.js'
import { sceneFor } from './pulse.js'


const PLUGIN = 'stardust-tank'

const LOOK: ThemeSetArgs = {
  colors: theme,
  // 夜の水中の絵なので、相手のライト/ダーク設定に関わらずダークで描く
  overrideColorScheme: 'dark',
  backdrop: {
    scene: PLUGIN,
    // 公式のテーマ例（theme-examples）に合わせて薄めに曇らせ、背景の動きがパネル越しにも見えるようにする
    glass: { blur: 14, tint: '#0a0b0e', opacity: 0.42 },
  },
}

const pulse = atom({ plugin: 'stardust-tank', key: 'pulse' } as const, { mode: 'idle', start: 0, since: 0 } as Pulse)

/**
 * 背景の状態を切り替える（切り替えた時刻を since に残す）。同じ状態への切り替えは何もしない（描き直しを増やさない）。
 */
async function shift($: EngineInterface, mode: Pulse['mode']): Promise<void> {
  const now = await $.clock.now()

  await update($, pulse, was => {
    if (was.start !== 0 && was.mode === mode) {
      return was
    }

    const start = was.start === 0 ? now : was.start

    return { mode, start, since: now }
  })
}

/** 演出の失敗で、送信や返答を止めない */
function quietly($: EngineInterface, run: Promise<void>): Promise<void> {
  return run.catch(error => $.ui.log(`pulse: ${String(error)}`, { to: 'debug' }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    await quietly($, shift($, 'idle'))
    const set = await $.theme.set(LOOK)

    // 起動直後はまだデスクトップの画面がつながっていないことがある。テーマは残り、つながった時に描かれるので、
    // 画面には出さずデバッグログにだけ残す（公式の theme-examples と同じ扱い）
    if (!set.isDrawn) {
      $.ui.log(set.reason, { to: 'debug' })
    }

    return next(e)
  })

  // 送信した: 星屑を光らせ、作業中の背景にする
  on('prompt.submit', async ($, e, next) => {
    await quietly($, shift($, 'busy'))

    return next(e)
    // 演出の都合で送信を止めない: 失敗しても時間切れでも、送信はそのまま通す
  }).catch(($, e, next) => next(e))

  // ターンが終わった: 穏やかな背景に戻す
  on('turn.complete', async ($, e, next) => {
    await quietly($, shift($, 'idle'))

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    // チャットの後ろに場所があり、部品表に Svg があるのはデスクトップのウィンドウだけ（公式の theme-examples と同じ判断）
    if (e.props.plugin !== PLUGIN || e.surface !== 'desktop' || e.props.scene !== PLUGIN) {
      return next(e)
    }
    const state = await read($, pulse)
    // 経過秒数は描き直すその時に時計から求める。状態を切り替えた時に決めておくと、アプリがセッションの移動などで
    // 描き直したときにその時点まで巻き戻り、金魚が消えて前の場所から現れてしまう
    const now = await $.clock.now()
    // 前の版の状態（since が無い）が残っていても壊れないよう、無い時刻は 0 として扱う
    const at = (from: number | undefined) => (!from ? 0 : (now - from) / 1000)
    const { Svg } = $.ui.resolve(e)

    return (
      <Svg
        isInteractive
        alt="ASCII light drifting underwater, with ASCII goldfish swimming and turning"
        source={sceneFor(state.mode, at(state.start), at(state.since))}
      />
    )
  })
}
