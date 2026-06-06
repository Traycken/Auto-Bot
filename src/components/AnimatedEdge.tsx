import { memo } from "react";
import { getBezierPath, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";

export const AnimatedEdge = memo(function AnimatedEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  style = {}, markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      {/* Glow base */}
      <path id={id} d={edgePath} fill="none"
        strokeWidth={3} stroke="#2a2a2e"
        style={{ ...style }}
        markerEnd={markerEnd}
        className="react-flow__edge-path"
      />
      {/* Animated dash */}
      <path d={edgePath} fill="none"
        strokeWidth={1.5}
        stroke="#E84C1E"
        strokeDasharray="6 10"
        strokeLinecap="round"
        style={{
          animation: "flowDash 1.2s linear infinite",
          opacity: 0.7,
          ...style,
        }}
      />
      {/* Arrow marker placeholder — use label renderer for dot */}
      <EdgeLabelRenderer>
        <div style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "none" }} />
      </EdgeLabelRenderer>
      <style>{`
        @keyframes flowDash {
          from { stroke-dashoffset: 16; }
          to   { stroke-dashoffset: 0; }
        }
      `}</style>
    </>
  );
});
