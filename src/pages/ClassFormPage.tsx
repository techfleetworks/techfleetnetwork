import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useClassById } from "@/hooks/use-classes";
import { ClassService } from "@/services/class.service";
import { classFormSchema, type ClassFormValues } from "@/lib/validators/class";
import { useQueryClient } from "@/lib/react-query";

function csvToList(s: string): string[] {
  return s.split(/[\n,]/).map((t) => t.trim()).filter(Boolean);
}

export default function ClassFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: existing, isLoading } = useClassById(id);
  const [submitting, setSubmitting] = useState(false);

  const defaults = useMemo<ClassFormValues>(
    () => ({
      title: "",
      summary: "",
      description: "",
      track: "basic_training",
      hero_image_url: "",
      skills: [],
      outcomes: [],
      prerequisites: [],
    }),
    []
  );

  const form = useForm<ClassFormValues>({
    resolver: zodResolver(classFormSchema),
    defaultValues: defaults,
  });

  const [skillsText, setSkillsText] = useState("");
  const [outcomesText, setOutcomesText] = useState("");
  const [prereqText, setPrereqText] = useState("");

  useEffect(() => {
    if (existing) {
      form.reset({
        title: existing.title,
        summary: existing.summary,
        description: existing.description ?? "",
        track: existing.track,
        hero_image_url: existing.hero_image_url ?? "",
        skills: existing.skills ?? [],
        outcomes: existing.outcomes ?? [],
        prerequisites: existing.prerequisites ?? [],
      });
      setSkillsText((existing.skills ?? []).join(", "));
      setOutcomesText((existing.outcomes ?? []).join("\n"));
      setPrereqText((existing.prerequisites ?? []).join("\n"));
    }
  }, [existing, form]);

  const onSubmit = async (values: ClassFormValues) => {
    if (!user) return;
    const payload: ClassFormValues = {
      ...values,
      skills: csvToList(skillsText),
      outcomes: csvToList(outcomesText),
      prerequisites: csvToList(prereqText),
    };
    setSubmitting(true);
    try {
      if (isEdit && id) {
        await ClassService.update(id, payload);
        toast.success("Class saved");
      } else {
        const newId = await ClassService.create(user.id, payload);
        toast.success("Class created");
        await queryClient.invalidateQueries({ queryKey: ["classes"] });
        navigate(`/teach/classes/${newId}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["classes"] });
      navigate(`/teach/classes/${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save class";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (isEdit && isLoading) {
    return (
      <div className="container-app py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container-app py-8 sm:py-12 max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/teach/classes"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
      </Button>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-6">
        {isEdit ? "Edit Class" : "New Class"}
      </h1>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" {...form.register("title")} />
          {form.formState.errors.title && (
            <p className="text-xs text-destructive mt-1">{form.formState.errors.title.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="track">Track</Label>
          <Select
            value={form.watch("track")}
            onValueChange={(v) => form.setValue("track", v as ClassFormValues["track"], { shouldValidate: true })}
          >
            <SelectTrigger id="track"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="basic_training">Basic Training</SelectItem>
              <SelectItem value="advanced_training">Advanced Training</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="summary">Summary</Label>
          <Textarea id="summary" rows={2} {...form.register("summary")} />
          {form.formState.errors.summary && (
            <p className="text-xs text-destructive mt-1">{form.formState.errors.summary.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" rows={6} {...form.register("description")} />
        </div>

        <div>
          <Label htmlFor="hero">Hero image URL</Label>
          <Input id="hero" placeholder="https://…" {...form.register("hero_image_url")} />
        </div>

        <div>
          <Label htmlFor="skills">Skills (comma separated)</Label>
          <Input id="skills" value={skillsText} onChange={(e) => setSkillsText(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="outcomes">Outcomes (one per line)</Label>
          <Textarea id="outcomes" rows={3} value={outcomesText} onChange={(e) => setOutcomesText(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="prereq">Prerequisites (one per line)</Label>
          <Textarea id="prereq" rows={3} value={prereqText} onChange={(e) => setPrereqText(e.target.value)} />
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save changes" : "Create draft"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/teach/classes")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
