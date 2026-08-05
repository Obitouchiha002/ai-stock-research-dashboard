import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://stockanalytix.vercel.app/sitemap.xml",
    host: "https://stockanalytix.vercel.app",
  };
}
