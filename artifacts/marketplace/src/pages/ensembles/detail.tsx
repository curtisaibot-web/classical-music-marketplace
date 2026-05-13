import { useRoute, Link } from "wouter";
import { useGetEnsemble, getGetEnsembleQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Music2, Users, ExternalLink, Calendar, Ticket } from "lucide-react";

function youtubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    let videoId: string | null = null;
    if (parsed.hostname === "youtu.be") {
      videoId = parsed.pathname.slice(1);
    } else if (
      parsed.hostname === "www.youtube.com" ||
      parsed.hostname === "youtube.com"
    ) {
      videoId = parsed.searchParams.get("v");
    }
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}`;
  } catch {
    return null;
  }
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default function EnsembleDetail() {
  const [, params] = useRoute("/ensembles/:slug");
  const slug = params?.slug ?? "";

  const { data: ensemble, isLoading, error } = useGetEnsemble(slug, {
    query: { enabled: !!slug, queryKey: getGetEnsembleQueryKey(slug) },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading ensemble…</div>
      </div>
    );
  }

  if (error || !ensemble) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h2 className="text-2xl font-bold">Ensemble not found</h2>
        <Link href="/ensembles">
          <Button variant="outline">Browse ensembles</Button>
        </Link>
      </div>
    );
  }

  const activeMembers = ensemble.members?.filter((m) => m.status === "active") ?? [];
  const activeListings = ensemble.listings ?? [];
  const embedUrls = (ensemble.recordings ?? [])
    .map((r) => youtubeEmbedUrl(r))
    .filter((u): u is string => u !== null);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative h-64 sm:h-80 bg-gradient-to-br from-amber-900 to-stone-900 overflow-hidden">
        {ensemble.photoUrl && (
          <img
            src={ensemble.photoUrl}
            alt={ensemble.name}
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
        )}
        <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10">
          <div className="flex items-end gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-2 mb-2">
                {(ensemble.genres ?? []).map((g) => (
                  <Badge key={g} variant="secondary" className="text-xs">
                    {g}
                  </Badge>
                ))}
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white truncate">
                {ensemble.name}
              </h1>
              {ensemble.city && (
                <div className="flex items-center gap-1 mt-1 text-white/70 text-sm">
                  <MapPin className="h-4 w-4" />
                  {ensemble.city}
                </div>
              )}
            </div>
            {ensemble.priceInCents && (
              <div className="text-right shrink-0">
                <p className="text-white/60 text-xs mb-0.5">From</p>
                <p className="text-2xl font-bold text-white">
                  {formatPrice(ensemble.priceInCents)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Bio */}
          {ensemble.bio && (
            <section>
              <h2 className="text-xl font-semibold mb-3">About</h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {ensemble.bio}
              </p>
            </section>
          )}

          {/* Instruments */}
          {(ensemble.instruments ?? []).length > 0 && (
            <section>
              <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <Music2 className="h-5 w-5" /> Instruments
              </h2>
              <div className="flex flex-wrap gap-2">
                {ensemble.instruments.map((inst) => (
                  <Badge key={inst} variant="outline">
                    {inst}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* Available event listings */}
          {activeListings.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-5 w-5" /> Book This Ensemble
              </h2>
              <div className="space-y-3">
                {activeListings.map((listing) => (
                  <Card key={listing.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex items-center gap-4">
                      {listing.imageUrl && (
                        <img
                          src={listing.imageUrl}
                          alt={listing.title}
                          className="h-16 w-16 rounded-lg object-cover shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight truncate">{listing.title}</p>
                        {listing.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {listing.description}
                          </p>
                        )}
                        {listing.city && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {listing.city}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold text-base">{formatPrice(listing.priceInCents)}</p>
                        <Link href={`/events/${listing.id}`}>
                          <Button size="sm" className="mt-2 h-8 text-xs gap-1">
                            <Ticket className="h-3.5 w-3.5" />
                            Book Now
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Members */}
          {activeMembers.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <Users className="h-5 w-5" /> Members
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {activeMembers.map((member) => {
                  const name =
                    (member.user
                      ? [member.user.firstName, member.user.lastName]
                          .filter(Boolean)
                          .join(" ") || member.inviteEmail
                      : member.inviteEmail) ?? "Member";
                  const avatar =
                    member.profile?.profileImageUrl ??
                    member.user?.imageUrl ??
                    "";
                  const initials = name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2);
                  const profileHref = member.profile?.profileSlug
                    ? `/musicians/${member.profile.profileSlug}`
                    : member.userId
                    ? `/teachers/${member.userId}`
                    : null;

                  const content = (
                    <Card className="hover:shadow-md transition-shadow cursor-default">
                      <CardContent className="p-4 flex flex-col items-center text-center gap-3">
                        <Avatar className="h-16 w-16">
                          <AvatarImage src={avatar} alt={name} />
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-sm leading-tight">{name}</p>
                          {member.profile?.instruments &&
                            member.profile.instruments.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {member.profile.instruments.slice(0, 2).join(", ")}
                              </p>
                            )}
                          {member.profile?.city && (
                            <p className="text-xs text-muted-foreground">
                              {member.profile.city}
                            </p>
                          )}
                        </div>
                        {profileHref && (
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </CardContent>
                    </Card>
                  );

                  return profileHref ? (
                    <Link key={member.id} href={profileHref}>
                      {content}
                    </Link>
                  ) : (
                    <div key={member.id}>{content}</div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Recordings */}
          {embedUrls.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold mb-3">Recordings</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {embedUrls.map((url, i) => (
                  <div
                    key={i}
                    className="aspect-video rounded-xl overflow-hidden border"
                  >
                    <iframe
                      src={url}
                      title={`Recording ${i + 1}`}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Booking sidebar */}
        <div className="space-y-4">
          <Card className="sticky top-6">
            <CardContent className="p-6 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  {activeListings.length > 0 ? "Available to book" : "Booking enquiry"}
                </p>
                {ensemble.priceInCents ? (
                  <p className="text-3xl font-bold mt-1">
                    {formatPrice(ensemble.priceInCents)}
                    <span className="text-base font-normal text-muted-foreground"> / event</span>
                  </p>
                ) : (
                  <p className="text-lg font-semibold mt-1 text-muted-foreground">
                    Price on request
                  </p>
                )}
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{activeMembers.length} member{activeMembers.length !== 1 ? "s" : ""}</span>
                </div>
                {ensemble.city && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{ensemble.city}</span>
                  </div>
                )}
                {activeListings.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{activeListings.length} event listing{activeListings.length !== 1 ? "s" : ""} available</span>
                  </div>
                )}
              </div>

              <Separator />

              {activeListings.length > 0 ? (
                <div className="space-y-2">
                  {activeListings.slice(0, 3).map((listing) => (
                    <Link key={listing.id} href={`/events/${listing.id}`}>
                      <Button variant="outline" className="w-full justify-between text-sm h-9" size="sm">
                        <span className="truncate">{listing.title}</span>
                        <span className="shrink-0 ml-2 font-semibold">{formatPrice(listing.priceInCents)}</span>
                      </Button>
                    </Link>
                  ))}
                  {activeListings.length > 3 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{activeListings.length - 3} more above
                    </p>
                  )}
                </div>
              ) : (
                <Button className="w-full" size="lg" asChild>
                  <a href={`mailto:contact@harmonia.music?subject=Booking enquiry — ${encodeURIComponent(ensemble.name)}`}>
                    Enquire about booking
                  </a>
                </Button>
              )}

              <p className="text-xs text-muted-foreground text-center">
                {activeListings.length > 0
                  ? "Revenue is automatically split among all members"
                  : "We typically respond within 24 hours"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
