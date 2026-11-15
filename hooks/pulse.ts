// Claude の動きに合わせて背景に重ねる絵。背景を差し替えるたびに絵の中の動きは最初からになるので、
// --t0 に経過秒数を渡して背景は続きから再生させる。
//
// デスクトップは、見慣れない書き方の背景を描いた直後に静止画へ差し替える（2026-11-15 に実機で確認）。
// 公式のテーマ例と同じ書き方だけを使う: <use> は使わない、アニメはすべて繰り返し（infinite）にする、アニメで動かすのは opacity と transform（金魚のコマの出し入れだけ visibility も）、<style> は1つ、
// @media は prefers-reduced-motion だけ、!important・cubic-bezier・fill-mode・SVG 図形のアニメは使わない。

import type { Pulse } from '../types'

import { SCENE } from './scene.js'

// 作業中: 星屑の3層と瞬く星を一段明るくする（星だけでは淡すぎて気づかれなかった）。送信の瞬間はそこから強く光る（下）
// 送信した瞬間: 背景の星屑そのものが強く光り、奥の細かい層から手前の層へ順に2回瞬いて、作業中の明るさに落ち着く。
// 経緯（2026-11-15、実機で）: 別のきらめきの文字を重ねる案は、画面全体に散らすと「まばら」「全体に出てしまう」、
// 入力欄のまわりに置こうとすると、入力欄の左右の位置（サイドバーや右のパネルで変わる）が背景に知らされず合わせられなかった。
// ユーザーの「ダストでいい」で、どこにでもある星屑を光らせる形にした（チャット欄のまわりも自然に光る）。
// 作業中は星屑の色を白に近い明るさにしておき、濃さ（opacity）で「光る→落ち着く」を作る。落ち着いた先は以前の作業中の明るさ。
// 1回で終わるアニメを含むとデスクトップは背景を止める（2026-11-15 に実機で確認）。周期を長くした繰り返しにして、
// 最初の数秒だけ光る。送信のたびに背景が描き直されるので、見た目は「送信ごとに1回」
const FLASH_CYCLE = 300
const pct = (secs: number) => `${((secs / FLASH_CYCLE) * 100).toFixed(3)}%`

// [層, 光った時の色, 落ち着いた濃さ, 光り始め（秒）]
const DUST_FLASH = [
  ['1', '#8a96a8', 0.42, 0.05],
  ['2', '#c4d0e2', 0.55, 0.25],
  ['3', '#ffffff', 0.68, 0.45],
] as const

const BUSY_CSS =
  DUST_FLASH.map(([k, color, rest, t]) =>
    `#s${k} g{fill:${color}}.ds${k} rect{opacity:${rest};animation:f${k} ${FLASH_CYCLE}s linear infinite}` +
    `@keyframes f${k}{0%,${pct(t)}{opacity:${rest}}${pct(t + 0.2)}{opacity:1}${pct(t + 0.5)}{opacity:${rest}}` +
    `${pct(t + 0.75)}{opacity:1}${pct(t + 1.8)},100%{opacity:${rest}}}`,
  ).join('') + '.st{fill:#ffffff}@media (prefers-reduced-motion:reduce){.ds1 rect,.ds2 rect,.ds3 rect{opacity:.6}.rp{opacity:0}}'

// さらに、画面のあちこちで細かいダストが弾ける（ユーザーの「画面ランダムのがいい」「細かいキラキラのダストが弾ける感じ」）。
// 細かい粒を弾け1つ分の模様にし、点に縮めた所から一気に広げる。模様も一緒に広がるので、粒どうしが離れて飛び散って見える。
// 弾ける瞬間に中心で白い星が光り、後ろに淡い青の大きな + を重ねて光のにじみにする（ぼかしの光の玉は使わない）。
// 横長の窓では絵の上下が切れるので、縦は見えやすい中ほど（y 180〜820）に寄せる
let seed = 0x5eed
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
const DELAYS = 8
// 弾け1つ分の粒（模様のタイル1枚が弾け1つ分。繰り返さないので格子に見えない）。中心ほど密に、外ほどまばらに散らす
const R = 60
const DUST = Array.from({ length: 22 }, () => {
  const r = R * 0.95 * rnd() ** 0.7
  const th = rnd() * Math.PI * 2
  return `<text class="u${1 + Math.floor(rnd() * 3)}" x="${(R + r * Math.cos(th)).toFixed(0)}" y="${(R + r * Math.sin(th)).toFixed(0)}">${".'.:+`*"[Math.floor(rnd() * 7)]}</text>`
}).join('')
const BURSTS = Array.from({ length: 12 }, () => {
  const d = `d${Math.floor(rnd() * DELAYS)}`
  return (
    `<g transform="translate(${(60 + rnd() * 1480).toFixed(0)} ${(180 + rnd() * 640).toFixed(0)}) rotate(${(rnd() * 360).toFixed(0)})">` +
    `<g class="b ${d}"><rect x="-${R}" y="-${R}" width="${R * 2}" height="${R * 2}" fill="url(#pd)"/></g><text class="c h ${d}">+</text><text class="c ${d}">*</text></g>`
  )
}).join('')

const RIPPLE_CSS =
  Array.from({ length: DELAYS }, (_, k) => `.d${k}{animation-delay:${(0.05 + k * 0.23).toFixed(2)}s}`).join('') +
  '.rp text{fill:#ffffff;text-anchor:middle;dominant-baseline:central}.u1{font-size:5px}.u2{font-size:6px}.u3{font-size:8px;fill:#d9ecff}' +
  `.b{opacity:0;animation:pop ${FLASH_CYCLE}s ease-out infinite}@keyframes pop{0%{opacity:0;transform:scale(.1)}${pct(0.06)}{opacity:1}` +
  `${pct(1.1)},100%{opacity:0;transform:scale(1.6)}}` +
  `.c{opacity:0;font-size:15px;animation:core ${FLASH_CYCLE}s ease-out infinite}@keyframes core{0%{opacity:0;transform:scale(.4)}` +
  `${pct(0.05)}{opacity:1;transform:scale(1.2)}${pct(0.45)},100%{opacity:0;transform:scale(.6)}}.rp .h{fill:#8cc4ff;fill-opacity:.45;font-size:34px}`

const RIPPLE_SVG = `<g class="rp"><pattern id="pd" x="-${R}" y="-${R}" width="${R * 2}" height="${R * 2}" patternUnits="userSpaceOnUse">${DUST}</pattern>${BURSTS}</g>`

const STYLE_END = SCENE.indexOf('</style>')
const END = SCENE.lastIndexOf('</svg>')

/** いまの状態に合わせた背景。同じ状態なら同じ文字列なので、余計な描き直しは起きない */
export function sceneFor(pulse: Pulse): string {
  const css = `svg{--t0:${(-pulse.t0).toFixed(2)}s}` + (pulse.mode === 'busy' ? BUSY_CSS + RIPPLE_CSS : '')
  const ripple = pulse.mode === 'busy' ? RIPPLE_SVG : ''

  return SCENE.slice(0, STYLE_END) + css + SCENE.slice(STYLE_END, END) + ripple + '</svg>'
}
