// 🍻 Chugs: the week's lowest scorer owes a beer-chug video. Videos live in Supabase Storage.
// The anon key below is public by design (it's in every browser); access is controlled by RLS policies.

const SUPABASE_URL = "https://mggzyeqrnkmqyavjahxz.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nZ3p5ZXFybmttcXlhdmphaHh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMjA5NDQsImV4cCI6MjEwOTg5Njk0NH0.rIAmRsvXImG0a6TyUOPqqKERb9B4KNHl51gc_lgnTzE";
const BUCKET = "chugs";
export const MAX_BYTES = 50 * 1024 * 1024; // Supabase free-plan per-file limit

const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

export const isChugLeague = (league) => /rocket\s*dong/i.test(league?.name || "");

export const videoUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

/** { [week]: row } for a league-season. */
export async function listChugs(leagueId, season) {
  const q = new URLSearchParams({ select: "*", league_id: `eq.${leagueId}`, season: `eq.${season}` });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/chugs?${q}`, { headers });
  if (!res.ok) throw new Error(`Couldn't load chug videos (${res.status})`);
  const rows = await res.json();
  return Object.fromEntries(rows.map((r) => [r.week, r]));
}

/** Upload with progress (XHR, since fetch can't report upload progress), then record it. */
export function uploadChug({ leagueId, season, week, rosterId, chugger, file, onProgress }) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_BYTES) {
      return reject(new Error(`That video is ${(file.size / 1048576).toFixed(0)}MB. The max is 50MB. Trim it, or switch your iPhone to Settings → Camera → Record Video → 1080p at 30 fps and re-record.`));
    }
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    const path = `${leagueId}/${season}/week-${week}-${Date.now()}.${ext}`;
    const type = file.type || (ext === "mov" ? "video/quicktime" : "video/mp4");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`);
    xhr.setRequestHeader("apikey", ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${ANON_KEY}`);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.onload = async () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let msg = `Upload failed (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).message || msg; } catch {}
        return reject(new Error(msg));
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/chugs?on_conflict=league_id,season,week`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ league_id: leagueId, season, week, roster_id: rosterId, chugger, video_path: path, uploaded_at: new Date().toISOString() }),
      });
      if (!res.ok) return reject(new Error(`Video uploaded but couldn't be saved (${res.status})`));
      resolve((await res.json())[0]);
    };
    xhr.send(file);
  });
}
