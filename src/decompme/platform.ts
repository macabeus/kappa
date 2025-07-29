export type PlatformData = {
  id: string;
  compilers: string[];
  presets: Array<{
    id: number;
    name: string;
  }>;
};

export async function fetchPlatform(id: string) {
  const fetchResult = await fetch(`https://decomp.me/api/platform/${id}`);
  if (!fetchResult.ok) {
    throw new Error(`Failed to fetch platform with ID ${id}: ${fetchResult.statusText}`);
  }

  const platformData = (await fetchResult.json()) as PlatformData;
  return platformData;
}
