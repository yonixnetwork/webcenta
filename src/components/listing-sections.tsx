import type { ListingCard } from "@/server/catalog/listings";
import { Rail } from "./rail";

export function RelatedRails({ groups, name }: {
  name: string;
  groups: { similar: ListingCard[]; competitors: ListingCard[]; freeAlternatives: ListingCard[]; openSourceAlternatives: ListingCard[]; betterRated: ListingCard[] };
}) {
  return (
    <>
      {groups.competitors.length > 0 && <Rail title="Competitors" items={groups.competitors} />}
      {groups.freeAlternatives.length > 0 && <Rail title={`Free alternatives to ${name}`} items={groups.freeAlternatives} />}
      {groups.openSourceAlternatives.length > 0 && <Rail title="Open-source alternatives" items={groups.openSourceAlternatives} />}
      {groups.betterRated.length > 0 && <Rail title="Better-rated alternatives" items={groups.betterRated} />}
      {groups.similar.length > 0 && <Rail title="Similar apps" items={groups.similar} />}
    </>
  );
}
