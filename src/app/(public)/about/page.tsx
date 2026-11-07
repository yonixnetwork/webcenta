import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Webcenta",
  description: "What Webcenta is, how listings are added and checked, and how rankings work.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  const h2 = "mt-8 text-xl font-bold";
  return (
    <article className="mx-auto max-w-2xl text-pretty leading-relaxed text-muted [&_strong]:text-text">
      <h1 className="text-3xl font-extrabold tracking-tight text-text">About Webcenta</h1>
      <p className="mt-4">Webcenta is a discovery marketplace for websites, web applications and online services. We help you find, compare and safely visit apps from around the world.</p>
      <h2 className={`${h2} text-text`}>Who lists apps</h2>
      <p className="mt-2">Listings are either submitted by developers (after verification and review) or added by Webcenta editors. Editorial listings always credit the <strong>original publisher</strong>. Webcenta does not claim to own or build them, and developers can claim their listing after proving they own the domain.</p>
      <h2 className={`${h2} text-text`}>How listings are checked</h2>
      <p className="mt-2">Nothing is published just because it was submitted. Listings are reviewed, and higher-risk categories (such as finance, crypto, gambling and adult services) need extra checks or remain unavailable until legal requirements have been reviewed. Automated security checks run before publication and again periodically. <strong>Passing a check is not a guarantee that a website is safe</strong>: always check the address before entering passwords or payment details.</p>
      <h2 className={`${h2} text-text`}>Rankings and sponsorship</h2>
      <p className="mt-2">Organic rankings are based on relevance and on-platform signals. Any paid placement will always be labelled <strong>“Sponsored”</strong> and never changes organic ranking or search order.</p>
      <h2 className={`${h2} text-text`}>Privacy</h2>
      <p className="mt-2">You can browse without an account. We count visits and outbound clicks using short-lived anonymous identifiers, do not use third-party advertising trackers, and never show your browsing to developers.</p>
    </article>
  );
}
