import { lazy } from "react";

const GeneralApplicationTab = lazy(() =>
  import("@/components/GeneralApplicationTab").then((m) => ({
    default: m.GeneralApplicationTab,
  }))
);

export default function GeneralApplicationPage() {
  return (
    <div className="container-app py-8 sm:py-12">
      <GeneralApplicationTab />
    </div>
  );
}
