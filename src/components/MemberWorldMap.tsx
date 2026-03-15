import { useEffect, useState, useMemo } from "react";
import { COUNTRIES, type Country } from "@/lib/countries";
import { supabase } from "@/integrations/supabase/client";
import { Globe } from "lucide-react";

interface CountryCount {
  country: string;
  count: number;
}

// Simple equirectangular projection
function project(lat: number, lng: number, width: number, height: number) {
  const x = ((lng + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
}

export function MemberWorldMap() {
  const [data, setData] = useState<CountryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: result } = await supabase.rpc("get_member_country_distribution");
        if (result) setData(result as unknown as CountryCount[]);
      } catch {
        // ignore
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const countryMap = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((d) => map.set(d.country, d.count));
    return map;
  }, [data]);

  const maxCount = useMemo(() => Math.max(1, ...data.map((d) => d.count)), [data]);
  const totalMembers = useMemo(() => data.reduce((sum, d) => sum + d.count, 0), [data]);
  const countriesRepresented = data.length;

  const WIDTH = 800;
  const HEIGHT = 400;

  const dots = useMemo(() => {
    const matchedCountries: (Country & { count: number })[] = [];
    COUNTRIES.forEach((c) => {
      const count = countryMap.get(c.name);
      if (count) matchedCountries.push({ ...c, count });
    });
    return matchedCountries;
  }, [countryMap]);

  if (loading) {
    return (
      <div className="card-elevated p-6">
        <div className="h-6 w-48 bg-muted rounded animate-pulse mb-4" />
        <div className="h-[300px] bg-muted/30 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="card-elevated p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-foreground">Member Locations</h3>
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{totalMembers}</strong> members</span>
          <span><strong className="text-foreground">{countriesRepresented}</strong> countries</span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-lg bg-muted/20 border border-border">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto"
          role="img"
          aria-label="World map showing member locations"
        >
          {/* Grid lines for map feel */}
          {Array.from({ length: 7 }).map((_, i) => {
            const y = (HEIGHT / 7) * (i + 1);
            return <line key={`h${i}`} x1={0} y1={y} x2={WIDTH} y2={y} className="stroke-border" strokeWidth={0.5} opacity={0.3} />;
          })}
          {Array.from({ length: 13 }).map((_, i) => {
            const x = (WIDTH / 13) * (i + 1);
            return <line key={`v${i}`} x1={x} y1={0} x2={x} y2={HEIGHT} className="stroke-border" strokeWidth={0.5} opacity={0.3} />;
          })}

          {/* All country reference dots (faint) */}
          {COUNTRIES.map((c) => {
            const { x, y } = project(c.lat, c.lng, WIDTH, HEIGHT);
            const hasMembers = countryMap.has(c.name);
            if (hasMembers) return null;
            return (
              <circle
                key={c.code}
                cx={x}
                cy={y}
                r={1.5}
                className="fill-muted-foreground/20"
              />
            );
          })}

          {/* Member country dots */}
          {dots.map((c) => {
            const { x, y } = project(c.lat, c.lng, WIDTH, HEIGHT);
            const normalizedSize = Math.sqrt(c.count / maxCount);
            const radius = 4 + normalizedSize * 16;
            const isHovered = hoveredCountry === c.name;

            return (
              <g
                key={c.code}
                onMouseEnter={() => setHoveredCountry(c.name)}
                onMouseLeave={() => setHoveredCountry(null)}
                className="cursor-pointer"
              >
                {/* Pulse ring */}
                <circle
                  cx={x}
                  cy={y}
                  r={radius + 3}
                  className="fill-primary/10"
                >
                  <animate
                    attributeName="r"
                    values={`${radius + 2};${radius + 8};${radius + 2}`}
                    dur="3s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.3;0.05;0.3"
                    dur="3s"
                    repeatCount="indefinite"
                  />
                </circle>
                {/* Main dot */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? radius + 2 : radius}
                  className="fill-primary/70 stroke-primary"
                  strokeWidth={1.5}
                  style={{ transition: "r 0.2s ease" }}
                />
                {/* Count label for larger dots */}
                {(c.count > 1 || isHovered) && (
                  <text
                    x={x}
                    y={y + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-primary-foreground font-bold pointer-events-none"
                    fontSize={Math.max(8, radius * 0.7)}
                  >
                    {c.count}
                  </text>
                )}
                {/* Tooltip on hover */}
                {isHovered && (
                  <g>
                    <rect
                      x={x - 60}
                      y={y - radius - 28}
                      width={120}
                      height={22}
                      rx={4}
                      className="fill-popover stroke-border"
                    />
                    <text
                      x={x}
                      y={y - radius - 15}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-popover-foreground"
                      fontSize={10}
                    >
                      {c.name}: {c.count} {c.count === 1 ? "member" : "members"}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Top countries list */}
      {data.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {data.slice(0, 8).map((d) => (
            <div key={d.country} className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 text-sm">
              <div
                className="h-2.5 w-2.5 rounded-full bg-primary flex-shrink-0"
                style={{ opacity: 0.3 + (d.count / maxCount) * 0.7 }}
              />
              <span className="truncate text-foreground">{d.country}</span>
              <span className="ml-auto text-muted-foreground font-medium">{d.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
