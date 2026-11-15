// Claude の動きに合わせて背景に重ねる絵。背景を差し替えるたびに絵の中の動きは最初からになるので、
// --t0 に経過秒数を渡して背景は続きから再生させる。
//
// デスクトップは、見慣れない書き方の背景を描いた直後に静止画へ差し替える（2026-11-15 に実機で確認）。
// 公式のテーマ例と同じ書き方だけを使う: <use> は使わない、アニメはすべて繰り返し（infinite）にする、アニメで動かすのは opacity と transform（金魚のコマの出し入れだけ visibility も）、<style> は1つ、
// @media は prefers-reduced-motion だけ、!important・cubic-bezier・fill-mode・SVG 図形のアニメは使わない。

import type { Pulse } from '../types'

import { SCENE } from './scene.js'

// 作業中: 星屑の3層と瞬く星を一段明るくする（星だけでは淡すぎて気づかれなかった）
const BUSY_CSS = '#s1 g{fill:#3c434e}#s2 g{fill:#6a7486}#s3 g{fill:#a9b4c6}.st{fill:#ffffff}'

// 送信した瞬間: 窓の下端に沿った帯で細かい ASCII が強く光り、下から上へ広がりながら2回瞬いて消える。
// 経緯（2026-11-15、実機で）: 画面全体に文字を散らした版は「まばらでキラキラしていない」、模様で画面全体に敷いた版は
// 「全体に出てしまう」と言われ、「入力欄のまわりだけ・もっと細かく・発光つよめ」になった。
// 背景の絵は窓に合わせて上下を切り落とすので、絵の座標では入力欄の位置が決まらない。さらに入力欄の左右の位置は
// サイドバーや右のパネルの開き具合で変わり、背景には知らされない（窓の中央に置いたらチャット欄の右外で光った）。
// そこでユーザーと相談し、窓の下端に沿った帯全体で光らせる（入力欄がどこにあってもそのまわりが光る）。
// 帯は窓の幅いっぱい・下端に揃う入れ子の <svg>（xMidYMax slice）に描く。
// 1回で終わるアニメを含むとデスクトップは背景を止める（2026-11-15 に実機で確認）。周期を長くした繰り返しにして、
// 最初の数秒だけ光り、残りは見えないまま待つ。送信のたびに背景が描き直されるので、見た目は「送信ごとに1回」
const RIPPLE_CYCLE = 300
const pct = (secs: number) => `${((secs / RIPPLE_CYCLE) * 100).toFixed(3)}%`

// 決まった並びにするための簡単な乱数（毎回同じ絵になる）
let seed = 0x5eed
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)

// 細かい粒の密集は模様で描く（1つずつ置くと文字数の上限を超える）。下端から高さの違う3段の帯を細かい文字の模様で塗り、
// 下ほど重なって密に、上ほどまばらにする。帯は下から順に、低く縮めた所から上へ伸ばしつつ2回瞬かせる（下から上への波）。
// [帯の高さ, タイルの幅, 高さ, 粒の数, 文字, 大きさの組, 角度, 始まり（秒）]
const FIELDS = [
  [80, 34, 24, 7, '.:+.', [5, 6], -11, 0.05],
  [160, 58, 42, 7, '.+*:', [6, 8], 7, 0.22],
  [270, 96, 70, 7, '+*.+', [8, 10], -4, 0.4],
] as const
const SIZES = [...new Set(FIELDS.flatMap(([, , , , , sizes]) => sizes))]

const tile = (w: number, h: number, n: number, glyphs: string, sizes: readonly number[]) =>
  Array.from({ length: n }, () => {
    const fs = sizes[Math.floor(rnd() * sizes.length)]
    return `<text class="e${fs}" x="${(rnd() * w).toFixed(0)}" y="${(rnd() * h).toFixed(0)}">${glyphs[Math.floor(rnd() * glyphs.length)]}</text>`
  }).join('')

// 原点は窓の下端の中央。帯は横に窓の外まで伸ばす（slice で左右が切れても端まで光る）
const FIELD_SVG = FIELDS.map(
  ([h, w, th, n, glyphs, sizes, angle], k) =>
    `<pattern id="k${k}" width="${w}" height="${th}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})">${tile(w, th, n, glyphs, sizes)}</pattern>` +
    `<g class="k${k}"><rect x="-900" y="-${h}" width="1800" height="${h}" fill="url(#k${k})"/></g>`,
).join('')

