// app/GlobalStyles.tsx
"use client";

export default function GlobalStyles() {
  return (
    <style jsx global>{`
      /* ===== Brand tokens ===== */
      :root {
        --blue: #0b3d91;          /* Mr. Lube blue */
        --yellow: #ffc20e;        /* Mr. Lube yellow */
        --fg: #1f2937;
        --muted: #6b7280;
        --bg: #f7f7f8;
        --card: #ffffff;
        --border: #e5e7eb;
        --radius: 12px;
        --shadow-sm: 0 1px 2px rgba(0,0,0,.06);
        --shadow-md: 0 2px 6px rgba(0,0,0,.12);
      }

      html, body {
        background: var(--bg);
        color: var(--fg);
        margin: 0;
      }

      /* ============================= */
      /* iOS SAFE AREA (DO NOT REMOVE) */
      /* ============================= */

      .safe-area {
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);
      }

      .pt-safe {
        padding-top: env(safe-area-inset-top);
      }

      /* ===== Common utilities used across dashboards ===== */

      /* spacing / containers */
      .max-w-6xl{max-width:72rem}
      .mx-auto{margin-left:auto;margin-right:auto}
      .px-4{padding-left:1rem;padding-right:1rem}
      .py-6{padding-top:1.5rem;padding-bottom:1.5rem}
      .p-3{padding:.75rem}
      .lg\\:p-4{padding:1rem}
      .pb-2{padding-bottom:.5rem}
      .lg\\:pb-3{padding-bottom:.75rem}
      .mb-3{margin-bottom:.75rem}
      .mt-1{margin-top:.25rem}
      .lg\\:mt-2{margin-top:.5rem}
      .space-y-2>*+*{margin-top:.5rem}
      .space-y-4>*+*{margin-top:1rem}
      .lg\\:space-y-6>*+*{margin-top:1.5rem}

      /* layout */
      .grid{display:grid}
      .grid-cols-1{grid-template-columns:1fr}
      .gap-3{gap:.75rem}
      .lg\\:gap-4{gap:1rem}
      .sm\\:grid-cols-2{grid-template-columns:1fr}
      @media (min-width:640px){.sm\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .lg\\:grid-cols-4{grid-template-columns:1fr}
      @media (min-width:1024px){.lg\\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}}
      .flex{display:flex}
      .flex-col{flex-direction:column}
      .items-center{align-items:center}
      .justify-between{justify-content:space-between}
      .block{display:block}
      .min-w-0{min-width:0}
      .focus\\:outline-none:focus{outline:0}

      /* type / colors */
      .text-2xl{font-size:1.5rem;line-height:2rem}
      .lg\\:text-3xl{font-size:1.875rem;line-height:2.25rem}
      .text-lg{font-size:1.125rem;line-height:1.75rem}
      .text-base{font-size:1rem}
      .text-sm{font-size:.875rem}
      .text-xs{font-size:.75rem}
      .font-bold{font-weight:700}
      .font-semibold{font-weight:600}
      .text-primary{color:var(--blue)}
      .text-muted-foreground{color:var(--muted)}
      .text-black{color:#000}

      /* cards / borders / tints */
      .border{border:1px solid var(--border)}
      .rounded-lg{border-radius:var(--radius)}
      .shadow-sm{box-shadow:var(--shadow-sm)}
      .hover\\:shadow-md:hover{box-shadow:var(--shadow-md)}
      .transition{transition:all .2s ease}
      .opacity-70{opacity:.7}
      .bg-card{background:var(--card)}
      .text-card-foreground{color:var(--fg)}
      .bg-primary\\/10{background:rgba(11,61,145,.10)}
      .border-primary\\/20{border:1px solid rgba(11,61,145,.20)}

      /* brand helpers used in your layouts */
      .bg-primary{background:var(--blue)}
      .text-primary-foreground{color:#fff}
      .hover\\:bg-primary-foreground\\/10:hover{background:rgba(255,255,255,.10)}
      .bg-background{background:var(--bg)}
      .bg-white{background:#fff}

      /* progress bars */
      .h-2{height:.5rem;background:#e5e7eb;border-radius:9999px;overflow:hidden}
      .h-2 > div{height:100%;background:var(--yellow)}

      /* yellow pill badge */
      .badge {
        display:inline-flex;
        align-items:center;
        gap:.375rem;
        padding:.25rem .5rem;
        border-radius:9999px;
        background:var(--yellow);
        color:#111;
        font-weight:600;
        font-size:.875rem;
      }

      /* sidebar helpers */
      .sidebar-base { background: var(--blue); color:#fff; }
      .sidebar-link {
        display:flex;
        align-items:center;
        gap:.5rem;
        padding:.5rem .75rem;
        border-radius:8px;
        color:#fff;
        text-decoration:none;
      }
      .sidebar-link:hover { background: rgba(255,255,255,.10); }
      .sidebar-muted { color: rgba(255,255,255,.85); }

      /* lucide icon sizes */
      .h-5{height:20px}.w-5{width:20px}
      .h-6{height:24px}.w-6{width:24px}
      .h-8{height:32px}.w-8{width:32px}
    `}</style>
  );
}
