export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <defs>
          <linearGradient id="wc-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6366f1" />
            <stop offset="1" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#wc-g)" />
        <path d="M8 11l3 10 3-7 2 0 3 7 3-10" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-lg font-extrabold tracking-tight">Web<span className="text-brand">Center</span></span>
    </span>
  );
}
