import "server-only";
import { Channel3, type Channel3Api } from "@channel3/sdk";
import type { Checkout } from "./guard";
import { cents, normShop } from "./guard";
import { countChannel3Call } from "./limits";
import { cleanDomain, cleanLine, httpsUrl } from "./sanitize";

// Channel3 searches real products across real online shops.
// We keep only the fields the agent and the guard need, cleaned: everything
// here was written by a shop and is shown to Claude and on the page.

export interface Product {
  id: string;
  title: string;
  brand: string | null;
  image: string | null;
  priceCents: number;
  currency: string;
  shop: string;
  url: string;
  inStock: boolean;
  rating: number | null;
  ratingCount: number | null;
  features: string[];
}

let client: Channel3 | null = null;

function channel3(): Channel3 {
  if (!client) {
    const apiKey = process.env.CHANNEL3_API_KEY;
    if (!apiKey) throw new Error("CHANNEL3_API_KEY must be set");
    client = new Channel3({ apiKey });
  }
  return client;
}

type RawProduct = Channel3Api.Product;

function toProduct(p: RawProduct): Product | null {
  // Pick the cheapest offer in dollars that is in stock, else the cheapest one.
  const offers = (p.offers ?? []).filter(
    (o) => o.price?.currency?.toUpperCase() === "USD" && Number.isFinite(o.price.price) && o.price.price > 0,
  );
  if (!offers.length) return null;
  const sorted = [...offers].sort((a, b) => a.price.price - b.price.price);
  const offer = sorted.find((o) => o.availability === "InStock") ?? sorted[0];
  const url = httpsUrl(offer.url);
  const shop = cleanDomain(offer.domain);
  const title = cleanLine(p.title, 200);
  if (!url || !shop || !title) return null;
  const image = p.images?.find((i) => i.is_main_image) ?? p.images?.[0];
  return {
    id: cleanLine(p.id, 100),
    title,
    brand: cleanLine(p.brands?.[0]?.name, 80) || null,
    image: httpsUrl(image?.url),
    priceCents: cents(offer.price.price),
    currency: "USD",
    shop,
    url,
    inStock: offer.availability === "InStock",
    rating: typeof p.ratings?.value === "number" ? p.ratings.value : null,
    ratingCount: typeof p.ratings?.count === "number" ? p.ratings.count : null,
    features: (p.key_features ?? []).slice(0, 4).map((f) => cleanLine(f, 160)).filter(Boolean),
  };
}

export async function searchProducts(query: string, maxPrice: number | null, limit = 8): Promise<Product[]> {
  countChannel3Call();
  const page = await channel3().products.search({
    query,
    limit,
    filters: {
      availability: ["InStock"],
      ...(maxPrice ? { price: { max_price: maxPrice } } : {}),
    },
  });
  const products: Product[] = [];
  for (const raw of page.data) {
    const p = toProduct(raw);
    if (p) products.push(p);
  }
  return products;
}

// The guard's second look: fetch the product page again just before paying.
export async function recheck(product: Product): Promise<Checkout> {
  try {
    countChannel3Call();
    const { product: fresh } = await channel3().products.lookup({ url: product.url });
    const offer = fresh.offers?.find((o) => normShop(o.domain) === product.shop) ?? fresh.offers?.[0];
    if (!offer) return { priceCents: null, currency: null, inStock: null };
    return {
      priceCents: cents(offer.price.price),
      currency: offer.price.currency,
      inStock: offer.availability === "InStock",
    };
  } catch {
    return { priceCents: null, currency: null, inStock: null };
  }
}
