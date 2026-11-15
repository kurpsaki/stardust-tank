// 背景シーン（SVG）を hooks/scene.js に書き出す。
//   node tools/gen-scene.mjs
// 乱数は固定シードなので、何度実行しても同じ絵になる。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'


const OUT = fileURLToPath(new URL('../hooks/scene.js', import.meta.url))

let seed = 0xa5c11
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
const pick = s => s[Math.floor(rnd() * s.length)]

const W = 1600
const H = 1000
const FS = 6 // 文字の既定の大きさ（各層は自分の大きさを持つ）

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const TAU = Math.PI * 2

// 背景は「星屑の水槽」: 画面全体に細かい粒を、奥行きのある3層で敷く（ユーザーが3案から選んだ案）。
// 奥ほど小さく暗く密に、手前ほど大きく明るくまばら。層ごとに別の向き・周期でゆっくり揺れるので奥行きが出る。
// 各層は小さなタイルを模様（pattern）として敷く。タイルの大きさと角度を層ごとに変えて、繰り返しを目立たなくする。
// <use> で使い回すとデスクトップが背景を止めるので、pattern で敷く（2026-11-15 に実機で確認）
// [id, 列, 行, 文字の幅, 行の高さ, 文字の大きさ, 粒の文字, 最小密度, 最大密度, 色, 角度]
const DUST = [
  ['s1', 100, 40, 3, 5.5, 5, ".'`,.", 0.06, 0.34, '#2a2f37', -9],
  ['s2', 90, 40, 4.2, 7, 7, ".:'.+", 0.025, 0.13, '#454d5a', 13],
  ['s3', 64, 30, 6, 10, 10, '.+.*.', 0.008, 0.04, '#7a8494', -4],
]

/** 粒の層のタイル1枚分。密度に大きなむらを付けて、星雲のように濃い所と薄い所を作る（タイルの中で周期的） */
function dustTile(cols, rows, cw, lh, glyphs, lo, hi) {
  const tw = cols * cw
  const th = rows * lh
  const out = []
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cw
      const y = (r + 0.5) * lh
      const clump = 0.5 + 0.5 * Math.sin(TAU * (x / tw + 2 * (y / th)) + 1.3 * Math.sin(TAU * (2 * (x / tw) - y / th)))
      line += rnd() < lo + (hi - lo) * clump ** 2 ? pick(glyphs) : ' '
    }
    for (const m of line.matchAll(/\S(?:\S| {1,14}(?=\S))*/g)) {
      out.push(`<text x="${(m.index * cw).toFixed(1)}" y="${((r + 1) * lh).toFixed(1)}">${esc(m[0])}</text>`)
    }
  }
  return out.join('')
}

const TILES = DUST.map(
  ([id, cols, rows, cw, lh, fs, glyphs, lo, hi, color, angle]) =>
    `<pattern id="${id}" x="0" y="0" width="${(cols * cw).toFixed(1)}" height="${(rows * lh).toFixed(1)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})"><g fill="${color}" font-size="${fs}">${dustTile(cols, rows, cw, lh, glyphs, lo, hi)}</g></pattern>`,
).join('')
const FIELD = DUST.map(([id]) => `<g class="d${id}"><rect x="-90" y="-90" width="${W + 180}" height="${H + 180}" fill="url(#${id})"/></g>`).join('')

// 瞬く星: 画面のあちこちで、明るい文字がそれぞれ違う周期でふっと強く光る。
// 周期と遅れは要素ごとに書かず、数種類のクラスを組み合わせて使い回す（1個ずつ書くと文字数の上限を圧迫する）
const STAR_DELAYS = 6
const STARS = Array.from({ length: 75 }, (_, i) => {
  const x = rnd() * W
  const y = rnd() * H
  const size = rnd() < 0.12 ? 3 : rnd() < 0.5 ? 2 : 1
  return `<text class="st t${i % 3} z${size} q${Math.floor(rnd() * STAR_DELAYS)}" x="${x.toFixed(0)}" y="${y.toFixed(0)}">${pick('+*x+*.')}</text>`
}).join('')
const STAR_CSS = Array.from({ length: STAR_DELAYS }, (_, k) => `.q${k}{animation-delay:${(-k * 1.37).toFixed(2)}s}`).join('')

