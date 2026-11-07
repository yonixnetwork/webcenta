import { Star } from "lucide-react";
import { starFills } from "@/lib/ratings";

/** Five stars with partial fill for an average. The accessible label carries the value. */
export function Stars({ value, size = "md", label }: { value: number; size?: "sm" | "md" | "lg"; label?: string }) {
  const cls = size === "lg" ? "size-6" : size === "sm" ? "size-3.5" : "size-4";
  return (
    <span role="img" aria-label={label ?? `${value.toFixed(1)} out of 5 stars`} className="inline-flex items-center gap-0.5">
      {starFills(value).map((f, i) => (
        <span key={i} className={`relative inline-block ${cls}`} aria-hidden>
          <Star className={`absolute inset-0 ${cls} text-subtle`} strokeWidth={1.75} />
          {f > 0 && (
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${f * 100}%` }}>
              <Star className={`${cls} fill-amber-400 text-amber-500`} strokeWidth={1.75} />
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
