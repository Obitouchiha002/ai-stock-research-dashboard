import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://stockanalytix.vercel.app";
  const routes = [
    "", "/dashboard", "/analyze", "/charts", "/markets", "/watchlist",
    "/portfolio", "/combos", "/ai-chat", "/news", "/screener", "/journal", "/html-reports",
  ];
  const now = new Date();
  return routes.map((r) => ({
    url: `${base}${r}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: r === "" || r === "/dashboard" ? 1 : 0.7,
  }));
}