// 金魚: 実写の動画（tools/fish-video.mjs が作る fish-frames.json）の ASCII。
// 色ごとに層を分けて重ね、コマは隣どうし重ねて溶かしながら切り替える（点滅に見せない）。
const FISH = JSON.parse(readFileSync(fileURLToPath(new URL('./fish-frames.json', import.meta.url)), 'utf8'))
// 金魚は 5px の文字（1文字 3px × 行 5px）で組み、倍率に 1.2 を掛けて 6px として見せる。
// 座標が整数になり、小数の分だけ文字数が減る（その分を小さい金魚の細かさに回した）
const UNIT = 1.2
const FFS = 5 // 金魚の文字
const FCW = 3
const FLH = 5
const BW = FISH.cols * FCW // 金魚の枠の幅（倍率1）
const FISH_TONES = { r: 'zr', o: 'zo', y: 'zy' }

function frameSvg({ g, t }, attrs) {
  const layers = { r: [], o: [], y: [] }
  g.forEach((line, r) => {
    const y = (r + 1) * FLH
    for (const tone of Object.keys(layers)) {
      let row = ''
      for (let c = 0; c < line.length; c++) row += t[r][c] === tone ? line[c] : ' '
      for (const m of row.matchAll(/\S(?:\S| {1,30}(?=\S))*/g)) {
        layers[tone].push(`<text x="${m.index * FCW}" y="${y}">${esc(m[0])}</text>`)
      }
    }
  })
  const body = Object.entries(layers)
    .filter(([, l]) => l.length)
    .map(([tone, l]) => `<g class="${FISH_TONES[tone]}">${l.join('')}</g>`)
    .join('')
  return `<g ${attrs}>${body}</g>`
}

// 尾を振り続けるループ。三角形の重みで隣のコマと溶け合う
const LN = FISH.loop.frames.length
const LOOP_SECS = FISH.loop.secs
const loopSvg = FISH.loop.frames
  .map((f, k) => frameSvg(f, `class="lf" style="animation-delay:${(((k - 1) / LN) * LOOP_SECS - LOOP_SECS).toFixed(3)}s"`))
  .join('')

// 大きい1匹の振り付け（周期 P 秒）: 右へ泳ぐ → 振り返る → 左へ泳ぎ去る
const P = 52
const SC = 0.78 * UNIT // 大きい1匹の倍率（大きすぎると言われたので小さめ）
const TURN_AT = 46 // 振り返り始める位置（%）
const TURN_SPAN = ((FISH.turn.secs / 1.25) / P) * 100 // 振り返りは 1.25 倍速
const BACK_AT = TURN_AT + TURN_SPAN
const TURN_X = 860
// ループ絵の左右反転は、ループ絵が完全に消えている振り返りの途中で済ませる。振り返りの終わりちょうどに反転すると、
// ループ絵が出始める一瞬に右向きの魚がうっすら重なって見えた（ユーザー指摘「ターンしてから一瞬おかしくなる」）
const FLIP_AT = (TURN_AT + BACK_AT) / 2
const TN = FISH.turn.frames.length
const pc = v => `${v.toFixed(3)}%`
const turnCss = FISH.turn.frames
  .map((_, k) => {
    const h = TURN_SPAN / TN
    const c = TURN_AT + (k + 0.5) * h
    const a = k === 0 ? TURN_AT - 0.8 : c - h
    const z = k === TN - 1 ? BACK_AT + 1.0 : c + h
    return `.tf${k}{animation:tf${k} ${P}s linear infinite}@keyframes tf${k}{0%,${pc(a)}{opacity:0}${pc(k === 0 ? TURN_AT : k === TN - 1 ? BACK_AT : c)}${k === 0 ? `,${pc(c)}` : ''}{opacity:1}${pc(z)},100%{opacity:0}}`
  })
  .join('')
