# ADR-0006: First-party, privacy-first analytics

Status: Accepted · Date: 2026-11-06

## Decision
Record listing views, outbound clicks and search impressions in our own `ListingEvent` table,
with a daily-rotating HMAC visitor hash and no stored IP. Roll up nightly into daily tables and
delete raw events after 35 days. Personalisation signals are stored only for signed-in users who
allow history. Developers see aggregates with small-count suppression.

## Consequences
+ Honest metrics ("outbound clicks", not "conversions"), no third-party trackers on listing
  pages, and simpler privacy compliance.
− "Unique visitors" is exact per day only; weekly and monthly uniques are labelled as sums of
  daily uniques.
