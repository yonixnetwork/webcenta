import { GridSkeleton } from "@/components/states";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-8 w-60 rounded-lg" />
      <GridSkeleton count={6} />
    </div>
  );
}