const turnSvg = FISH.turn.frames.map((f, k) => frameSvg(f, `class="tf tf${k}"`)).join('')
const offL = -BW * SC - 40
const bigCss = `.big{animation:big ${P}s linear infinite}
@keyframes big{0%{transform:translate(${offL.toFixed(0)}px,200px)}${pc(TURN_AT)}{transform:translate(${TURN_X}px,200px)}${pc(BACK_AT)}{transform:translate(${TURN_X + 14}px,206px)}100%{transform:translate(${offL.toFixed(0)}px,200px)}}
.vis{animation:vis ${P}s linear infinite}@keyframes vis{0%,${pc(TURN_AT - 0.3)}{opacity:1}${pc(TURN_AT + 0.4)},${pc(BACK_AT - 0.2)}{opacity:0}${pc(BACK_AT + 0.9)},100%{opacity:1}}
.flip{animation:flip ${P}s linear infinite}@keyframes flip{0%,${pc(FLIP_AT)}{transform:translate(0px,0px) scale(1,1)}${pc(FLIP_AT + 0.01)},100%{transform:translate(${BW}px,0px) scale(-1,1)}}
${turnCss}`
const fishEls = `<g class="big"><g class="bob" style="animation-duration:8s"><g transform="scale(${SC})">
<g class="vis"><g class="flip">${loopSvg}</g></g>
${turnSvg}
</g></g></g>`

// 小さい金魚: 同じループを細かい格子で作ったコマ（大きい金魚の絵を <use> で使い回すとデスクトップが背景を止めるため）。
// 大きい金魚と反対向きに、少し下を、少し速い尾びれで泳ぐ
const SN = FISH.small.frames.length
const SMALL_SECS = LOOP_SECS * 0.85
const SBW = FISH.small.cols * FCW
const SSC = 0.64 // 細かい格子を小さい文字で（画面上の大きさは以前の 40 列 × 0.8 倍とほぼ同じ）
const smallSvg = FISH.small.frames
  .map((f, k) => frameSvg(f, `class="sf" style="animation-delay:${(((k - 1) / SN) * SMALL_SECS - SMALL_SECS).toFixed(3)}s"`))
  .join('')
const smallCss = `.sf{opacity:0;animation:sf ${SMALL_SECS.toFixed(3)}s linear infinite}.sf text{font-size:${FFS}px}
@keyframes sf{0%{opacity:0}${pc(100 / SN)}{opacity:1}${pc(200 / SN)},100%{opacity:0}}
.sm{animation:sm 71s linear -24s infinite}@keyframes sm{from{transform:translate(${W + 60}px,640px)}to{transform:translate(${(-SBW * SSC - 60).toFixed(0)}px,640px)}}`
const smallEls = `<g class="sm"><g class="bob" style="animation-duration:6s"><g transform="scale(${SSC})"><g transform="translate(${SBW} 0) scale(-1 1)">${smallSvg}</g></g></g></g>`

