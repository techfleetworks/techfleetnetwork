import { Outlet } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { IdleTimeoutGuard } from "@/components/IdleTimeoutGuard";
import { SelfHealingRunner } from "@/components/SelfHealingRunner";

export function AdminShell() {
  return (
    <AppLayout>
      <IdleTimeoutGuard />
      <SelfHealingRunner />
      <Outlet />
    </AppLayout>
  );
}