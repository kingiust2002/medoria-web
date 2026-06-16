import GatewayScroll from "@/components/gateway/GatewayScroll";

// Test-only preview of the scroll gateway. noindex/nofollow: these hero assets
// are temporary and watermarked (Higgsfield free plan) — keep them out of search.
export const metadata = { robots: { index: false, follow: false } };

export default function TestGatewayPage() {
  return <GatewayScroll />;
}
