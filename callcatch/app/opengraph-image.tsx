import { ImageResponse } from "next/og";

export const alt = "CallCatch — Every missed call texts back in 10 seconds";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAVY = "#0b1f3a";
const NAVY_DEEP = "#061224";
const ORANGE = "#ff6a1a";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: ORANGE,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            C
          </div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>
            Call<span style={{ color: ORANGE }}>Catch</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 1000 }}>
            Every missed call texts back in 10 seconds.
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#d8e2f2", maxWidth: 980, lineHeight: 1.3 }}>
            AI front desk for HVAC, plumbing and electrical contractors. Keep your number. Set up in 10 minutes.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 14 }}>
            {["No number change", "STOP honored", "$79/mo"].map((t) => (
              <div key={t} style={{ display: "flex", padding: "10px 18px", borderRadius: 999, background: "rgba(255,255,255,0.10)", fontSize: 24, color: "#eef3fa" }}>
                {t}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", padding: "14px 26px", borderRadius: 16, background: ORANGE, fontSize: 26, fontWeight: 700 }}>callcatch.co</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
