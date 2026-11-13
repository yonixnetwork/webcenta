/**
 * The published starting versions of Webcenta's policies. They describe what the
 * application actually does (see docs/SETTINGS.md and docs/ARCHITECTURE.md). Administrators
 * publish new versions from Admin → Settings → Ranking, announcements & legal.
 * Plain Markdown: headings, paragraphs, lists, bold and links only.
 */
export const LEGAL_TEXTS: Record<"TERMS_OF_SERVICE" | "PRIVACY_POLICY" | "COOKIE_POLICY" | "CONTENT_POLICY" | "DEVELOPER_AGREEMENT" | "REVIEW_GUIDELINES", { title: string; body: string }> = {
  TERMS_OF_SERVICE: {
    title: "Terms of Service",
    body: `These terms apply when you use Webcenta at webcenta.com, developers.webcenta.com and the Webcenta web app. By using Webcenta you agree to them. If you do not agree, please do not use the service.

## What Webcenta is
Webcenta is a directory of third-party websites and web apps. We describe them, check them for security risks and let people rate and review them. **We do not own or operate the listed websites.** When you leave Webcenta to visit one, that website's own terms and privacy policy apply.

## Who can use Webcenta
- You can browse without an account.
- To create an account you must be at least 13 years old. If you are under the age of majority where you live, you need your parent's or guardian's permission.
- You must give your real date of birth. We use it to show content suitable for your age. Some categories are only available to adults.

## Your account
- Keep your password private. You are responsible for activity on your account.
- Tell us through [Contact & support](/contact) if you think someone else has used your account.
- You can download your data or delete your account at any time from Account → Privacy & data.

## Acceptable use
You must not:
- break the law, or help anyone else to do so;
- post false, misleading, abusive or hateful content, or content that exploits minors;
- write fake reviews, review your own app, or pay or offer incentives for reviews;
- submit phishing, malware, scams or websites that impersonate someone else;
- scrape Webcenta, overload it, test its security without permission, or bypass its limits.

We may remove content, limit features or suspend accounts that break these terms or the [Content Policy](/legal/content).

## Listings and safety checks
We run automated security checks on every listing and re-check listings regularly. Checks reduce risk but **cannot guarantee that a website is safe, legal in your country, or suitable for you.** Use your own judgement, especially before paying, investing, trading or sharing personal information. Webcenta does not give financial, investment, medical or legal advice.

## Your content
You keep ownership of the reviews and other content you post. You give Webcenta a worldwide, non-exclusive, royalty-free licence to host, display and distribute it on Webcenta and in our marketing. This licence ends when you delete the content, except where it has been shared by others or must be kept for legal reasons.

## Intellectual property
Names, logos and screenshots of listed apps belong to their owners and are shown to identify them. If you believe content on Webcenta infringes your rights, contact us through [Contact & support](/contact).

## Availability and changes
We may change, suspend or stop parts of Webcenta at any time. We may update these terms. If a change is significant we will tell you on the website or by email before it takes effect. If you keep using Webcenta after that, you accept the new terms.

## Liability
Webcenta is provided "as is". To the extent the law allows, we are not liable for losses caused by third-party websites, or for indirect or consequential losses. Nothing in these terms limits any rights you have under consumer law that cannot be excluded.

## Contact
Questions about these terms: [Contact & support](/contact).`,
  },

  PRIVACY_POLICY: {
    title: "Privacy Policy",
    body: `This policy explains what personal data Webcenta collects, why, and what you can do about it.

## What we collect
- **Account details:** your name, email address, password (stored only as a secure hash) and date of birth. If you sign in with Google or GitHub, we receive your name, email address and whether the provider has verified it.
- **What you do on Webcenta:** favourites, collections, reviews, reports, support messages and notification settings.
- **Browsing history and interests:** only if you are signed in and leave history turned on (Account → Privacy & data). We use it to recommend apps.
- **Visit statistics:** daily counters made from a one-way code that changes every day. We do not store your IP address in analytics and cannot use them to identify you.
- **Security logs:** sign-in events with IP address and browser, kept to protect accounts and detect abuse.
- **Push notifications:** if you turn them on, your browser gives us a subscription address. We use it only to send Webcenta notifications.
- **Cookies:** see the [Cookie Policy](/legal/cookies).

## Why we use it
- To run your account and the features you use.
- To show content suitable for your age. Your date of birth is never shown to anyone.
- To keep Webcenta safe: preventing spam, fraud and abuse, and checking listings for security risks.
- To send you the emails you need (confirmation, password reset) and notifications you chose.
- To improve Webcenta, using statistics that do not identify you.

Our legal bases are performing our agreement with you, our legitimate interest in running a safe service, your consent (for optional cookies, push notifications and personalisation), and legal obligations.

## Who we share it with
We do not sell personal data. We share it only with:
- our hosting provider (Hostinger), which stores the website, the database and our email;
- Google or GitHub, if you choose to sign in with them;
- Google Analytics or Google AdSense, only if they are enabled and you accept analytics or advertising cookies;
- authorities, when the law requires it.

## How long we keep it
- Account data: while your account exists. After you delete your account, it is removed within 30 days, except what we must keep for legal or security reasons.
- Security logs: up to 12 months.
- Visit statistics: as anonymous totals.

## Your rights
You can see, download, correct or delete your data from Account → Privacy & data, or ask us through [Contact & support](/contact). Depending on where you live, you may also object to or restrict some uses, withdraw consent at any time, and complain to your data protection authority.

## Children
Webcenta accounts are for people aged 13 or older. If you think a younger child has created an account, contact us and we will delete it.

## Changes
We will post any change here, and tell you if a change is significant.

Questions: [Contact & support](/contact).`,
  },

  COOKIE_POLICY: {
    title: "Cookie Policy",
    body: `Cookies are small files that websites store in your browser. Webcenta uses as few as possible.

## Necessary cookies (always on)
- **wc / wcdev:** keep you signed in to webcenta.com or developers.webcenta.com, and protect sign-in against attacks.
- **Admin session:** keeps administrators signed in (admin.webcenta.com only).
- **wc-theme:** remembers light or dark mode.
- **wc-consent:** remembers your cookie choice for 6 months.

The web app also stores a copy of some pages in your browser so it works offline. This copy contains nothing personal.

## Optional cookies (only with your permission)
- **Analytics (Google Analytics):** how pages are used, if enabled by Webcenta.
- **Advertising (Google AdSense):** shows ads and measures them, if enabled by Webcenta.

Our own visit statistics do not use cookies.

## Changing your choice
Use **Cookie settings** at the bottom of any page. You can also delete cookies in your browser's settings.`,
  },

  CONTENT_POLICY: {
    title: "Content Policy",
    body: `This policy applies to listings, reviews, replies, collections and anything else published on Webcenta.

## Not allowed anywhere
- Phishing, malware, unwanted software, scams and fraud, including fake investment, crypto or giveaway schemes.
- Impersonating a person, company or brand, or copying someone else's website.
- Anything that sexualises or exploits minors.
- Illegal goods and services, and content that promotes violence, terrorism or self-harm.
- Hate speech, harassment and threats.
- Sharing other people's personal information without permission.

## Restricted categories
- **Adult content** is only listed if it is legal, and is shown only to signed-in adults. Every listing is reviewed by a moderator.
- **Finance, trading, crypto and forex** listings are reviewed by a moderator. Brokers, exchanges and similar services may have to prove they hold the licence their country requires. Webcenta does not recommend any investment.
- **Gambling and betting** are only allowed where they are licensed, and are hidden from minors and from some countries.
- **Services for children** have extra checks to protect children's data.

## Reviews
Reviews must be honest and based on your own experience. See the [Review Guidelines](/legal/reviews).

## How we enforce this
We use automated checks, user reports and moderators. We may hide, remove or restrict content, or suspend accounts and developers. You can appeal a decision; a different moderator reviews appeals.

Report anything that breaks this policy with the **Report** button on the page, or through [Contact & support](/contact).`,
  },

  DEVELOPER_AGREEMENT: {
    title: "Developer Agreement",
    body: `This agreement applies when you list a website or web app on Webcenta through the developer portal (developers.webcenta.com).

## Your listings
- Only submit websites you own or are authorised to represent. We may ask you to prove domain ownership.
- Descriptions, screenshots and pricing must be accurate and kept up to date.
- Your website must have a privacy policy that covers it, and terms of use where you offer accounts or payments.
- Regulated services (finance, trading, crypto, forex, gambling, medical) must hold the licences their markets require. We may ask for evidence.

## Checks and moderation
Every submission and update goes through automated security checks, and moderators review many of them. We re-check published listings regularly. We may reject, suspend or remove a listing that fails checks, changes its purpose, or breaks the [Content Policy](/legal/content). You can appeal.

## Reviews and data
You may reply to reviews publicly and respectfully. You must not post or buy reviews. Analytics in the developer portal are aggregated and contain no personal data about visitors.

## Fees
Listing on Webcenta is currently free. Paying for promotion never bypasses moderation.

## Ending this agreement
You can remove your listings at any time. We may end this agreement if you break it.`,
  },

  REVIEW_GUIDELINES: {
    title: "Review Guidelines",
    body: `Reviews help people choose. Please keep them useful and fair.

- Review only apps you have used yourself.
- Explain what was good or bad. Be specific.
- Do not review an app you build, work for or compete with.
- Do not post or accept reviews in exchange for money, discounts or other rewards.
- No personal attacks, hate, spam, links to unrelated sites or other people's personal information.
- Report security problems with the **Report** button instead of in a review.

We may hide reviews that break these guidelines. If your review was removed, you can appeal from your account.`,
  },
};