// 泡: 縁が明るく左上に光の点がある透明な球を、明るさから細かい文字に置き換えて描く（「O がチープ」と言われたため）。
// 発光は文字そのもので表す（ぼかしの光の玉は「AI っぽい」と嫌われた）: 縁の外に淡い粒のにじみ（bh）、
// 光の当たる左上ほど明るい縁（br）、白い反射点（bs）の3層。反射点だけがゆっくり明るさを変える。
// ゆらゆら揺れながら昇って消える
const BCW = 3
const BLH = 5
function bubbleSvg(radius) {
  const cols = Math.ceil((radius * 2 * 1.45) / BCW) + 2
  const rows = Math.ceil((radius * 2 * 1.45) / BLH) + 2
  const layers = { bh: [], br: [], bs: [] }
  for (let r = 0; r < rows; r++) {
    const line = { bh: '', br: '', bs: '' }
    for (let c = 0; c < cols; c++) {
      const dx = ((c + 0.5) * BCW - (cols * BCW) / 2) / radius
      const dy = ((r + 0.5) * BLH - (rows * BLH) / 2) / radius
      const d = Math.hypot(dx, dy)
      const lit = 0.55 + 0.45 * Math.max(0, -(dx + dy) / Math.SQRT2 / Math.max(d, 0.01)) // 左上ほど明るい
      const rim = Math.exp(-(((d - 0.92) / 0.15) ** 2)) * lit
      const glow = Math.exp(-(((d - 1.12) / 0.3) ** 2)) * (0.45 + 0.55 * lit)
      const spec = Math.exp(-(((dx + 0.38) ** 2 + (dy + 0.42) ** 2) / 0.028)) + 0.6 * Math.exp(-(((dx - 0.42) ** 2 + (dy - 0.36) ** 2) / 0.012))
      const put = (k, ch) => { for (const n of Object.keys(line)) line[n] += n === k ? ch : ' ' }
      if (spec > 0.35) put('bs', spec > 0.8 ? '@' : spec > 0.55 ? '*' : '+')
      else if (rim > 0.2) put('br', '.:;+*'[Math.min(4, Math.floor(rim * 5))]) // o は「チープ」と言われたので使わない
      else if (glow > 0.22 && (glow > 0.5 || (c * 7 + r * 3) % 3 !== 0)) put('bh', glow > 0.62 ? ':' : glow > 0.4 ? '.' : "'")
      else put('', ' ')
    }
    const y = ((r + 1) * BLH - (rows * BLH) / 2).toFixed(0)
    for (const [k, l] of Object.entries(line)) {
      for (const m of l.matchAll(/\S(?:\S| {1,6}(?=\S))*/g)) layers[k].push(`<text x="${(m.index * BCW - (cols * BCW) / 2).toFixed(0)}" y="${y}">${esc(m[0])}</text>`)
    }
  }
  return Object.entries(layers).map(([k, l]) => `<g class="${k}">${l.join('')}</g>`).join('')
}
const BUBBLE_SHAPES = [9, 13, 18].map(bubbleSvg)
const bubbles = []
// 発光の層を足した分、数を減らして文字数の上限に収める（数より1つずつの質）
for (let i = 0; i < 5; i++) {
  const x = 90 + rnd() * (W - 180)
  const dur = 18 + rnd() * 12
  bubbles.push(
    `<g transform="translate(${x.toFixed(0)} 0)"><g class="bub" style="animation-duration:${dur.toFixed(1)}s;animation-delay:${(-rnd() * dur).toFixed(1)}s"><g class="wob" style="animation-delay:${(-rnd() * 4).toFixed(1)}s">${BUBBLE_SHAPES[i % 3]}</g></g></g>`,
  )
}

