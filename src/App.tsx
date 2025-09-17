import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

/** ─────────────────────────────────────────────────────────────
 *  CONFIG
 *  ──────────────────────────────────────────────────────────── */
mapboxgl.accessToken =
  "pk.eyJ1IjoiamNhcnJvbGw0NCIsImEiOiJjbThodXZkbWQwMHFwMmtvZXJzbDh1MWFmIn0.kR4D4dDPPFlYiFio7EH_-A";

const PRICES = {
  chairSet: 300,
  boxWeek: 375,
  bonfireBase: 500,
  photo: 300,
} as const;

type DateChip = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

/** Home toggle: how many chair sets are already included by the home */
const HOME_INCLUDED_SETS = 1; // ← set 0, 1, 2... per property

const HOME = {
  name: "Bella Vita — 30A Escapes",
  address: "40 Seapointe Lane, Santa Rosa Beach, FL 32459",
  datesLabel: "Sept 12 – Sept 19",
  coords: [-86.08973612883624, 30.306565864475555] as [number, number],
};

const BEACH_ACCESS = {
  label: "Walton Dunes Beach Access",
  coords: [-86.08809461689333, 30.304064928205506] as [number, number],
};

/** Utils */
const fmtUSD = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

function haversineMiles(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const R = 3958.7613; // miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s1 =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s1), Math.sqrt(1 - s1));
  return R * c;
}

/** ─────────────────────────────────────────────────────────────
 *  UI atoms
 *  ──────────────────────────────────────────────────────────── */
function Pill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full border border-sky-200 bg-white/90 px-3 py-1 text-[12px] font-semibold text-sky-800 shadow-sm " +
        className
      }
    >
      {children}
    </span>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-3xl border border-sky-100 bg-white/95 shadow-[0_22px_70px_-30px_rgba(9,30,66,0.22)] backdrop-blur " +
        className
      }
    >
      {children}
    </div>
  );
}

function IconButton({
  onClick,
  children,
  "aria-label": aria,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <button
      aria-label={aria}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-xl border border-sky-200 text-sky-900 hover:bg-sky-50"
    >
      {children}
    </button>
  );
}

/** ─────────────────────────────────────────────────────────────
 *  Mapbox (satellite + route line + label overlay + slow rotation)
 *  ──────────────────────────────────────────────────────────── */
