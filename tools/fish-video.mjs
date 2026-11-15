// 金魚の動画2本を ASCII のコマにして tools/fish-frames.json に書き出す。
//   node tools/fish-video.mjs <ループ動画> <ターン動画>
// 動画は黒背景に金魚1匹（右向き）。ループ動画は尾を振り続けるもの、
// ターン動画は右向きから左向きへ振り返るもの。動画そのものはリポジトリに入れない。
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [LOOP, TURN] = process.argv.slice(2)
if (!LOOP || !TURN) {
  console.error('usage: node tools/fish-video.mjs <loop.mp4> <turn.mp4>')
  process.exit(1)
}
const OUT = fileURLToPath(new URL('./fish-frames.json', import.meta.url))

// 文字の格子。表示は 6px の等幅（1文字 3.6px × 行 6px。行のすき間を詰めて縞に見せない）。細かいほど綺麗だが、背景と容量を分け合う
const COLS = 116
const ROWS = 48
const ASPECT = (ROWS * 6) / (COLS * 3.6) // 切り抜く枠の 高さ/幅

const VW = 640
const VH = 360
const FPS = 24

function decode(path) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-vf', `scale=${VW}:${VH}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
    maxBuffer: 1 << 30,
  })
  const size = VW * VH * 3
  return { buf, n: buf.length / size, at: i => buf.subarray(i * size, (i + 1) * size) }
}

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const LIT = 22 // これより暗い画素は背景

function bbox(px) {
  let x0 = VW, x1 = 0, y0 = VH, y1 = 0, sx = 0, sy = 0, m = 0
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const k = (y * VW + x) * 3
      if (luma(px[k], px[k + 1], px[k + 2]) > LIT) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
        sx += x
        sy += y
        m++
      }
    }
  }
  return { x0, x1, y0, y1, cx: sx / m, cy: sy / m, area: m }
}

// 明るさの段の文字。横線（- =）は縞に見えるので使わない
const RAMP = " .:;+*x%#@"

// 1コマを格子に落とす。枠 (fx, fy, fw) の中を COLS×ROWS に区切り、区画ごとの平均色を使う。
function toAscii(px, fx, fy, fw, cols = COLS, rows = ROWS) {
  const fh = fw * ((rows * 6) / (cols * 3.6))
  const g = []
  const t = []
  for (let r = 0; r < rows; r++) {
    let gl = ''
    let tl = ''
    for (let c = 0; c < cols; c++) {
      const ax = fx + (c / cols) * fw
      const bx = fx + ((c + 1) / cols) * fw
      const ay = fy + (r / rows) * fh
      const by = fy + ((r + 1) / rows) * fh
      let R = 0, G = 0, B = 0, n = 0
      for (let y = Math.floor(ay); y < Math.ceil(by); y++) {
        for (let x = Math.floor(ax); x < Math.ceil(bx); x++) {
          if (x < 0 || y < 0 || x >= VW || y >= VH) {
            n++
            continue
          }
          const k = (y * VW + x) * 3
          R += px[k]
          G += px[k + 1]
          B += px[k + 2]
          n++
        }
      }
      R /= n
      G /= n
      B /= n
      const L = luma(R, G, B)
      if (L < 16) {
        gl += ' '
        tl += ' '
        continue
      }
      const v = Math.min(1, Math.max(0, (L - 16) / 150)) ** 0.75
      gl += RAMP[Math.max(1, Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1))))]
      // 色の段: 赤（ひれ・縁）/ 橙（体）/ 金（光の当たる所）
      const warm = G / Math.max(1, R)
      tl += warm > 0.62 && L > 110 ? 'y' : warm > 0.36 ? 'o' : 'r'
    }
    g.push(gl.replace(/\s+$/, ''))
    t.push(tl.replace(/\s+$/, ''))
  }
  return { g, t }
}

// ---- ループ: 尾が1往復して元に戻る 41 コマ（1.71秒）を 7 コマに間引く
const LOOP_START = 21
const LOOP_LEN = 41
const LOOP_FRAMES = 7
const loop = decode(LOOP)
const loopIdx = Array.from({ length: LOOP_FRAMES }, (_, k) => LOOP_START + Math.round((k * LOOP_LEN) / LOOP_FRAMES))
// 魚の重心が枠の中心に来るように切り抜く。ループとターンで同じ基準にすると、切り替わりで魚の位置が飛ばない
// （ターンが変に見えた原因: 以前はループは外接枠、ターンは全コマの外接枠の中心で切り抜いていて、位置がずれていた）
const s0 = bbox(loop.at(LOOP_START))
const s1 = bbox(loop.at(LOOP_START + LOOP_LEN))
const loopCropW = Math.max(...loopIdx.map(i => bbox(loop.at(i))).map(b => b.x1 - b.x0)) / 0.84
const loopFrames = loopIdx.map((i, k) => {
  // 区間の初めと終わりで魚が少しずれるので、その分を直線で打ち消して継ぎ目をなくす
  const f = k / LOOP_FRAMES
  const cx = s0.cx + (s1.cx - s0.cx) * f
  const cy = s0.cy + (s1.cy - s0.cy) * f
  return toAscii(loop.at(i), cx - loopCropW / 2, cy - (loopCropW * ASPECT) / 2, loopCropW)
})

