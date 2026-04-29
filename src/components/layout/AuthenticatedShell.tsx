import { Outlet } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { IdleTimeoutGuard } from "@/components/IdleTimeoutGuard";
import { SelfHealingRunner } from "@/components/SelfHealingRunner";

export function AuthenticatedShell() {
  return (
    <AppLayout>
      <IdleTimeoutGuard />
      <SelfHealingRunner />
      <Outlet />
    </AppLayout>
  );
}