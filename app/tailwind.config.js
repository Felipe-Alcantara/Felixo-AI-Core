/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        shell: '0 22px 70px rgba(0, 0, 0, 0.42)',
        soft: '0 14px 36px rgba(0, 0, 0, 0.20)',
      },
    },
  },
  plugins: [],
}
