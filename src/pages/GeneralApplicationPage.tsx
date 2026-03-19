import { lazy } from "react";

const GeneralApplicationTab = lazy(() =>
  import("@/components/GeneralApplicationTab").then((m) => ({
    default: m.GeneralApplicationTab,
  }))
);

export default function GeneralApplicationPage() {
  return <GeneralApplicationTab />;
}
