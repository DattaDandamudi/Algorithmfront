import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1f3a",
          borderRadius: 14,
        }}
      >
        <svg width="44" height="44" viewBox="0 0 32 32" fill="none">
          <path
            d="M10.5 9.5c.6-.6 1.5-.6 2.1 0l2 2.1c.5.6.5 1.4 0 2l-1.2 1.2c.9 1.9 2.5 3.5 4.4 4.4l1.2-1.2c.6-.5 1.4-.5 2 0l2.1 2c.6.6.6 1.5 0 2.1l-1.1 1.1c-1 1-2.5 1.3-3.8.8-4.2-1.6-7.6-5-9.2-9.2-.5-1.3-.2-2.8.8-3.8l.7-.5z"
            fill="#ff6a1a"
          />
          <path d="M19 8.5h5v5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M24 8.5l-5.5 5.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
