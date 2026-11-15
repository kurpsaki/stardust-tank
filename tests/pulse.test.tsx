import { expect, test } from 'claude-code/testing'

const BACKDROP = {
  plugin: 'stardust-tank',
  component: 'Backdrop',
  requestId: 'backdrop',
  props: { scene: 'stardust-tank', plugin: 'stardust-tank', glass: { blur: 14, opacity: 0.42 } },
} as const

// 背景の SVG の大きさの上限。資料上は 131,072 字だが、実機では 129,992 字の絵が描いた数秒後に静止画へ差し替わり、
// 127,583 字（と 127,681 字）の絵は動き続けた（2026-11-15）。動くと確かめた大きさを上限にする
const SAFE_LENGTH = 127_700

async function sourceOf(ui: { find: (q: { type: 'Svg' }) => Promise<unknown> }): Promise<string> {
  const svg = (await ui.find({ type: 'Svg' })) as { props?: { source?: string } } | undefined

  return svg?.props?.source ?? ''
}

test('送信で波紋の背景になり、ターンが終わると戻る（背景は続きから）', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('theme.set', () => ({ value: { isDrawn: true, requestId: 'backdrop' } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  let now = 1_000_000
  on('clock.now', () => ({ value: now }))
  const logs: string[] = []
  on('ui.log', (_, e) => {
    logs.push(String((e as { text?: unknown }).text))

    return { value: undefined }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const idle = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
  const calm = await sourceOf(idle)
  expect(calm).toContain('--t0:')
  expect(calm).not.toContain('class="rp"')
  expect(calm.length).toBeLessThan(SAFE_LENGTH)
  await idle.unmount()

  now += 42_500 // 背景を出してから 42.5 秒後に送信
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })

  const busy = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
  const working = await sourceOf(busy)
  expect(logs).toEqual([])
  expect(working).toContain('class="rp"')
  // 差し替えても背景の動きは 42.5 秒進んだ所から続く
  expect(working).toContain('svg{--t0:-42.50s}')
  expect(working.length).toBeLessThan(SAFE_LENGTH)
  await busy.unmount()

  now += 10_000
  await $.turn.complete({ answer: 'done', durationMs: 1200, isAborted: false, turnId: 't1', reason: 'answer' })

  const after = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
  const settled = await sourceOf(after)
  expect(settled).not.toContain('class="rp"')
  expect(settled).toContain('svg{--t0:-52.50s}')
  await after.unmount()
})

test('背景を描くのはデスクトップだけ', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...BACKDROP, surface: 'mobile' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

// デスクトップは、<use> を含む背景、1回で終わるアニメを含む背景、prefers-reduced-motion 以外の @media や shape-rendering がある背景、
// そして prefers-reduced-motion の @media が無い背景を、描いた直後に静止画へ差し替える（2026-11-15 に実機で確認、
// anthropics/claude-code#109770）。待機中・作業中どちらの絵もこの条件を満たすこと。
test('背景の絵は、デスクトップが止めない書き方だけで書かれている', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('theme.set', () => ({ value: { isDrawn: true, requestId: 'backdrop' } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('clock.now', () => ({ value: 1_000_000 }))
  on('ui.log', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const sources: string[] = []
  for (const submit of [false, true]) {
    if (submit) {
      await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
    }
    const ui = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
    sources.push(await sourceOf(ui))
    await ui.unmount()
  }

  for (const source of sources) {
    const media = source.match(/@media[^{]*/g) ?? []
    expect(media.length).toBeGreaterThan(0)
    expect(media.filter(rule => !/prefers-reduced-motion/.test(rule))).toEqual([])
    expect(source).not.toContain('shape-rendering')
    // 公式のテーマ例と同じ書き方だけ: <style> は1つ、アニメで動かすのは opacity と transform（と visibility）だけ
    expect(source.match(/<style>/g)?.length).toBe(1)
    // 視差効果を減らす用の指定の中（公式と同じ *{animation:none!important}）は対象外
    const outsideReduced = source.replace(/@media \(prefers-reduced-motion[^{]*\{(?:[^{}]*\{[^{}]*\})*\}/g, '')
    for (const banned of ['!important', 'cubic-bezier', ' both', ' forwards', 'stroke-dasharray']) {
      expect(outsideReduced).not.toContain(banned)
    }
    const animated = new Set<string>()
    for (const block of source.match(/@keyframes [\w-]+\{(?:[^{}]*\{[^{}]*\})*\}/g) ?? []) {
      for (const prop of block.match(/[{;]([a-z-]+):/g) ?? []) {
        animated.add(prop.slice(1, -1))
      }
    }
    // visibility は金魚のコマが透明な間に描かせないため（重いと Mac が忙しいときに背景が止まる）
    expect([...animated].filter(prop => !['opacity', 'transform', 'visibility'].includes(prop))).toEqual([])
    // <use> は一切使わない。含むだけでデスクトップは背景を静止画に差し替える（2026-11-15 に実機で確認）
    expect(source).not.toContain('<use')
    // アニメはすべて繰り返し（infinite）。1回で終わるアニメを含むと、デスクトップは背景を静止画に差し替える（同日に実機で確認）
    const finite = [...outsideReduced.matchAll(/animation:([^;}"]+)/g)].map(m => (m[1] ?? '').trim()).filter(body => body !== 'none' && !/\binfinite\b/.test(body))
    expect(finite).toEqual([])
  }
})
