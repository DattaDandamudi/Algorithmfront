import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.appUrl();
  const now = new Date();
  const pages: { path: string; priority: number; changeFrequency: "weekly" | "monthly" }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
    { path: "/demo", priority: 0.8, changeFrequency: "monthly" },
    { path: "/for/hvac", priority: 0.8, changeFrequency: "monthly" },
    { path: "/for/plumbing", priority: 0.8, changeFrequency: "monthly" },
    { path: "/for/electrical", priority: 0.8, changeFrequency: "monthly" },
    { path: "/terms", priority: 0.3, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "monthly" },
    { path: "/sms-terms", priority: 0.3, changeFrequency: "monthly" },
    { path: "/refund", priority: 0.3, changeFrequency: "monthly" },
    { path: "/data-deletion", priority: 0.3, changeFrequency: "monthly" },
  ];
  return pages.map((p) => ({ url: `${base}${p.path}`, lastModified: now, changeFrequency: p.changeFrequency, priority: p.priority }));
}
