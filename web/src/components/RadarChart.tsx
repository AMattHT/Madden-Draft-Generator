/**
 * Dependency-free SVG radar chart of a player's signature attributes. The size
 * of the filled shape shows how elite the player is: a big shape pushing toward
 * the outer (elite) ring = a star; a small shape = fringe.
 */
export function RadarChart({
  data,
  color,
  size = 236,
}: {
  data: { label: string; value: number }[];
  color: string;
  size?: number;
}) {
  const c = size / 2;
  const R = size / 2 - 30; // leave room for axis labels
  const n = data.length;
  const max = 99;

  const pointAt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + r * Math.cos(a), c + r * Math.sin(a)] as const;
  };
  const polygon = (frac: number) =>
    data.map((_, i) => pointAt(i, R * frac).join(',')).join(' ');
  const valuePoly = data.map((d, i) => pointAt(i, (Math.max(0, Math.min(max, d.value)) / max) * R).join(',')).join(' ');

  const avg = Math.round(data.reduce((s, d) => s + d.value, 0) / Math.max(1, n));

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="mx-auto block">
      {/* grid rings */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={polygon(f)} fill="none" stroke="#2a2a2a" strokeWidth={1} />
      ))}
      {/* elite reference ring (~90) */}
      <polygon points={polygon(90 / max)} fill="none" stroke="#f5c518" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
      {/* axes + labels */}
      {data.map((d, i) => {
        const [x, y] = pointAt(i, R);
        const [lx, ly] = pointAt(i, R + 16);
        return (
          <g key={d.label}>
            <line x1={c} y1={c} x2={x} y2={y} stroke="#232323" strokeWidth={1} />
            <text
              x={lx}
              y={ly}
              fill="#8a8a8a"
              fontSize={10}
              textAnchor="middle"
              dominantBaseline="middle"
              fontWeight={600}
            >
              {d.label}
            </text>
          </g>
        );
      })}
      {/* player shape */}
      <polygon points={valuePoly} fill={color} fillOpacity={0.28} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {data.map((d, i) => {
        const [x, y] = pointAt(i, (Math.max(0, Math.min(max, d.value)) / max) * R);
        return <circle key={i} cx={x} cy={y} r={2.5} fill={color} />;
      })}
      {/* center grade */}
      <text x={c} y={c - 6} fill="#e5e5e5" fontSize={22} fontWeight={800} textAnchor="middle">
        {avg}
      </text>
      <text x={c} y={c + 9} fill="#6a6a6a" fontSize={8} textAnchor="middle" letterSpacing={1}>
        KEY AVG
      </text>
    </svg>
  );
}
