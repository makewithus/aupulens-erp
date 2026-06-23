"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error(error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "sans-serif",
          background: "#0f0f0f",
          color: "#f5f5f5",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
          Application error
        </h1>
        <p style={{ color: "#a0a0a0", maxWidth: "360px" }}>
          A critical error occurred. Please refresh the page.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1.25rem",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: "0.375rem",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
