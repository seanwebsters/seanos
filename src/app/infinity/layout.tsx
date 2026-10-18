export default function InfinityLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] opacity-70" style={{ background: "radial-gradient(60% 50% at 30% 0%, rgb(var(--accent) / 0.16), transparent 70%), radial-gradient(50% 40% at 85% 10%, rgb(var(--sky) / 0.14), transparent 70%)" }} />
      {children}
    </div>
  );
}
