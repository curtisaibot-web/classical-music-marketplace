import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import MuxPlayer from "@mux/mux-player-react";

export function YoutubeEmbed({ url }: { url: string }) {
  let videoId = "";
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      videoId = u.pathname.slice(1);
    } else {
      videoId = u.searchParams.get("v") ?? u.pathname.split("/").pop() ?? "";
    }
  } catch {
    videoId = url;
  }
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
      <iframe
        src={embedUrl}
        title="Live Concert Stream"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full"
      />
    </div>
  );
}

function extractMuxPlaybackId(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("mux.com")) {
      return u.pathname.replace(/^\//, "").replace(/\.m3u8$/, "");
    }
  } catch {
    // not a URL — treat as raw playback ID
  }
  return url.replace(/\.m3u8$/, "");
}

export function MuxEmbed({ url }: { url: string }) {
  const playbackId = extractMuxPlaybackId(url);
  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
      <MuxPlayer
        playbackId={playbackId}
        streamType="live:dvr"
        autoPlay={false}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

export function LockedStream({ onPurchase, disabled }: { onPurchase?: () => void; disabled?: boolean }) {
  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <Lock className="h-16 w-16 text-muted-foreground mx-auto" />
        <p className="font-semibold text-foreground">Purchase a ticket to watch</p>
        <p className="text-sm text-muted-foreground max-w-xs">This stream is exclusively for ticket holders.</p>
        {onPurchase && (
          <Button onClick={onPurchase} disabled={disabled} className="mt-2">
            Buy Ticket
          </Button>
        )}
      </div>
    </div>
  );
}

export function StreamEmbed({
  streamType,
  streamUrl,
  hasAccess,
  onPurchase,
  purchasing,
}: {
  streamType: string;
  streamUrl: string;
  hasAccess: boolean;
  onPurchase?: () => void;
  purchasing?: boolean;
}) {
  if (!hasAccess) return <LockedStream onPurchase={onPurchase} disabled={purchasing} />;
  if (streamType === "mux") return <MuxEmbed url={streamUrl} />;
  return <YoutubeEmbed url={streamUrl} />;
}
