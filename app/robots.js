// app/robots.js — production robots.txt. Allows public pages, blocks the operator
// panel / API / internal utility pages, and points to the sitemap on medoria.tj.
import { SITE_URL } from "@/lib/seo";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/operator",
          "/operator/",
          "/beauty/operator",
          "/beauty/operator/",
          "/login",
          "/login/",
          "/api/",
          "/*/compare",
          "/*/wishlist",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
