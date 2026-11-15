// Claude の動きに合わせて背景に重ねる絵。背景を差し替えるたびに絵の中の動きは最初からになるので、
// --t0 に経過秒数を渡して背景は続きから再生させる。
//
// デスクトップは、見慣れない書き方の背景を描いた直後に静止画へ差し替える（2026-11-15 に実機で確認）。
// 公式のテーマ例と同じ書き方だけを使う: <use> は使わない、アニメはすべて繰り返し（infinite）にする、アニメで動かすのは opacity と transform だけ、<style> は1つ、
// @media は prefers-reduced-motion だけ、!important・cubic-bezier・fill-mode・SVG 図形のアニメは使わない。

import type { Pulse } from '../types'

import { SCENE } from './scene.js'

// 作業中: 星屑の3層と瞬く星を一段明るくする（星だけでは淡すぎて気づかれなかった）
const BUSY_CSS = '#s1 g{fill:#3c434e}#s2 g{fill:#6a7486}#s3 g{fill:#a9b4c6}.st{fill:#ffffff}'

// 送信した瞬間: 入力欄のあたりから、細かい文字が内側から外側へ順にキラッと光っては消える（きらめきの波）。
// 1回で終わるアニメを含むとデスクトップは背景を止める（2026-11-15 に実機で確認）。周期を長くした繰り返しにして、
// 最初の数秒だけ光り、残りは見えないまま待つ。送信のたびに背景が描き直されるので、見た目は「送信ごとに1回」
const RIPPLE_CYCLE = 300
const pct = (secs: number) => `${((secs / RIPPLE_CYCLE) * 100).toFixed(3)}%`

// 決まった並びにするための簡単な乱数（毎回同じ絵になる）
let seed = 0x5eed
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)

const GLYPHS = ['*', '+', '.', '*', '+', 'x', '.', ':']
// 入力欄から画面全体へ広がる波。遅れは10段階のクラスにまとめる（要素ごとに書くと文字数の上限を圧迫する）
const WAVES = 10
const SPARKLES = Array.from({ length: 72 }, (_, i) => {
  const x = rnd() * 1600 - 800
  const y = -rnd() * 1000 + 15
  const dist = Math.hypot(x / 1.6, y) / 1000 // 入力欄からの近さ（0〜1くらい）
  const wave = Math.min(WAVES - 1, Math.floor(dist * WAVES + rnd() * 1.5))
  const size = rnd() < 0.18 ? 3 : rnd() < 0.6 ? 2 : 1
  return `<text class="a${i % 3} f${size} w${wave}" x="${x.toFixed(0)}" y="${y.toFixed(0)}">${GLYPHS[i % GLYPHS.length]}</text>`
}).join('')
const WAVE_CSS = Array.from({ length: WAVES }, (_, k) => `.w${k}{animation-delay:${(0.1 + k * 0.22).toFixed(2)}s}`).join('')

const twinkle = (name: string, stops: readonly [number, number][]) =>
  `.${name}{animation:${name} ${RIPPLE_CYCLE}s linear infinite}@keyframes ${name}{0%{opacity:0;transform:translate(0px,0px)}` +
  stops.map(([t, o]) => `${pct(t)}{opacity:${o}}`).join('') +
  `${pct(1.3)}{opacity:0;transform:translate(0px,-10px)}100%{opacity:0;transform:translate(0px,-10px)}}`

const RIPPLE_CSS =
  WAVE_CSS +
  '.rp text{opacity:0;fill:#e9f4ff;text-anchor:middle}.f1{font-size:9px}.f2{font-size:12px;fill:#ffffff}.f3{font-size:17px;fill:#ffffff}' +
  twinkle('a0', [[0.12, 1], [0.35, 0.3], [0.55, 1], [1.1, 0]]) +
  twinkle('a1', [[0.08, 1], [0.7, 0.7], [1.2, 0]]) +
  twinkle('a2', [[0.18, 1], [0.3, 0.1], [0.45, 1], [0.95, 0]]) +
  '@media (prefers-reduced-motion:reduce){.rp{opacity:0}}'

const RIPPLE_SVG = `<g class="rp" transform="translate(800 985)">${SPARKLES}</g>`

const STYLE_END = SCENE.indexOf('</style>')
const END = SCENE.lastIndexOf('</svg>')

/** いまの状態に合わせた背景。同じ状態なら同じ文字列なので、余計な描き直しは起きない */
export function sceneFor(pulse: Pulse): string {
  const css = `svg{--t0:${(-pulse.t0).toFixed(2)}s}` + (pulse.mode === 'busy' ? BUSY_CSS + RIPPLE_CSS : '')
  const ripple = pulse.mode === 'busy' ? RIPPLE_SVG : ''

  return SCENE.slice(0, STYLE_END) + css + SCENE.slice(STYLE_END, END) + ripple + '</svg>'
}
