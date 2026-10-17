export default function Loading() {
  return (
    <div className="px-5 pt-16 lg:px-0">
      <div className="skeleton h-10 w-2/3" />
      <div className="skeleton mt-3 h-5 w-1/2" />
      <div className="skeleton mt-8 h-56 w-full rounded-card" />
      <div className="skeleton mt-4 h-24 w-full rounded-card" />
      <div className="skeleton mt-4 h-24 w-full rounded-card" />
    </div>
  );
}
