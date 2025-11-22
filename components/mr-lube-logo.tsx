export function MrLubeLogo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="bg-primary text-primary-foreground px-3 py-1 rounded-lg font-bold text-lg">Mr. Lube</div>
      <div className="bg-accent text-accent-foreground px-2 py-1 rounded text-sm font-semibold">Training</div>
    </div>
  )
}
