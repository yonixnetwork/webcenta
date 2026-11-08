import { icons, type LucideProps } from "lucide-react";

/**
 * Renders a category's visual: its emoji when one is set and `preferEmoji` is
 * requested, otherwise a lucide icon by name (unknown names fall back).
 * Decorative only: the category name is always shown as text next to it.
 */
export function CategoryIcon({
  icon: name,
  emoji,
  preferEmoji = false,
  ...props
}: { icon: string | null | undefined; emoji?: string | null; preferEmoji?: boolean } & Omit<LucideProps, "name">) {
  if (preferEmoji && emoji) {
    return (
      <span aria-hidden className={`leading-none ${props.className ?? ""}`}>
        {emoji}
      </span>
    );
  }
  const Icon = (name && icons[name as keyof typeof icons]) || icons.LayoutGrid;
  return <Icon aria-hidden {...props} />;
}
