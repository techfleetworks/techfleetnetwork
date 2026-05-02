import { useQuery } from "@/lib/react-query";
import { ClassService, type ClassRow } from "@/services/class.service";
import { CACHE_USER_MUTABLE } from "@/lib/query-config";
import { useAuth } from "@/contexts/AuthContext";

export function usePublishedClassesByTrack(track: ClassRow["track"]) {
  return useQuery({
    queryKey: ["classes", "published", track] as const,
    queryFn: () => ClassService.listPublishedByTrack(track),
    ...CACHE_USER_MUTABLE,
  });
}

export function useMyClasses() {
  const { user } = useAuth();
  return useQuery({
    queryKey: user ? (["classes", "mine", user.id] as const) : (["classes", "mine", "anon"] as const),
    queryFn: () => (user ? ClassService.listMine(user.id) : Promise.resolve([])),
    enabled: !!user,
    ...CACHE_USER_MUTABLE,
  });
}

export function useAllClasses() {
  return useQuery({
    queryKey: ["classes", "all"] as const,
    queryFn: () => ClassService.listAll(),
    ...CACHE_USER_MUTABLE,
  });
}

export function useClassById(id: string | undefined) {
  return useQuery({
    queryKey: ["classes", "id", id ?? "none"] as const,
    queryFn: () => (id ? ClassService.getById(id) : Promise.resolve(null)),
    enabled: !!id,
    ...CACHE_USER_MUTABLE,
  });
}

export function useClassBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ["classes", "slug", slug ?? "none"] as const,
    queryFn: () => (slug ? ClassService.getBySlug(slug) : Promise.resolve(null)),
    enabled: !!slug,
    ...CACHE_USER_MUTABLE,
  });
}
