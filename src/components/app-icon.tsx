import { cn } from "./ui/cn";

const PALETTE = [
  "from-indigo-500 to-violet-500", "from-sky-500 to-cyan-400", "from-emerald-500 to-teal-400", "from-amber-500 to-orange-400",
  "from-rose-500 to-pink-400", "from-fuchsia-500 to-purple-500", "from-blue-600 to-indigo-400", "from-lime-500 to-green-500",
];

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const SIZES = { sm: "size-10 rounded-xl text-sm", md: "size-14 rounded-2xl text-lg", lg: "size-20 rounded-[1.4rem] text-2xl sm:size-24 sm:text-3xl" };

/** Listing logo from object storage, or a deterministic monogram when none was provided. */
export function AppIcon({ name, storageKey, size = "md" }: { name: string; storageKey?: string | null; size?: keyof typeof SIZES }) {
  const base = process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (storageKey && base) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- media host is configured at runtime
      <img src={`${base}/${storageKey}`} alt="" loading="lazy" decoding="async"
        className={cn("shrink-0 border border-border bg-surface object-cover", SIZES[size])} />
    );
  }
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center bg-gradient-to-br font-bold text-white shadow-inner", PALETTE[hash(name) % PALETTE.length], SIZES[size])}>
      {initials}
    </span>
  );
}
