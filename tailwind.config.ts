import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        raised: v("raised"),
        ink: v("ink"),
        muted: v("muted"),
        faint: v("faint"),
        line: v("line"),
        accent: v("accent"),
        sage: v("sage"),
        rose: v("rose"),
        sky: v("sky"),
      },
      fontFamily: {
        sans: ['"Inter Variable"', "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        display: ['"Instrument Serif"', "ui-serif", "Georgia", "serif"],
        serif: ['"Newsreader Variable"', "ui-serif", "Georgia", "serif"],
      },
      borderRadius: { card: "22px", sheet: "28px" },
      transitionTimingFunction: { ios: "cubic-bezier(0.32, 0.72, 0, 1)" },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
        sheet: { from: { transform: "translateY(100%)" }, to: { transform: "none" } },
        pulse2: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
        shimmer: { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
      },
      animation: {
        rise: "rise .6s cubic-bezier(0.32,0.72,0,1) both",
        fade: "fade .4s ease both",
        sheet: "sheet .45s cubic-bezier(0.32,0.72,0,1) both",
        pulse2: "pulse2 1.6s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
