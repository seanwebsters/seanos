import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-8 text-center">
      <div className="display text-[40px]">Not here</div>
      <p className="mt-2 text-[15px] text-muted">That item may have been removed.</p>
      <Link href="/" className="btn-primary mt-5">Home</Link>
    </div>
  );
}
