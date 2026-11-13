"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "./cn";
import { inputClass } from "./form";

/**
 * Password field with a show/hide button. Hidden by default; the button is a real, focusable
 * toggle (aria-pressed) whose name says what it does. Validation attributes pass through unchanged.
 */
export function PasswordInput({ className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Hide password" : "Show password";
  return (
    <span className="relative block">
      <input {...props} type={visible ? "text" : "password"} className={cn(inputClass, "pr-11", className)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" title={label} aria-pressed={visible} onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-muted hover:text-text focus-visible:text-text">
        {visible ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
      </button>
    </span>
  );
}
