export default function Loading() {
  return (
    <div className="space-y-4" aria-label="Loading">
      <div className="h-8 w-52 animate-pulse bg-[#dce1dc]" />
      <div className="h-32 animate-pulse border border-[#dce1dc] bg-white" />
    </div>
  );
}