// ---- ターン: 0.6〜5.0 秒の振り返りを 8 コマに。各コマの重心（前後のコマで平均してぶれを抑える）を枠の中心にする
const TURN_FROM = Math.round(0.6 * FPS)
const TURN_TO = Math.round(5.0 * FPS)
const TURN_FRAMES = 8
const turn = decode(TURN)
const turnIdx = Array.from({ length: TURN_FRAMES }, (_, k) => TURN_FROM + Math.round((k * (TURN_TO - TURN_FROM)) / (TURN_FRAMES - 1)))
const cents = new Map()
for (let i = Math.max(0, TURN_FROM - 6); i <= Math.min(turn.n - 1, TURN_TO + 6); i++) cents.set(i, bbox(turn.at(i)))
const smooth = i => {
  let sx = 0, sy = 0, n = 0
  for (let j = i - 6; j <= i + 6; j++) {
    const b = cents.get(j)
    if (b) { sx += b.cx; sy += b.cy; n++ }
  }
  return { cx: sx / n, cy: sy / n }
}
// ループの魚と同じ大きさに見えるよう、魚の大きさの比で枠の幅を決める。振り返りの最初と最後でそれぞれ合わせ、
// 途中は少しずつ変える（最後だけ合っていないと、左向きの泳ぎに戻る瞬間に魚の大きさが変わって見えた）
// 長さ（外接枠の幅）ではなく写っている面積でそろえる。2本の動画は体と尾の比率が違い、長さを合わせても体の大きさが合わなかった
const loopArea = loopIdx.map(i => bbox(loop.at(i)).area).reduce((a, b) => a + b, 0) / loopIdx.length
const areaAt = i => cents.get(i).area
const cropFrom = loopCropW * Math.sqrt(areaAt(TURN_FROM) / loopArea)
const cropTo = loopCropW * Math.sqrt(areaAt(TURN_TO) / loopArea)
const turnFrames = turnIdx.map((i, k) => {
  const c = smooth(i)
  const w = cropFrom + (cropTo - cropFrom) * (k / (TURN_FRAMES - 1))
  return toAscii(turn.at(i), c.cx - w / 2, c.cy - (w * ASPECT) / 2, w)
})
const turnSecs = (TURN_TO - TURN_FROM) / FPS

// ---- 小さい金魚: 同じループを別の格子で。大きい金魚の絵を <use> で使い回すとデスクトップが背景を止め、
// 丸ごと複製すると文字数の上限を超えるので、小さく表示する前提のコマを別に作る。
// 粗い格子（40×17）だと文字が大きい金魚と同じ大きさで粗く見えるので、細かい格子を小さい文字で描く
const SMALL_COLS = 60
const SMALL_ROWS = 25
const SMALL_FRAMES = 4 // 小さく表示するので、コマ数より格子の細かさに文字数を回す
const smallIdx = Array.from({ length: SMALL_FRAMES }, (_, k) => LOOP_START + Math.round((k * LOOP_LEN) / SMALL_FRAMES))
const smallFrames = smallIdx.map((i, k) => {
  const f = k / SMALL_FRAMES
  const cx = s0.cx + (s1.cx - s0.cx) * f
  const cy = s0.cy + (s1.cy - s0.cy) * f
  const asp = (SMALL_ROWS * 6) / (SMALL_COLS * 3.6)
  return toAscii(loop.at(i), cx - loopCropW / 2, cy - (loopCropW * asp) / 2, loopCropW, SMALL_COLS, SMALL_ROWS)
})

writeFileSync(
  OUT,
  JSON.stringify({ cols: COLS, rows: ROWS, loop: { secs: LOOP_LEN / FPS, frames: loopFrames }, turn: { secs: turnSecs, frames: turnFrames }, small: { cols: SMALL_COLS, rows: SMALL_ROWS, frames: smallFrames } }),
)
console.log(`loop ${loopFrames.length} frames / ${(LOOP_LEN / FPS).toFixed(2)}s, turn ${turnFrames.length} frames / ${turnSecs.toFixed(2)}s`)
for (const k of [0, LOOP_FRAMES - 1]) console.log(loopFrames[k].g.join('\n') + '\n----')
for (const k of [0, TURN_FRAMES >> 1, TURN_FRAMES - 1]) console.log(turnFrames[k].g.join('\n') + '\n----')
