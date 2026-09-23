export interface CameraState {
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

const PRECISION = 5;

/** Reads camera state from URL search params (server or client side) — undefined if lng/lat/zoom aren't all present. */
export function parseCameraFromParams(params: Record<string, string | string[] | undefined>): CameraState | undefined {
  const lng = Number(params.lng);
  const lat = Number(params.lat);
  const zoom = Number(params.zoom);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(zoom)) return undefined;
  const pitch = Number(params.pitch);
  const bearing = Number(params.bearing);
  return {
    lng,
    lat,
    zoom,
    pitch: Number.isFinite(pitch) ? pitch : 0,
    bearing: Number.isFinite(bearing) ? bearing : 0,
  };
}

/**
 * Builds the shareable URL for the current view — camera position plus
 * whatever's selected. Kept as a plain query string (not Next.js router
 * state) since camera updates happen on every 'moveend' and must never
 * trigger a server round-trip or React re-render of the page itself.
 */
export function buildShareUrl(camera: CameraState, selection: { zone?: string | null; pin?: string | null }): string {
  const params = new URLSearchParams();
  params.set("lng", camera.lng.toFixed(PRECISION));
  params.set("lat", camera.lat.toFixed(PRECISION));
  params.set("zoom", camera.zoom.toFixed(2));
  if (camera.pitch) params.set("pitch", camera.pitch.toFixed(1));
  if (camera.bearing) params.set("bearing", camera.bearing.toFixed(1));
  if (selection.zone) params.set("zone", selection.zone);
  if (selection.pin) params.set("pin", selection.pin);
  return `${window.location.pathname}?${params.toString()}`;
}
