import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "rgb(var(--color-ink-950) / <alpha-value>)",
          900: "rgb(var(--color-ink-900) / <alpha-value>)",
          700: "rgb(var(--color-ink-700) / <alpha-value>)"
        },
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        moss: {
          500: "rgb(var(--color-moss-500) / <alpha-value>)",
          600: "rgb(var(--color-moss-600) / <alpha-value>)",
          700: "rgb(var(--color-moss-700) / <alpha-value>)"
        }
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Satoshi", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "JetBrains Mono", "monospace"]
      },
      boxShadow: {
        diffusion: "0 24px 70px -38px rgba(35,33,29,0.35)"
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" }
        },
        reveal: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        shimmer: "shimmer 1.6s ease-in-out infinite",
        float: "float 5s ease-in-out infinite",
        reveal: "reveal 0.55s cubic-bezier(0.16,1,0.3,1) both"
      }
    }
  },
  plugins: []
};

export default config;
