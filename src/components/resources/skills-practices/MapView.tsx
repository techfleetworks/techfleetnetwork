// Lazy-loaded React Flow visualization of the framework graph.
import { useMemo, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import {
  FRAMEWORK_ENTITIES,
  FRAMEWORK_LABELS,
  FRAMEWORK_GROUPS,
  type FrameworkEntity,
  type FrameworkRelationship,
} from "@/services/framework.service";

interface MapViewProps {
  relationships: FrameworkRelationship[];
  loading: boolean;
}

// Layout: 3 rows, one per FRAMEWORK_GROUP, evenly spaced horizontally.
function buildLayout(): Record<FrameworkEntity, { x: number; y: number }> {
  const layout = {} as Record<FrameworkEntity, { x: number; y: number }>;
  const ROW_GAP = 180;
  const COL_GAP = 200;
  FRAMEWORK_GROUPS.forEach((g, rowIdx) => {
    const rowWidth = (g.entities.length - 1) * COL_GAP;
    g.entities.forEach((e, colIdx) => {
      layout[e] = {
        x: colIdx * COL_GAP - rowWidth / 2,
        y: rowIdx * ROW_GAP,
      };
    });
  });
  return layout;
}

export default function MapView({ relationships, loading }: MapViewProps) {
  const layout = useMemo(buildLayout, []);

  const initialNodes: Node[] = useMemo(
    () =>
      FRAMEWORK_ENTITIES.map((e) => ({
        id: e,
        position: layout[e],
        data: { label: FRAMEWORK_LABELS[e] },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          background: "hsl(var(--card))",
          border: "2px solid hsl(var(--primary))",
          borderRadius: 12,
          color: "hsl(var(--foreground))",
          padding: "10px 14px",
          fontSize: 12,
          fontWeight: 600,
          minWidth: 140,
          textAlign: "center" as const,
        },
      })),
    [layout]
  );

  // Deduplicate edges: collapse forward+inverse into one undirected-feeling edge.
  const initialEdges: Edge[] = useMemo(() => {
    const seen = new Set<string>();
    const out: Edge[] = [];
    for (const r of relationships) {
      const key = [r.from_entity, r.to_entity].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `${r.from_entity}-${r.to_entity}`,
        source: r.from_entity,
        target: r.to_entity,
        animated: false,
        style: { stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.4, strokeWidth: 1.5 },
      });
    }
    return out;
  }, [relationships]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => setNodes(initialNodes), [initialNodes, setNodes]);
  useEffect(() => setEdges(initialEdges), [initialEdges, setEdges]);

  if (loading) {
    return <Loader2 className="h-6 w-6 animate-spin mx-auto my-12 text-muted-foreground" />;
  }

  return (
    <Card className="p-2">
      <div className="h-[60vh] min-h-[480px] w-full" role="region" aria-label="Framework relationship map">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
        >
          <Background gap={16} color="hsl(var(--muted-foreground) / 0.2)" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor="hsl(var(--primary))" maskColor="hsl(var(--background) / 0.8)" />
        </ReactFlow>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-2">
        Each line connects two framework concepts. Use the Relationships tab to read the two-way
        sentence describing how they relate.
      </p>
    </Card>
  );
}
