import { supabase } from "@/integrations/supabase/client";

export interface Handbook {
  id: string;
  name: string;
  description: string;
  target_audience: string;
  category: string;
  contents: string[];
  link: string;
}

export const handbookCategoryColors: Record<string, string> = {
  Agile: "bg-primary/10 text-primary border-primary/20",
  Operations: "bg-warning/10 text-warning border-warning/20",
  Training: "bg-success/10 text-success border-success/20",
};

export async function fetchHandbooks(): Promise<Handbook[]> {
  const { data, error } = await supabase
    .from("handbooks")
    .select("id, name, description, target_audience, category, contents, link")
    .order("name");

  if (error) throw error;
  return (data ?? []) as Handbook[];
}
