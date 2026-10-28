import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers, Sidebar, TabBar, OnlineBadge } from "@/components/client";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";

export const metadata: Metadata = {
  title: "Life HQ",
  description: "Your personal assistant.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Life HQ", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#f6f2ea" },
  ],
};

export const dynamic = "force-dynamic";

async function counts() {
  try {
    await ensureBootstrapped();
    const db = getDb();
    const ventures = (await db.list("ventures")).filter((v) => v.stage !== "archived" && !v.merged_into).sort((a, b) => b.priority - a.priority || a.created_at.localeCompare(b.created_at)).map((v) => ({ id: v.id, name: v.name }));
    return { approvals: await db.count("approvals", { status: "pending" }), unread: await db.count("notifications", { read: false }), ventures };
  } catch {
    return { approvals: 0, unread: 0, ventures: [] };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  const c = await counts();
  return (
    <html lang="en-GB" data-theme={theme === "dark" || theme === "light" ? theme : undefined} suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <Providers>
          <OnlineBadge />
          <Sidebar badge={c.approvals} unread={c.unread} ventures={c.ventures} />
          <main className="pb-tabbar lg:pl-64">
            <div className="page-shell mx-auto max-w-[720px] lg:max-w-[1040px] lg:px-10">{children}</div>
          </main>
          <TabBar badge={c.approvals} />
        </Providers>
      </body>
    </html>
  );
}
