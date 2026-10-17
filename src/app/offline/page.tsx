export default function Offline() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-8 text-center">
      <div className="display text-[40px] leading-tight">You're offline</div>
      <p className="mt-3 max-w-sm text-[15px] text-muted">Pages you've opened recently are still available. Your team keeps working on the server and everything will be here when you reconnect.</p>
    </div>
  );
}