// 低く縮めた所から上へ伸ばしつつ、2回瞬いて消える
const burst = (k: number, t: number) =>
  `.k${k}{opacity:0;animation:k${k} ${RIPPLE_CYCLE}s linear infinite}@keyframes k${k}{0%,${pct(t)}{opacity:0;transform:scale(1,.35)}` +
  `${pct(t + 0.2)}{opacity:1}${pct(t + 0.45)}{opacity:.3}${pct(t + 0.7)}{opacity:1}` +
  `${pct(t + 1.5)}{opacity:0;transform:scale(1,1.1)}100%{opacity:0;transform:scale(1,1.1)}}`

// 特に明るい粒を少しだけ1つずつ、横幅いっぱいに置く。3つに1つは後ろに淡い青の大きな + を重ねて光のにじみにする
// （ぼかしの光の玉は使わない）。下にある粒から順に光る
const WAVES = 6
const SPARKS = Array.from({ length: 17 }, (_, i) => {
  const d = rnd() ** 1.4
  const at = `x="${((i + rnd()) * (1560 / 17) - 780).toFixed(0)}" y="${(-d * 240 - 6).toFixed(0)}"`
  const wave = Math.min(WAVES - 1, Math.floor(d * WAVES))
  const halo = i % 3 === 0 ? `<text class="h a${i % 3} w${wave}" ${at}>+</text>` : ''
  return halo + `<text class="a${i % 3} w${wave}" ${at}>${'*+*x'[i % 4]}</text>`
}).join('')
const WAVE_CSS = Array.from({ length: WAVES }, (_, k) => `.w${k}{animation-delay:${(0.08 + k * 0.16).toFixed(2)}s}`).join('')

const twinkle = (name: string, stops: readonly [number, number][]) =>
  `.${name}{animation:${name} ${RIPPLE_CYCLE}s linear infinite}@keyframes ${name}{0%{opacity:0;transform:translate(0px,0px)}` +
  stops.map(([t, o]) => `${pct(t)}{opacity:${o}}`).join('') +
  `${pct(1.4)}{opacity:0;transform:translate(0px,-8px)}100%{opacity:0;transform:translate(0px,-8px)}}`

const RIPPLE_CSS =
  WAVE_CSS +
  '.rp text{fill:#ffffff;text-anchor:middle}.s text{opacity:0}.a0{font-size:11px}.a1{font-size:9px}.a2{font-size:13px}.rp .h{fill:#8cc4ff;font-size:26px}' +
  SIZES.map(fs => `.e${fs}{font-size:${fs}px}`).join('') +
  FIELDS.map(([, , , , , , , t], k) => burst(k, t)).join('') +
  twinkle('a0', [[0.1, 1], [0.35, 0.25], [0.6, 1], [1.1, 0]]) +
  twinkle('a1', [[0.08, 1], [0.5, 0.6], [0.75, 1], [1.2, 0]]) +
  twinkle('a2', [[0.15, 1], [0.3, 0.15], [0.5, 1], [1.0, 0]]) +
  '@media (prefers-reduced-motion:reduce){.rp{opacity:0}}'

// 窓の幅いっぱい・下端に揃える
const RIPPLE_SVG = `<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice"><g class="rp" transform="translate(800 1000)">${FIELD_SVG}<g class="s">${SPARKS}</g></g></svg>`

const STYLE_END = SCENE.indexOf('</style>')
const END = SCENE.lastIndexOf('</svg>')

/** いまの状態に合わせた背景。同じ状態なら同じ文字列なので、余計な描き直しは起きない */
export function sceneFor(pulse: Pulse): string {
  const css = `svg{--t0:${(-pulse.t0).toFixed(2)}s}` + (pulse.mode === 'busy' ? BUSY_CSS + RIPPLE_CSS : '')
  const ripple = pulse.mode === 'busy' ? RIPPLE_SVG : ''

  return SCENE.slice(0, STYLE_END) + css + SCENE.slice(STYLE_END, END) + ripple + '</svg>'
}
