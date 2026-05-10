import { lazyWithRetry as lazy } from "@/lib/lazy-with-retry";

const GeneralApplicationTab = lazy(() =>
  import("@/components/GeneralApplicationTab").then((m) => ({
    default: m.GeneralApplicationTab,
  }))
);

export default function GeneralApplicationPage() {
  return <GeneralApplicationTab />;
}
