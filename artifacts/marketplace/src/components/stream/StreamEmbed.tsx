import { Video, ExternalLink, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function MuxEmbed({ url }: { url: string }) {
  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden bg-black flex items-center justify-center">
      <div className="text-center space-y-2 text-white">
        <Video className="h-12 w-12 mx-auto opacity-50" />
        <p className="text-sm opacity-70">Mux stream</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline flex items-center gap-1 justify-center">
          Open stream <ExternalLink className="h-3 w-3" />
        </a>
      </div>
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
