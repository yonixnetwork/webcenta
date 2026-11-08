/** Social sign-in providers Webcenta supports (enabled per deployment in Admin → Settings). */
export type SocialProvider = "google" | "apple" | "github" | "microsoft";
export const PROVIDER_LABEL: Record<SocialProvider, string> = { google: "Google", apple: "Apple", github: "GitHub", microsoft: "Microsoft" };
