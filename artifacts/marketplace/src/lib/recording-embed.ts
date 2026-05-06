export type EmbedType = "youtube" | "vimeo" | "soundcloud" | "audio";

export interface EmbedInfo {
  type: EmbedType;
  embedUrl: string | null;
}

export function getEmbedInfo(url: string): EmbedInfo {
  const trimmed = url.trim();

  const ytMatch = trimmed.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
  );
  if (ytMatch) {
    return {
      type: "youtube",
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`,
    };
  }

  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:.*#|.*\/videos\/|video\/|)([0-9]+)/);
  if (vimeoMatch) {
    return {
      type: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
    };
  }

  if (trimmed.includes("soundcloud.com")) {
    return {
      type: "soundcloud",
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(trimmed)}&auto_play=false&hide_related=true&show_comments=false&buying=false&download=false`,
    };
  }

  return { type: "audio", embedUrl: null };
}

export function embedLabel(type: EmbedType): string {
  switch (type) {
    case "youtube": return "YouTube";
    case "vimeo": return "Vimeo";
    case "soundcloud": return "SoundCloud";
    default: return "Audio";
  }
}
