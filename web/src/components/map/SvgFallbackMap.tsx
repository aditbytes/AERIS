import type { RankedSitesFile, SourcesFile } from '@/types/schemas'

function toSvgCoords(lon: number, lat: number, width = 680, height = 380): [number, number] {
  const minLon = 73.0, maxLon = 79.5
  const minLat = 27.5, maxLat = 33.5
  const x = ((lon - minLon) / (maxLon - minLon)) * width
  const y = height - ((lat - minLat) / (maxLat - minLat)) * height
  return [Math.max(20, Math.min(width - 20, x)), Math.max(20, Math.min(height - 20, y))]
}

interface SvgFallbackMapProps {
  sources: SourcesFile | null
  rankedSites: RankedSitesFile | null
  scopeFilter: 'all' | 'india'
}

export default function SvgFallbackMap({ sources, rankedSites, scopeFilter }: SvgFallbackMapProps) {
  return (
    <div className="map-fallback-canvas">
      <svg viewBox="0 0 680 380" className="svg-map" aria-label="AERIS SVG Fallback Map">
        <defs>
          <linearGradient id="plumeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#D63333" stopOpacity="0.75" />
            <stop offset="35%" stopColor="#EA580C" stopOpacity="0.65" />
            <stop offset="70%" stopColor="#D97706" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#CA8A04" stopOpacity="0.25" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Base terrain */}
        <rect width="680" height="380" fill="#EDF1EC" rx="10" />

        {/* Official Survey of India Northern Crown (including J&K, Ladakh, PoK) */}
        <path
          d="M 60 120 L 110 50 L 180 20 L 260 15 L 340 18 L 440 28 L 520 60 L 620 110 L 650 360 L 30 360 Z"
          fill="#E2E8E1"
          opacity="0.9"
        />

        {/* Official Sovereign Border Line */}
        <path
          d="M 60 120 L 110 50 L 180 20 L 260 15 L 340 18 L 440 28 L 520 60 L 620 110"
          fill="none"
          stroke="#164E35"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Official Indian Sovereign Territory Labels */}
        <text x="160" y="42" fill="#164E35" fontSize="10.5" fontWeight="800" letterSpacing="0.5">
          JAMMU & KASHMIR (INDIA)
        </text>
        <text x="360" y="42" fill="#164E35" fontSize="10.5" fontWeight="800" letterSpacing="0.5">
          LADAKH (INDIA)
        </text>
        <text x="120" y="110" fill="#3A5344" fontSize="12" fontWeight="800" letterSpacing="1">
          PUNJAB (UPWIND)
        </text>
        <text x="260" y="195" fill="#6B7280" fontSize="11" fontWeight="600" letterSpacing="1">
          HARYANA
        </text>
        <text x="470" y="270" fill="#1E4E3D" fontSize="12" fontWeight="800" letterSpacing="0.5">
          📍 DELHI NCR (RECEPTOR)
        </text>
        <text x="560" y="210" fill="#6B7280" fontSize="11" fontWeight="600" letterSpacing="0.5">
          UTTAR PRADESH
        </text>

        {/* Smoke Corridor Polygon Swath */}
        <path
          d="M 140 100 C 220 135 320 190 460 265 C 490 290 430 315 320 255 C 230 195 160 145 120 110 Z"
          fill="url(#plumeGrad)"
          filter="url(#glow)"
        />

        {/* Wind Vector Vectors */}
        <g stroke="white" strokeWidth="2.2" fill="none" opacity="0.9">
          <path d="M 180 125 L 230 160 M 220 150 L 230 160 L 218 165" />
          <path d="M 270 185 L 320 220 M 310 210 L 320 220 L 308 225" />
          <path d="M 360 235 L 410 265 M 400 255 L 410 265 L 398 270" />
        </g>

        {/* Fire Clusters */}
        {sources?.sources
          .filter(src => scopeFilter === 'all' || src.territory === 'india')
          .slice(0, 8)
          .map((src) => {
            const [cx, cy] = toSvgCoords(src.lon, src.lat, 680, 380)
            const isTrans = src.territory === 'transboundary'
            return (
              <g key={src.id} transform={`translate(${cx}, ${cy})`}>
                <circle r="14" fill={isTrans ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.28)'} />
                <circle r="6" fill={isTrans ? '#D97706' : '#DC2626'} />
                <text x="10" y="4" fontSize="9.5" fontWeight="700" fill={isTrans ? '#92400E' : '#991B1B'}>
                  {isTrans ? '🌐' : '🔥'} {src.district || src.type} ({src.total_frp_mw.toFixed(0)} MW)
                </text>
              </g>
            )
          })}

        {/* Receptor Facilities */}
        {rankedSites?.sites.slice(0, 4).map((site) => {
          const [sx, sy] = toSvgCoords(site.lon, site.lat, 680, 380)
          return (
            <g key={site.site_id} transform={`translate(${sx}, ${sy})`}>
              <circle r="5" fill="#1E4E3D" stroke="white" strokeWidth="1.5" />
              <text x="8" y="3" fontSize="9.5" fontWeight="600" fill="#111827">
                {site.type === 'hospital' ? '🏥' : '🏫'} {site.name.slice(0, 22)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
