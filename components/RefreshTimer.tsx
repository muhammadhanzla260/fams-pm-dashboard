"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Refreshes server data every 60s and shows a live "updated Ns ago" chip.
export default function RefreshTimer() {
  const router = useRouter();
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setSecs((s) => s + 1), 1000);
    const refresh = setInterval(() => {
      router.refresh();
      setSecs(0);
    }, 60000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);

  const label = secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`;
  return (
    <span className="chip">
      <span className="dot" /> live · updated {label}
    </span>
  );
}
