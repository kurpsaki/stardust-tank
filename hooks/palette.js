import { makeColors } from './make-colors.js'

// 黒に近い無彩色。面どうしは明度を数%だけ離し、文字は背景の ASCII より常に明るく。
export const { theme, problems } = makeColors({
  label: 'Stardust Tank',
  only: 'dark',
  roles: {
    accent: '#8ab4d6',
    danger: '#e8837c',
    success: '#86c99a',
    warning: '#d9b56a',
    pro: '#b49be0',
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0a0b0e',
        'surface-1': '#0f1115',
        'surface-2': '#13161b',
        'surface-3': '#181b21',
        'text-primary': '#e8eaee',
        'text-secondary': '#bcc1ca',
        'text-muted': '#959ca8',
      },
    },
  },
})
