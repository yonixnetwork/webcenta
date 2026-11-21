/** Reasons a visitor can give when reporting an ad (Report this ad). */
export const AD_REPORT_REASONS = [
  ["inappropriate", "Inappropriate or adult content"],
  ["gambling", "Gambling, betting or high-risk finance"],
  ["misleading", "Misleading, fake download button or fake warning"],
  ["malware", "Malware, phishing or a scam"],
  ["intrusive", "Covers content, redirects or opens pop-ups"],
  ["other", "Something else"],
] as const;
