import { useEffect } from "react";
import { toast } from "sonner";
import { CLOUD_STUCK_EVENT, STUCK_MESSAGE } from "@/lib/cloud-health";

/** One persistent "Reconnect" notice when a cloud call hung while the internet works. */
export function CloudStuckNotice() {
  useEffect(() => {
    const show = () => {
      toast.error(STUCK_MESSAGE, {
        id: "cloud-stuck",
        duration: Infinity,
        action: { label: "Reconnect", onClick: () => window.location.reload() },
      });
    };
    window.addEventListener(CLOUD_STUCK_EVENT, show);
    return () => window.removeEventListener(CLOUD_STUCK_EVENT, show);
  }, []);
  return null;
}
