import { memo } from "react";
import { getBezierPath, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { useEditorStore } from "../store/editorStore";

export const AnimatedEdge = memo(function AnimatedEdge({
  id, source, target, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  style = {}, markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  
  const { activeNodeId, lastNodeId, edgeThickness } = useEditorStore(s => ({
    activeNodeId: s.activeNodeId,
    lastNodeId: s.lastNodeId,
    edgeThickness: s.edgeThickness ?? 4,
  }));

  // Ensure thickness is at least 2px to prevent invisible 0px lines
  const thickness = Math.max(2, edgeThickness);

  // Edge is active if:
  // 1. It directly connects the last executed node to the current active node
  // 2. Or if activeNodeId matches the source (going out of active node)
  const isActive = (source === lastNodeId && target === activeNodeId) || (source === activeNodeId);

  // Glow base & visibility styling: use clear visible zinc shades (#71717a, #a1a1aa) for inactive states
  const baseColor = style?.stroke ?? (isActive ? "#E84C1E33" : "#71717a22");
  const baseLineColor = style?.stroke ?? (isActive ? "#E84C1E66" : "#71717a");
  const dashColor = style?.stroke ?? (isActive ? "#E84C1E" : "#a1a1aa");

  return (
    <g className="react-flow__edge">
      {/* Glow base */}
      <path id={id} d={edgePath} fill="none"
        strokeWidth={isActive ? thickness + 4 : thickness + 2} 
        stroke={baseColor}
        style={{ ...style, stroke: baseColor, strokeWidth: isActive ? thickness + 4 : thickness + 2 }}
        markerEnd={markerEnd}
        className="react-flow__edge-path"
      />
      {/* Underlying base line (the solid edge line itself) */}
      <path d={edgePath} fill="none"
        strokeWidth={thickness}
        stroke={baseLineColor}
        style={{ ...style, stroke: baseLineColor, strokeWidth: thickness }}
      />
      {/* Animated flow dash */}
      <path d={edgePath} fill="none"
        strokeWidth={isActive ? thickness / 2 + 1 : thickness / 2}
        stroke={dashColor}
        strokeDasharray={isActive ? "8 12" : "6 16"}
        strokeLinecap="round"
        style={{
          ...style,
          stroke: dashColor,
          strokeWidth: isActive ? thickness / 2 + 1 : thickness / 2,
          animation: isActive ? "flowDash 1.0s linear infinite" : "flowDash 4.0s linear infinite",
          opacity: isActive ? 1.0 : 0.6,
          filter: isActive ? "drop-shadow(0px 0px 3px #E84C1E)" : "none",
        }}
      />
      {/* Arrow marker placeholder — use label renderer for dot */}
      <EdgeLabelRenderer>
        <div style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "none" }} />
      </EdgeLabelRenderer>
      <style>{`
        @keyframes flowDash {
          from { stroke-dashoffset: 20; }
          to   { stroke-dashoffset: 0; }
        }
      `}</style>
    </g>
  );
});