function FutureMap() {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const rafRef = useRef<number | null>(null);

  const distanceMi = useMemo(() => {
    const mi = haversineMiles(HOME.coords, BEACH_ACCESS.coords);
    return mi < 0.1 ? "<0.1 mi" : `${mi.toFixed(1)} mi`;
  }, []);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: ref.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: HOME.coords,
      zoom: 14, // slightly farther out
      pitch: 45, // gentle tilt for depth
      bearing: 0,
      attributionControl: false,
      antialias: true,
    });
    mapRef.current = map;

    // Pins
    new mapboxgl.Marker({ color: "#0EA5E9" })
      .setLngLat(HOME.coords)
      .setPopup(new mapboxgl.Popup({ offset: 18 }).setText("Home · Bella Vita"))
      .addTo(map);

    new mapboxgl.Marker({ color: "#1D4ED8" })
      .setLngLat(BEACH_ACCESS.coords)
      .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(BEACH_ACCESS.label))
      .addTo(map);

    // Frame both points
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend(HOME.coords).extend(BEACH_ACCESS.coords);
    map.fitBounds(bounds, { padding: 80, maxZoom: 15.5 });

    // Draw the route line
    map.on("load", async () => {
      try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${HOME.coords.join(
          ","
        )};${BEACH_ACCESS.coords.join(
          ","
        )}?alternatives=false&overview=full&geometries=geojson&access_token=${
          mapboxgl.accessToken
        }`;
        const res = await fetch(url);
        const data = await res.json();
        const route =
          data?.routes?.[0]?.geometry ||
          ({ type: "LineString", coordinates: [] } as any);

        map.addSource("route", {
          type: "geojson",
          data: { type: "Feature", geometry: route },
        });

        map.addLayer({
          id: "route-casing",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": 8,
            "line-opacity": 0.9,
          },
        });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0EA5E9", "line-width": 5 },
        });

        // Slow continuous rotation
        let bearing = 0;
        const step = () => {
          if (!mapRef.current) return;
          bearing = (bearing + 0.05) % 360; // tweak for slower/faster
          map.easeTo({ bearing, duration: 1000, easing: (t) => t });
          rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
      } catch {
        // ignore fetch errors
      }
    });

    // Clean up
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full">
      <div ref={ref} className="h-full w-full rounded-2xl" />

      {/* Top-left LABEL (not a pill) */}
      <div className="pointer-events-none absolute left-3 top-3">
        <div className="rounded-md border border-sky-200 bg-white/95 px-2.5 py-1.5 text-[12px] font-semibold text-sky-900 shadow-sm">
          {BEACH_ACCESS.label}
        </div>
      </div>

      {/* Bottom caption card */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3">
        <div className="rounded-2xl border border-sky-100 bg-white/95 px-4 py-3 shadow-[0_10px_40px_-12px_rgba(9,30,66,0.25)]">
          <div className="text-sm font-bold text-sky-900">
            Closest Beach Access
          </div>
          <div className="text-[12px] text-sky-700/90">
            {BEACH_ACCESS.label} · ~{distanceMi}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-sky-100" />
    </div>
  );
}

/** ─────────────────────────────────────────────────────────────
 *  Combined Card: Beach Chairs & Umbrellas + Closest Access (wide)
 *  ──────────────────────────────────────────────────────────── */
function ChairsAndAccessCard({
  sets,
  setSets,
}: {
  sets: number;
  setSets: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <Card>
      <div className="p-6">
        {/* Header row */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-2xl font-bold text-sky-900">
              Beach Chairs & Umbrellas
            </h3>
            <div className="mt-1 text-[13px] text-sky-700/90">
              $55/day · {fmtUSD(PRICES.chairSet)}/week per set
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pill>1 set = 2 chairs + 1 umbrella</Pill>
              {HOME_INCLUDED_SETS > 0 && (
                <Pill className="bg-sky-50">
                  Home includes {HOME_INCLUDED_SETS} set
                  {HOME_INCLUDED_SETS > 1 ? "s" : ""}
                </Pill>
              )}
            </div>
          </div>
          {/* Qty control */}
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <IconButton
              aria-label="decrease"
              onClick={() => setSets((s) => Math.max(1, s - 1))}
            >
              –
            </IconButton>
            <div className="w-8 text-center text-xl font-bold text-sky-900">
              {sets}
            </div>
            <IconButton
              aria-label="increase"
              onClick={() => setSets((s) => Math.min(10, s + 1))}
            >
              +
            </IconButton>
          </div>
        </div>

        {/* Two-up media: both tall and equal height */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Chairs photo */}
          <div className="h-[420px] overflow-hidden rounded-2xl ring-1 ring-sky-100">
            <img
              src="/chairs.png"
              alt="Beach Chairs"
              className="h-full w-full object-cover"
            />
          </div>

          {/* Map */}
          <div className="h-[420px] overflow-hidden rounded-2xl ring-1 ring-sky-100">
            <FutureMap />
          </div>
        </div>
      </div>
    </Card>
  );
}

/** ─────────────────────────────────────────────────────────────
 *  Main
 *  ──────────────────────────────────────────────────────────── */
export default function App() {
  /** selections */
  const [sets, setSets] = useState(2);
  const [includeBox, setIncludeBox] = useState(false);
  const [bonfireDay, setBonfireDay] = useState<DateChip | null>(null);
  const [photoDay, setPhotoDay] = useState<DateChip | null>(null);

  /** priced sets after home credit */
  const paidSets = Math.max(sets - HOME_INCLUDED_SETS, 0);

  const total = useMemo(() => {
    let t = paidSets * PRICES.chairSet;
    if (includeBox) t += PRICES.boxWeek;
    if (bonfireDay) t += PRICES.bonfireBase;
    if (photoDay) t += PRICES.photo;
    return t;
  }, [paidSets, includeBox, bonfireDay, photoDay]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-sky-100 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold tracking-[0.22em] text-sky-900">
              COASTAL <span className="text-sky-600">BEACH COMPANY</span>
            </div>
            <div className="text-[15px] font-semibold text-sky-900">
              {HOME.name}
            </div>
            <div className="text-[12px] text-sky-700/80">{HOME.address}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-900">
              {HOME.datesLabel}
            </div>
            <div className="rounded-xl border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-900">
              Est. total: {fmtUSD(total)}
            </div>
            <button className="rounded-xl bg-sky-900 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-950">
              Review My Itinerary
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-28 pt-8">
        {/* Top grid: wider left, slightly smaller itinerary */}
        <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
          <ChairsAndAccessCard sets={sets} setSets={setSets} />

          {/* Sticky Itinerary (scaled down a bit) */}
          <aside className="xl:sticky xl:top-24">
            <Card>
              <div className="p-4">
                <h4 className="mb-3 text-base font-bold text-sky-900">
                  Your itinerary
                </h4>

                {/* CHAIR LINE */}
                <div className="border-y border-sky-100 py-2.5 text-[13px]">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-sky-900">
                        Chair sets
                      </div>
                      <div className="text-[12px] text-sky-700/80">
                        {HOME_INCLUDED_SETS > 0 ? (
                          <>
                            Home includes {HOME_INCLUDED_SETS} set
                            {HOME_INCLUDED_SETS > 1 ? "s" : ""}. You’re booking{" "}
                            {sets} total →{" "}
                            {Math.max(sets - HOME_INCLUDED_SETS, 0)} paid.
                          </>
                        ) : (
                          <>
                            You’re booking {sets} set{sets > 1 ? "s" : ""}.
                          </>
                        )}
                      </div>
                    </div>
                    <div className="font-semibold text-sky-900">
                      {paidSets > 0 ? fmtUSD(paidSets * PRICES.chairSet) : "$0"}
                    </div>
                  </div>
                </div>

                {/* BOX */}
                <div className="border-b border-sky-100 py-2.5 text-[13px]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sky-900">
                        Beach Better Box
                      </div>
                      <div className="text-[12px] text-sky-700/80">
                        {includeBox ? "Included this week" : "Not selected"}
                      </div>
                    </div>
                    <div className="font-semibold text-sky-900">
                      {includeBox ? fmtUSD(PRICES.boxWeek) : "$0"}
                    </div>
                  </div>
                </div>

                {/* BONFIRE */}
                <div className="border-b border-sky-100 py-2.5 text-[13px]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sky-900">
                        Beach Bonfire
                      </div>
                      <div className="text-[12px] text-sky-700/80">
                        {bonfireDay
                          ? `Scheduled · ${bonfireDay}`
                          : "Not scheduled"}
                      </div>
                    </div>
                    <div className="font-semibold text-sky-900">
                      {bonfireDay ? fmtUSD(PRICES.bonfireBase) : "$0"}
                    </div>
                  </div>
                </div>

                {/* PHOTO */}
                <div className="border-b border-sky-100 py-2.5 text-[13px]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sky-900">
                        Family Photography
                      </div>
                      <div className="text-[12px] text-sky-700/80">
                        {photoDay ? `Scheduled · ${photoDay}` : "Not scheduled"}
                      </div>
                    </div>
                    <div className="font-semibold text-sky-900">
                      {photoDay ? fmtUSD(PRICES.photo) : "$0"}
                    </div>
                  </div>
                </div>

                {/* TOTAL + actions */}
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-sky-700/90">Total</div>
                  <div className="text-xl font-extrabold text-sky-900">
                    {fmtUSD(total)}
                  </div>
                </div>
                <div className="mt-2.5 flex gap-2.5">
                  <input
                    placeholder="you@email.com"
                    className="h-9 flex-1 rounded-xl border border-sky-200 px-3 text-[13px] outline-none focus:ring-2 focus:ring-sky-200"
                  />
                  <button className="h-9 rounded-xl bg-sky-900 px-3.5 text-[13px] font-semibold text-white hover:bg-sky-950">
                    Save & email
                  </button>
                </div>

                <div className="mt-2.5 text-[10px] text-sky-600">
                  Powered by 30A Escapes × Coastal. Plans can be updated anytime
                  before arrival.
                </div>
              </div>
            </Card>
          </aside>
        </div>

        {/* Lower grid: Box / Bonfire / Photo */}
        <section className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {/* Box */}
          <Card>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <Pill>Beach Better Box</Pill>
                <button
                  onClick={() => setIncludeBox((v) => !v)}
                  className={
                    "rounded-full border px-3 py-1 text-[12px] font-semibold " +
                    (includeBox
                      ? "border-sky-900 bg-sky-900 text-white"
                      : "border-sky-200 text-sky-900 hover:bg-sky-50")
                  }
                >
                  {includeBox ? "Included" : "Include"}
                </button>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-sky-100">
                <div className="aspect-[16/11]">
                  <img
                    src="/box.png"
                    alt="Beach Better Box"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <div className="mt-3 text-[14px] font-semibold text-sky-900">
                {fmtUSD(PRICES.boxWeek)}/week
              </div>
              <div className="text-[12px] text-sky-700/80">
                Add Beach Better Box to unlock bundle savings.
              </div>
            </div>
          </Card>

          {/* Bonfire */}
          <Card>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <Pill>Beach Bonfire</Pill>
                <button
                  onClick={() => setBonfireDay((d) => (d ? null : "Fri"))}
                  className={
                    "rounded-full border px-3 py-1 text-[12px] font-semibold " +
                    (bonfireDay
                      ? "border-sky-900 bg-sky-900 text-white"
                      : "border-sky-200 text-sky-900 hover:bg-sky-50")
                  }
                >
                  {bonfireDay ? "Scheduled" : "Include"}
                </button>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-sky-100">
                <div className="aspect-[16/11]">
                  <img
                    src="/bonfire.png"
                    alt="Bonfire"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <div className="mt-3 text-[14px] font-semibold text-sky-900">
                From {fmtUSD(PRICES.bonfireBase)} · pick a night
              </div>
              <div className="mt-2 flex flex-wrap gap-6 text-[12px] text-sky-700/80">
                {(
                  [
                    "Sun",
                    "Mon",
                    "Tue",
                    "Wed",
                    "Thu",
                    "Fri",
                    "Sat",
                  ] as DateChip[]
                ).map((d) => (
                  <button
                    key={d}
                    onClick={() =>
                      setBonfireDay((cur) => (cur === d ? null : d))
                    }
                    className={
                      "rounded-full border px-3 py-1 " +
                      (bonfireDay === d
                        ? "border-sky-900 bg-sky-900 text-white"
                        : "border-sky-200 text-sky-900 hover:bg-sky-50")
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Photography */}
          <Card>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <Pill>Family Photography</Pill>
                <button
                  onClick={() => setPhotoDay((d) => (d ? null : "Thu"))}
                  className={
                    "rounded-full border px-3 py-1 text-[12px] font-semibold " +
                    (photoDay
                      ? "border-sky-900 bg-sky-900 text-white"
                      : "border-sky-200 text-sky-900 hover:bg-sky-50")
                  }
                >
                  {photoDay ? "Scheduled" : "Include"}
                </button>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-sky-100">
                <div className="aspect-[16/11]">
                  <img
                    src="/familyphoto.png"
                    alt="Family photo"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <div className="mt-3 text-[14px] font-semibold text-sky-900">
                {fmtUSD(PRICES.photo)} · 45–60 min
              </div>
              <div className="mt-2 flex flex-wrap gap-6 text-[12px] text-sky-700/80">
                {(
                  [
                    "Sun",
                    "Mon",
                    "Tue",
                    "Wed",
                    "Thu",
                    "Fri",
                    "Sat",
                  ] as DateChip[]
                ).map((d) => (
                  <button
                    key={d}
                    onClick={() => setPhotoDay((cur) => (cur === d ? null : d))}
                    className={
                      "rounded-full border px-3 py-1 " +
                      (photoDay === d
                        ? "border-sky-900 bg-sky-900 text-white"
                        : "border-sky-200 text-sky-900 hover:bg-sky-50")
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </section>

        {/* Bundle strip */}
        <div className="mt-10">
          <div className="rounded-2xl border border-sky-100 bg-white/90 p-4 text-center text-[13px] text-sky-900 shadow-[0_22px_70px_-30px_rgba(9,30,66,0.22)]">
            <span className="font-semibold">Bundle Deal:</span> Chairs + Beach
            Box → <span className="font-bold">$600/week</span>{" "}
            <span className="text-sky-600">(Save $75)</span>
          </div>
        </div>
      </main>
    </div>
  );
}
