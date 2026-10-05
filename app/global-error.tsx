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
    // Since global-error catches root layout errors, it might not have toast available.
    // Use standard alert if needed or just a small inline message, but they requested organized toast error
    // We will do a simple redirect back logic using vanilla JS since Next router might be broken here.
    alert("Something went wrong. Please try again.");
    window.history.back();
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
          background: "#000",
        }}
      >
        <p style={{ color: "#a0a0a0" }}>Redirecting...</p>
      </body>
    </html>
  );
}
