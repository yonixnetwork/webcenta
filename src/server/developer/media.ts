import { db } from "@/server/db";
import { mediaUrl } from "@/server/storage";

export async function revisionMedia(data: { logoAssetId?: string; screenshotAssetIds?: string[] } | null | undefined) {
  const ids = [data?.logoAssetId, ...(data?.screenshotAssetIds ?? [])].filter(Boolean) as string[];
  const assets = ids.length ? await db.mediaAsset.findMany({ where: { id: { in: ids } } }) : [];
  const url = (id: string) => { const a = assets.find((x) => x.id === id); return a ? { id, url: mediaUrl(a.storageKey) } : null; };
  return {
    logo: data?.logoAssetId ? [url(data.logoAssetId)].filter(Boolean) as Array<{ id: string; url: string }> : [],
    screenshots: (data?.screenshotAssetIds ?? []).map(url).filter(Boolean) as Array<{ id: string; url: string }>,
  };
}