const PROMPT = '~/aquarium $ feed --goldfish '

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<style>
text{font-family:ui-monospace,Menlo,Consolas,"DejaVu Sans Mono",monospace;font-size:${FS}px;white-space:pre}
.ds1{animation:ds1 61s ease-in-out infinite alternate}@keyframes ds1{from{transform:translate(-22px,-10px)}to{transform:translate(22px,10px)}}
.ds2{animation:ds2 43s ease-in-out infinite alternate}@keyframes ds2{from{transform:translate(32px,-16px)}to{transform:translate(-32px,16px)}}
.ds3{animation:ds3 31s ease-in-out infinite alternate}@keyframes ds3{from{transform:translate(-48px,20px)}to{transform:translate(48px,-20px)}}
.st{fill:#dcecff}.z1{font-size:7px}.z2{font-size:9px}.z3{font-size:13px;fill:#ffffff}
.t0{animation:t0 5.1s ease-in-out infinite}@keyframes t0{0%,38%{opacity:.08}48%{opacity:1}60%,100%{opacity:.08}}
.t1{animation:t1 6.7s ease-in-out infinite}@keyframes t1{0%,30%{opacity:.05}40%{opacity:.9}46%{opacity:.3}52%{opacity:1}64%,100%{opacity:.05}}
.t2{animation:t2 8.3s ease-in-out infinite}@keyframes t2{0%,55%{opacity:.1}62%{opacity:1}75%,100%{opacity:.1}}
${STAR_CSS}
.zr{fill:#e2502e}.zo{fill:#f4913f}.zy{fill:#ffe6b8}
.lf,.tf{opacity:0}.lf{animation:lf ${LOOP_SECS}s linear infinite}.lf text,.tf text{font-size:${FFS}px}
@keyframes lf{0%{opacity:0}${pc(100 / LN)}{opacity:1}${pc(200 / LN)},100%{opacity:0}}
${bigCss}
${smallCss}
.bub{animation:rise 24s linear infinite}@keyframes rise{0%{transform:translate(0px,${H + 40}px);opacity:0}10%{opacity:.75}85%{opacity:.6}100%{transform:translate(0px,-60px);opacity:0}}
.bub text{font-size:5px}.bh{fill:#5f9ccf;opacity:.55}.br{fill:#cfe6fa}.bs{fill:#ffffff;animation:bs 4.6s ease-in-out infinite alternate}@keyframes bs{from{opacity:.55}to{opacity:1}}.wob{animation:wob 3.6s ease-in-out infinite alternate}@keyframes wob{from{transform:translate(-7px,0px)}to{transform:translate(7px,0px)}}
.bob{animation:bob 7s ease-in-out infinite alternate}
@keyframes bob{from{transform:translateY(-14px)}to{transform:translateY(14px)}}
.cur{fill:#c9ced8;animation:cur 2.4s ease-in-out infinite}@keyframes cur{0%,100%{opacity:1}50%{opacity:.1}}
.pr{fill:#6b7280}.bg{fill:#08090b;opacity:.88}
.pr,.cur{font-size:12px}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.lf:first-child{opacity:1}.tf{opacity:0}.st{opacity:.5}.sf:first-child{opacity:1}.bub{opacity:0}}
</style>
<defs>${TILES}<radialGradient id="v" cx=".5" cy=".5" r=".75"><stop offset=".25" stop-color="#08090b" stop-opacity=".93"/><stop offset=".62" stop-color="#08090b" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="#08090b"/>
${FIELD}
<g>${STARS}</g>
<rect class="vig" width="${W}" height="${H}" fill="url(#v)"/>
${bubbles.join('')}
${smallEls}
${fishEls}
<rect class="bg" x="32" y="${H - 58}" width="${(PROMPT.length + 2) * 7.2 + 16}" height="26" rx="3"/><text class="pr" x="40" y="${H - 40}">${esc(PROMPT)}</text><text class="cur" x="${40 + PROMPT.length * 7.2}" y="${H - 40}">_</text>
</svg>`

// 注意（2026-11-15 に実機で確認）: デスクトップは背景の SVG を描いた直後だけ動かし、すぐ静止画に差し替えることがある。
// - prefers-reduced-motion 以外の @media や shape-rendering があると止まる（anthropics/claude-code#109770）
// - @media (prefers-reduced-motion: reduce) が1つも無い絵も止まった。下の style にある1行は消さないこと
// 画面の形で変えたいときは @media ではなく入れ子の <svg> で位置を決める。

// 背景は Claude の動きに合わせて差し替える（hooks/register.tsx）。差し替えると絵の中の動きは最初からやり直しになるので、
// すべての動きの開始を --t0 だけずらせるようにしておき、差し替え時に経過秒数を渡して続きから再生する。
function withClock(src) {
  const isTime = t => /^-?[\d.]+m?s$/.test(t)
  let out = src.replace(/animation:([^;}"!]+)/g, (m, body) => {
    const parts = body.trim().split(/\s+/)
    if (parts[0] === 'none') return m
    const times = parts.map((t, i) => (isTime(t) ? i : -1)).filter(i => i >= 0)
    const delay = times.length > 1 ? parts[times[1]] : '0s'
    const rest = times.length > 1 ? parts.filter((_, i) => i !== times[1]) : parts
    return `animation:${rest.join(' ')};animation-delay:calc(var(--t0) + ${delay})`
  })
  out = out.replace(/animation-delay:(-?[\d.]+m?s)/g, 'animation-delay:calc(var(--t0) + $1)')
  return out.replace('<style>', '<style>svg{--t0:0s}')
}
const timed = withClock(svg)

writeFileSync(OUT, `// 生成物。tools/gen-scene.mjs から作る。手で編集しない。\nexport const SCENE = ${JSON.stringify(timed)}\n`)
console.log(`scene.js: ${timed.length} chars (作業中のきらめき約4,800字を足して 127,700 字未満に。資料上の上限 131,072 より手前で実機は静止画に差し替えた)  ループ: ${loopSvg.length} ターン: ${turnSvg.length}`)
