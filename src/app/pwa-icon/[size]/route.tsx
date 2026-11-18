import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

/** PNG app icons for the PWA manifest and iOS home screen. */
export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size: raw } = await ctx.params;
  const size = Number(raw);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", background: "#2f7f7a", alignItems: "center", justifyContent: "center" }}>
        <svg width={size} height={size} viewBox="0 0 40 40">
          <path
            d="M20 30.5c-.5 0-1-.2-1.4-.5C13.4 25.8 10 22.6 10 18.4 10 15.4 12.3 13 15.2 13c1.9 0 3.5 1 4.8 2.7C21.3 14 22.9 13 24.8 13c2.9 0 5.2 2.4 5.2 5.4 0 4.2-3.4 7.4-8.6 11.6-.4.3-.9.5-1.4.5Z"
            fill="#f7f5f0"
          />
          <path d="M15 19.5c1.6 2.2 3.3 3.3 5 3.3s3.4-1.1 5-3.3" stroke="#7d9a78" strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
