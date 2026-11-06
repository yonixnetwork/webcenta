import { icons, type LucideProps } from "lucide-react";

/** Renders a lucide icon by name (server component; unknown names fall back). */
export function CategoryIcon({ icon: name, ...props }: { icon: string | null | undefined } & Omit<LucideProps, "name">) {
  const Icon = (name && icons[name as keyof typeof icons]) || icons.LayoutGrid;
  return <Icon aria-hidden {...props} />;
}
