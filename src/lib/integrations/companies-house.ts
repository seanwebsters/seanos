import "server-only";
import { BlockedError } from "@/lib/ai/errors";
import { getCredential } from "./vault";

export interface CompanyHit { name: string; number: string; status: string; created: string | null; address: string; url: string }

/** UK Companies House search (free API key from developer.company-information.service.gov.uk). */
export async function searchCompanies(q: string): Promise<CompanyHit[]> {
  const key = await getCredential("companies_house", process.env.COMPANIES_HOUSE_API_KEY);
  if (!key) throw new BlockedError("COMPANIES_HOUSE_API_KEY", "Connect a Companies House API key in Founder OS → Settings to check UK company names.");
  const res = await fetch(`https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=10`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 401) throw new BlockedError("COMPANIES_HOUSE_API_KEY", "Companies House rejected the API key.");
  if (!res.ok) throw new Error(`Companies House returned ${res.status}`);
  const j = (await res.json()) as { items?: { title: string; company_number: string; company_status: string; date_of_creation?: string; address_snippet?: string; links?: { self?: string } }[] };
  return (j.items ?? []).map((i) => ({ name: i.title, number: i.company_number, status: i.company_status, created: i.date_of_creation ?? null, address: i.address_snippet ?? "", url: `https://find-and-update.company-information.service.gov.uk/company/${i.company_number}` }));
}
