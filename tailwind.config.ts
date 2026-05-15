import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // Brand Visual Guide §3 — Poppins body, Futura PT display
        // (Jost ships as the free near-equivalent until license acquired).
        sans: ["Poppins", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ['"Futura PT"', "Jost", "Poppins", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      transitionDuration: {
        quick: "150ms",
        standard: "200ms",
        emphasized: "300ms",
      },
      spacing: {
        "space-1": "0.25rem",
        "space-2": "0.5rem",
        "space-3": "0.75rem",
        "space-4": "1rem",
        "space-6": "1.5rem",
        "space-8": "2rem",
        "space-12": "3rem",
        "space-16": "4rem",
        // CSS-COMPAT: iOS notch / home-indicator safe-area tokens.
        // Use as `pt-safe-t`, `pb-safe-b`, `pl-safe-l`, `pr-safe-r`
        // in addition to the .pt-safe / .pb-safe utility classes in index.css.
        "safe-t": "env(safe-area-inset-top)",
        "safe-b": "env(safe-area-inset-bottom)",
        "safe-l": "env(safe-area-inset-left)",
        "safe-r": "env(safe-area-inset-right)",
      },
      // CSS-COMPAT D1: dynamic viewport units (iOS Safari URL-bar safe).
      // Fallback to 100vh provided by `@supports not (height: 100dvh)` in index.css.
      height: { dvh: "100dvh", svh: "100svh", lvh: "100lvh" },
      minHeight: { dvh: "100dvh", svh: "100svh", lvh: "100lvh" },
      maxHeight: { dvh: "100dvh", svh: "100svh", lvh: "100lvh" },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          /* WCAG-AAA-safe text variant for inline links / link buttons. */
          text: "hsl(var(--primary-text))",
          hover: "hsl(var(--primary-hover))",
        },
        // Brand Visual Guide §1 — exact-spec brand surfaces.
        "brand-navy": "hsl(var(--brand-navy))",
        "brand-mint": "hsl(var(--brand-mint))",
        "surface-alt": "hsl(var(--surface-alt))",
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        // Tech Fleet Brand Guide §6.2 — growth (green, healing/harmony)
        // reserved for celebratory positive states. Authority graphite for
        // dark surfaces. Use semantic tokens; never raw hex in components.
        growth: {
          DEFAULT: "hsl(var(--growth))",
          foreground: "hsl(var(--growth-foreground))",
        },
        graphite: {
          DEFAULT: "hsl(var(--graphite))",
          foreground: "hsl(var(--graphite-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in-right": "slide-in-right 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
