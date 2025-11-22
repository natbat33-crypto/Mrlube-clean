
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx,js,jsx,mdx}",
    "./components/**/*.{ts,tsx,js,jsx,mdx}",
    "./pages/**/*.{ts,tsx,js,jsx,mdx}",
    "./src/**/*.{ts,tsx,js,jsx,mdx}",
  ],

  // ✅ Force-emit critical classes so prod styling can't be purged
  safelist: [
    // global theme tokens
    "bg-background","text-foreground",
    "text-primary","bg-primary","border-primary","text-primary-foreground","bg-primary/10","border-primary/20",
    "text-muted-foreground","border-border",

    // layout utilities used in your markup
    "max-w-6xl","mx-auto","px-4","lg:px-6","py-6",
    "grid","gap-3","lg:gap-4","grid-cols-1","sm:grid-cols-2","lg:grid-cols-4",
    "opacity-70",

    // shadcn/ui + progress customization
    "h-2","[&>div]:bg-yellow-400",

    // common text/rounded/shadow helpers
    "rounded","rounded-xl","rounded-full","shadow","hover:shadow-md","transition",
    "text-xs","text-sm","text-base","text-lg","text-xl","font-bold",

    // dark mode token
    "dark",
  ],

  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        popover: "var(--popover)",
        "popover-foreground": "var(--popover-foreground)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        secondary: "var(--secondary)",
        "secondary-foreground": "var(--secondary-foreground)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        accent: "var(--accent)",
        "accent-foreground": "var(--accent-foreground)",
        destructive: "var(--destructive)",
        "destructive-foreground": "var(--destructive-foreground)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        sidebar: "var(--sidebar)",
        "sidebar-foreground": "var(--sidebar-foreground)",
        "sidebar-primary": "var(--sidebar-primary)",
        "sidebar-primary-foreground": "var(--sidebar-primary-foreground)",
        "sidebar-accent": "var(--sidebar-accent)",
        "sidebar-accent-foreground": "var(--sidebar-accent-foreground)",
        "sidebar-border": "var(--sidebar-border)",
        "sidebar-ring": "var(--sidebar-ring)",
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace','SFMono-Regular','Consolas','Menlo','monospace'],
      },
    },
  },
  plugins: [],
};
