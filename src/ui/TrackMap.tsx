import { useMemo } from "react";
import { getTrackPoints } from "../game/track";
import type { CourseId } from "../game/types";
export function TrackMap({ courseId }: { courseId: CourseId }) {
  const path = useMemo(() => {
    const points = getTrackPoints(courseId).filter((_, i) => i % 12 === 0);
    const xs = points.map((p) => p.center[0] + p.center[1] * 0.3),
      zs = points.map((p) => p.center[2] - p.center[1] * 1.5);
    const minX = Math.min(...xs),
      minZ = Math.min(...zs),
      width = Math.max(...xs) - minX,
      height = Math.max(...zs) - minZ;
    const scale = Math.min(76 / width, 40 / height);
    return (
      points
        .map(
          (p, i) =>
            `${i ? "L" : "M"}${(12 + (p.center[0] + p.center[1] * 0.3 - minX) * scale).toFixed(1)},${(8 + (p.center[2] - p.center[1] * 1.5 - minZ) * scale).toFixed(1)}`,
        )
        .join(" ") + "Z"
    );
  }, [courseId]);
  return (
    <svg viewBox="0 0 100 60" className="track-map" aria-hidden="true">
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
