import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { useGetTeacher, useGetTeacherListings, useGetTeacherReviews, useCreateBooking, useCreateBookingCheckout, useGetUserReel, useListAuditionPrograms, getGetTeacherQueryKey, getGetTeacherListingsQueryKey, getGetTeacherReviewsQueryKey, getGetUserReelQueryKey, getListAuditionProgramsQueryKey, CreateBookingBodyType } from "@workspace/api-client-react";
import { usePageMeta } from "@/hooks/use-page-meta";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, MapPin, GraduationCap, CalendarDays, CheckCircle, Mic2, BookOpen, Music2, Sparkles, Clock, Globe, Award, Volume2, VolumeX, Crown } from "lucide-react";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import { resolveImageUrl } from "@/lib/image-url";

const TABS = ["lessons", "masterclasses", "events", "audition-prep"] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  lessons: "Lessons",
  masterclasses: "Masterclasses",
  events: "Events",
  "audition-prep": "Audition Prep",
};

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  lessons: <BookOpen className="h-4 w-4" />,
  masterclasses: <Sparkles className="h-4 w-4" />,
  events: <Music2 className="h-4 w-4" />,
  "audition-prep": <GraduationCap className="h-4 w-4" />,
};

function StarRating({ rating, max = 5, size = "sm" }: { rating: number; max?: number; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "h-5 w-5" : size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <div className="flex items-center gap-0.5">
      {[...Array(max)].map((_, i) => (
        <Star
          key={i}
          className={`${cls} ${i < rating ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

export default function TeacherProfile() {
  const { userId } = useParams<{ userId: string }>();
  const { user, isLoaded } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>("lessons");
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingSlot, setBookingSlot] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");

  const TIME_SLOTS = [
    "08:00", "09:00", "10:00", "11:00", "12:00",
    "13:00", "14:00", "15:00", "16:00", "17:00",
    "18:00", "19:00", "20:00",
  ];

  const formatSlot = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  const todayStr = new Date().toISOString().split("T")[0];

  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventType, setEventType] = useState("wedding");
  const [eventDate, setEventDate] = useState("");
  const [eventNotes, setEventNotes] = useState("");
  const [eventSuccess, setEventSuccess] = useState(false);

  const { data: teacher, isLoading: isLoadingTeacher } = useGetTeacher(userId, {
    query: { enabled: !!userId, queryKey: getGetTeacherQueryKey(userId) }
  });

  const { data: listingsData } = useGetTeacherListings(userId, {
    query: { enabled: !!userId, queryKey: getGetTeacherListingsQueryKey(userId) }
  });

  const { data: reviewsData } = useGetTeacherReviews(userId, undefined, {
    query: { enabled: !!userId, queryKey: getGetTeacherReviewsQueryKey(userId) }
  });

  const { data: reel } = useGetUserReel(userId, {
    query: { enabled: !!userId, queryKey: getGetUserReelQueryKey(userId) }
  });

  const { data: auditionProgramsData } = useListAuditionPrograms(
    { teacherId: userId },
    { query: { enabled: !!userId, queryKey: getListAuditionProgramsQueryKey({ teacherId: userId }) } },
  );

  const [reelMuted, setReelMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  usePageMeta({
    title: teacher ? `${teacher.user?.firstName} ${teacher.user?.lastName} — ${teacher.instruments.join(", ")} Teacher` : "Teacher Profile",
    description: teacher?.bio ?? `Classical music teacher specializing in ${teacher?.instruments.join(", ")}. Based in ${teacher?.city || "Online"}.`,
    imageUrl: teacher?.profileImageUrl ?? undefined,
    type: "profile",
  });

  const createBooking = useCreateBooking();
  const createCheckout = useCreateBookingCheckout();

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleRequestEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please sign in to send an inquiry");
      return;
    }

    createBooking.mutate({
      data: {
        teacherId: userId,
        type: CreateBookingBodyType.event,
        scheduledAt: eventDate ? new Date(eventDate).toISOString() : undefined,
        eventType,
        notes: eventNotes,
        instrument: teacher?.instruments[0],
      }
    }, {
      onSuccess: () => {
        setEventSuccess(true);
      },
      onError: () => {
        toast.error("Failed to send inquiry. Please try again.");
      }
    });
  };

  const handleBookLesson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please sign in to book a lesson");
      return;
    }

    if (!bookingDate || !bookingSlot) {
      toast.error("Please select a date and time slot");
      return;
    }

    const scheduledAt = new Date(`${bookingDate}T${bookingSlot}:00`).toISOString();

    createBooking.mutate({
      data: {
        teacherId: userId,
        type: CreateBookingBodyType.lesson,
        scheduledAt,
        durationMinutes: 60,
        notes: bookingNotes,
        instrument: teacher?.instruments[0],
      }
    }, {
      onSuccess: (booking) => {
        const successUrl = `${window.location.origin}${basePath}/payment/success?type=booking&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${window.location.origin}${basePath}/payment/cancel`;

        createCheckout.mutate({
          data: { bookingId: booking.id, successUrl, cancelUrl }
        }, {
          onSuccess: (data) => {
            setBookingModalOpen(false);
            setBookingDate("");
            setBookingSlot("");
            setBookingNotes("");
            if (data.checkoutUrl) {
              window.location.href = data.checkoutUrl;
            }
          },
          onError: () => {
            toast.success("Lesson request sent! Complete payment from your dashboard.");
            setBookingModalOpen(false);
            setBookingDate("");
            setBookingSlot("");
            setBookingNotes("");
          }
        });
      },
      onError: () => {
        toast.error("Failed to send request. Please try again.");
      }
    });
  };

  const isBookingPending = createBooking.isPending || createCheckout.isPending;

  const lessons = listingsData?.listings.filter(l => l.type === "lesson") ?? [];
  const masterclasses = listingsData?.listings.filter(l => l.type === "masterclass") ?? [];
  const events = listingsData?.listings.filter(l => l.type === "event") ?? [];

  const tabListings: Record<Exclude<Tab, "audition-prep">, typeof lessons> = {
    lessons,
    masterclasses,
    events,
  };

  const auditionPrograms = auditionProgramsData?.programs ?? [];

  const tabCount = (tab: Tab): number => {
    if (tab === "audition-prep") return auditionPrograms.length;
    return tabListings[tab].length;
  };

  // Auto-select the first populated tab once data loads (avoids misleading empty lessons panel)
  useEffect(() => {
    if (!listingsData || !auditionProgramsData) return;
    setActiveTab((current) => {
      if (current !== "lessons") return current; // user already changed tab — don't override
      const firstPopulated = TABS.find((t) => tabCount(t) > 0);
      return firstPopulated ?? current;
    });
  // tabCount is stable within a render; listingsData/auditionProgramsData are the triggers
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingsData, auditionProgramsData]);

  if (isLoadingTeacher) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="animate-pulse">
          <div className="h-72 bg-muted w-full" />
          <div className="container mx-auto px-4 py-10 max-w-6xl space-y-6">
            <div className="h-8 bg-muted rounded w-64" />
            <div className="h-4 bg-muted rounded w-96" />
            <div className="h-32 bg-muted rounded-xl" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!teacher) return <div className="p-8 text-center">Teacher not found</div>;

  const portraitUrl = resolveImageUrl(teacher.profileImageUrl, basePath);
  const firstName = teacher.user?.firstName ?? "";
  const lastName = teacher.user?.lastName ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  const avgRating = teacher.averageRating / 100;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      {/* ── Hero Banner ── */}
      <div className="relative w-full h-80 md:h-96 overflow-hidden bg-stone-900">
        {reel?.status === "ready" && reel?.processedFileUrl ? (
          <>
            <video
              ref={videoRef}
              src={reel.processedFileUrl}
              autoPlay
              muted={reelMuted}
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-stone-900/30 to-transparent" />
            <button
              onClick={() => {
                setReelMuted((m) => !m);
                if (videoRef.current) videoRef.current.muted = !reelMuted;
              }}
              className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition"
              title={reelMuted ? "Unmute" : "Mute"}
            >
              {reelMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </>
        ) : portraitUrl ? (
          <>
            <img
              src={portraitUrl}
              alt={fullName}
              className="absolute inset-0 w-full h-full object-cover object-top opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-stone-900/50 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-stone-800 to-stone-950" />
        )}

        {/* Hero content anchored to bottom */}
        <div className="absolute bottom-0 left-0 right-0 container mx-auto px-4 pb-8 max-w-6xl">
          <div className="flex flex-col md:flex-row md:items-end gap-6">
            {/* Avatar circle */}
            <div className="h-24 w-24 md:h-32 md:w-32 rounded-full border-4 border-white/20 overflow-hidden bg-stone-700 shrink-0 shadow-xl">
              {portraitUrl ? (
                <img src={portraitUrl} alt={fullName} className="w-full h-full object-cover object-top" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/30">
                  <Award className="h-12 w-12" />
                </div>
              )}
            </div>

            {/* Name / instruments */}
            <div className="flex-1 text-white">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-3xl md:text-4xl font-serif font-bold leading-tight">
                  {fullName}
                </h1>
                {teacher.isVerified && (
                  <CheckCircle className="h-6 w-6 text-emerald-400 shrink-0" />
                )}
                {(teacher as { isProSubscriber?: boolean }).isProSubscriber && (
                  <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-md shrink-0">
                    <Crown className="h-3 w-3" />PRO
                  </span>
                )}
              </div>
              <p className="text-lg text-white/80 font-medium mb-3">
                {teacher.instruments.join(" · ")}
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-white/60">
                {teacher.city && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {teacher.city}
                  </span>
                )}
                {teacher.yearsExperience != null && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {teacher.yearsExperience} yrs experience
                  </span>
                )}
                {teacher.reviewCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="text-white/90 font-semibold">{avgRating.toFixed(1)}</span>
                    <span>({teacher.reviewCount} review{teacher.reviewCount !== 1 ? "s" : ""})</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <main className="flex-1 container mx-auto px-4 py-10 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

          {/* Left / Main column */}
          <div className="lg:col-span-2 space-y-10">

            {/* Instrument badges + genres */}
            <div className="flex flex-wrap gap-2">
              {teacher.instruments.map(inst => (
                <Badge key={inst} className="bg-primary/10 text-primary border-primary/20 font-medium px-3 py-1 text-sm">
                  {inst}
                </Badge>
              ))}
              {teacher.genres.map(g => (
                <Badge key={g} variant="secondary" className="font-normal px-3 py-1 text-sm">
                  {g}
                </Badge>
              ))}
            </div>

            {/* About */}
            <section>
              <h2 className="text-xl font-serif font-semibold mb-3 text-foreground">About</h2>
              {teacher.bio ? (
                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{teacher.bio}</p>
              ) : (
                <p className="text-muted-foreground italic">No biography provided.</p>
              )}
            </section>

            {/* Education */}
            {teacher.education && (
              <section>
                <h2 className="text-xl font-serif font-semibold mb-3 text-foreground flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-primary" />
                  Education
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{teacher.education}</p>
              </section>
            )}

            {/* Offerings Tabs — listings + audition prep */}
            {(listingsData && listingsData.listings.length > 0) || auditionPrograms.length > 0 ? (
              <section>
                <h2 className="text-xl font-serif font-semibold mb-4 text-foreground">Offerings</h2>

                {/* Tab bar */}
                <div className="flex flex-wrap gap-1 mb-5 border-b border-border">
                  {TABS.map(tab => {
                    const count = tabCount(tab);
                    if (count === 0) return null;
                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                          activeTab === tab
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {TAB_ICONS[tab]}
                        {TAB_LABELS[tab]}
                        <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                          activeTab === tab ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        }`}>{count}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Tab panels — audition prep */}
                {activeTab === "audition-prep" && (() => {
                  const LEVEL_LABELS: Record<string, string> = {
                    undergraduate: "Undergraduate",
                    postgrad: "Postgraduate",
                    professional_orchestra: "Professional Orchestra",
                  };
                  const LEVEL_COLORS: Record<string, string> = {
                    undergraduate: "bg-blue-100 text-blue-800",
                    postgrad: "bg-purple-100 text-purple-800",
                    professional_orchestra: "bg-amber-100 text-amber-800",
                  };
                  return (
                    <div className="grid gap-4">
                      {auditionPrograms.map(program => (
                        <Card key={program.id} className="border-border hover:border-primary/30 transition-colors">
                          <CardContent className="p-5 flex gap-4 items-start">
                            <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                              <GraduationCap className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-foreground mb-1">{program.title}</h4>
                              {program.syllabusText && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{program.syllabusText}</p>
                              )}
                              <div className="flex flex-wrap gap-2">
                                <Badge className={`text-xs font-medium ${LEVEL_COLORS[program.targetLevel] ?? ""}`}>
                                  {LEVEL_LABELS[program.targetLevel] ?? program.targetLevel}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">{program.instrument}</Badge>
                                <Badge variant="secondary" className="text-xs">{program.sessionCount} sessions</Badge>
                              </div>
                            </div>
                            <div className="shrink-0 text-right flex flex-col items-end gap-2">
                              <div>
                                <div className="text-lg font-bold text-foreground">
                                  ${(program.priceCents / 100).toFixed(0)}
                                </div>
                                <div className="text-xs text-muted-foreground">full package</div>
                              </div>
                              <Button size="sm" asChild>
                                <a href={`${import.meta.env.BASE_URL}audition-prep/${program.id}`}>View Program</a>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  );
                })()}

                {/* Tab panels — listings (lessons / masterclasses / events) */}
                {activeTab !== "audition-prep" && (
                  tabListings[activeTab as Exclude<Tab, "audition-prep">].length === 0 ? (
                    <p className="text-muted-foreground italic text-sm py-4">
                      No {TAB_LABELS[activeTab].toLowerCase()} available yet.
                    </p>
                  ) : (
                    <div className="grid gap-4">
                      {tabListings[activeTab as Exclude<Tab, "audition-prep">].map(listing => (
                        <Card key={listing.id} className="border-border hover:border-primary/30 transition-colors">
                          <CardContent className="p-5 flex gap-4 items-start">
                            <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                              {activeTab === "lessons" && <BookOpen className="h-5 w-5" />}
                              {activeTab === "masterclasses" && <Sparkles className="h-5 w-5" />}
                              {activeTab === "events" && <Music2 className="h-5 w-5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-foreground mb-1">{listing.title}</h4>
                              {listing.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{listing.description}</p>
                              )}
                              <div className="flex flex-wrap gap-2">
                                {listing.skillLevel && listing.skillLevel !== "all" && (
                                  <Badge variant="secondary" className="text-xs capitalize font-normal">
                                    {listing.skillLevel}
                                  </Badge>
                                )}
                                {listing.durationMinutes && (
                                  <Badge variant="secondary" className="text-xs font-normal">
                                    <Clock className="h-2.5 w-2.5 mr-1" />
                                    {listing.durationMinutes} min
                                  </Badge>
                                )}
                                {listing.isOnline && (
                                  <Badge variant="secondary" className="text-xs font-normal">
                                    <Globe className="h-2.5 w-2.5 mr-1" />
                                    Online
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right flex flex-col items-end gap-2">
                              <div>
                                <div className="text-lg font-bold text-foreground">
                                  ${(listing.priceInCents / 100).toFixed(0)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {listing.currency?.toUpperCase() ?? "USD"}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant={activeTab === "lessons" ? "default" : "outline"}
                                className="text-xs h-8 px-3"
                                onClick={() => {
                                  if (!isLoaded || !user) {
                                    toast.error("Please sign in first");
                                    return;
                                  }
                                  if (activeTab === "lessons") {
                                    setBookingModalOpen(true);
                                  } else {
                                    setEventSuccess(false);
                                    setEventModalOpen(true);
                                  }
                                }}
                              >
                                {activeTab === "lessons" && "Book"}
                                {activeTab === "masterclasses" && "Inquire"}
                                {activeTab === "events" && "Inquire"}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )
                )}
              </section>
            ) : null}

            {/* Reviews */}
            <section>
              <div className="flex items-center gap-3 mb-5">
                <h2 className="text-xl font-serif font-semibold text-foreground">Reviews</h2>
                {teacher.reviewCount > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <StarRating rating={Math.round(avgRating)} size="sm" />
                    <span className="font-semibold text-foreground">{avgRating.toFixed(1)}</span>
                    <span>· {teacher.reviewCount} review{teacher.reviewCount !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>

              {!reviewsData?.reviews.length ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                  <Star className="h-8 w-8 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No reviews yet. Be the first to book a lesson!</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {reviewsData.reviews.map((review) => (
                    <Card key={review.id} className="border-border">
                      <CardContent className="p-5">
                        {/* Reviewer header */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-10 w-10 rounded-full bg-muted overflow-hidden shrink-0">
                            {review.reviewer?.imageUrl ? (
                              <img src={review.reviewer.imageUrl} alt="Reviewer" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary font-semibold text-sm">
                                {review.reviewer?.firstName?.[0] ?? "?"}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-foreground truncate">
                              {review.reviewer?.firstName} {review.reviewer?.lastName}
                            </div>
                            <StarRating rating={review.rating} size="sm" />
                          </div>
                          <div className="text-xs text-muted-foreground shrink-0">
                            {new Date(review.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                          </div>
                        </div>

                        {/* Review text */}
                        {review.title && (
                          <h4 className="font-semibold text-sm text-foreground mb-1">{review.title}</h4>
                        )}
                        {review.body && (
                          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{review.body}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

          </div>

          {/* ── Right sidebar ── */}
          <div className="space-y-6">

            {/* Booking card */}
            <Card className="border-border sticky top-24 shadow-sm">
              <CardContent className="p-6">
                <div className="text-center mb-5">
                  <div className="text-3xl font-bold text-foreground mb-0.5">
                    ${(teacher.hourlyRate! / 100).toFixed(0)}
                    <span className="text-base font-normal text-muted-foreground">/hr</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Private Lessons</p>
                </div>

                <Button
                  className="w-full mb-3"
                  size="lg"
                  onClick={() => {
                    if (!isLoaded || !user) {
                      toast.error("Please sign in to book a lesson");
                      return;
                    }
                    setBookingModalOpen(true);
                  }}
                >
                  <GraduationCap className="h-4 w-4 mr-2" />
                  Request a Lesson
                </Button>

                <Button
                  variant="outline"
                  className="w-full mb-5"
                  size="lg"
                  onClick={() => {
                    if (!isLoaded || !user) {
                      toast.error("Please sign in to send an inquiry");
                      return;
                    }
                    setEventSuccess(false);
                    setEventModalOpen(true);
                  }}
                >
                  <Mic2 className="h-4 w-4 mr-2" />
                  Inquire for Event
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  You won't be charged until the teacher confirms.
                </p>
                {(teacher as { isProSubscriber?: boolean }).isProSubscriber && ((teacher as { cancellationPolicyHours?: number }).cancellationPolicyHours ?? 0) > 0 && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 text-left">
                    <strong>Cancellation policy:</strong>{" "}
                    {(teacher as { cancellationFeePercent?: number }).cancellationFeePercent
                      ? `Cancellations within ${(teacher as { cancellationPolicyHours?: number }).cancellationPolicyHours} hours incur a ${(teacher as { cancellationFeePercent?: number }).cancellationFeePercent}% fee.`
                      : `Free cancellation up to ${(teacher as { cancellationPolicyHours?: number }).cancellationPolicyHours} hours before the lesson.`}
                  </div>
                )}

                {/* Quick stats */}
                {(teacher.reviewCount > 0 || teacher.yearsExperience != null) && (
                  <div className="mt-5 pt-5 border-t border-border grid grid-cols-2 gap-3 text-center">
                    {teacher.reviewCount > 0 && (
                      <div>
                        <div className="text-lg font-bold text-foreground">{avgRating.toFixed(1)}</div>
                        <div className="text-xs text-muted-foreground">Avg Rating</div>
                      </div>
                    )}
                    {teacher.yearsExperience != null && (
                      <div>
                        <div className="text-lg font-bold text-foreground">{teacher.yearsExperience}</div>
                        <div className="text-xs text-muted-foreground">Years Exp.</div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Location / details card */}
            {(teacher.city || teacher.instruments.length > 0) && (
              <Card className="border-border">
                <CardContent className="p-5 space-y-3">
                  <h3 className="font-semibold text-sm text-foreground">Details</h3>
                  {teacher.city && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 shrink-0 text-primary" />
                      {teacher.city}
                    </div>
                  )}
                  {teacher.instruments.length > 0 && (
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <GraduationCap className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                      <span>{teacher.instruments.join(", ")}</span>
                    </div>
                  )}
                  {teacher.yearsExperience != null && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Award className="h-4 w-4 shrink-0 text-primary" />
                      {teacher.yearsExperience} years of teaching
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

        </div>
      </main>

      <Footer />

      {/* ── Book Lesson Modal ── */}
      <Dialog open={bookingModalOpen} onOpenChange={(open) => { setBookingModalOpen(open); if (!open) { setBookingDate(""); setBookingSlot(""); setBookingNotes(""); } }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Request a Lesson</DialogTitle>
            <DialogDescription>
              Pick a date and time slot. {firstName} will review and confirm your request.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBookLesson} className="space-y-6 pt-2">
            <div className="space-y-2">
              <Label htmlFor="lesson-date">Select Date</Label>
              <Input
                id="lesson-date"
                type="date"
                min={todayStr}
                value={bookingDate}
                onChange={(e) => { setBookingDate(e.target.value); setBookingSlot(""); }}
                required
                className="w-full"
              />
            </div>

            {bookingDate && (
              <div className="space-y-2">
                <Label>Select Time Slot</Label>
                <div className="grid grid-cols-4 gap-2">
                  {TIME_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setBookingSlot(slot)}
                      className={`rounded-md border px-2 py-2 text-sm font-medium transition-colors ${
                        bookingSlot === slot
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      {formatSlot(slot)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {bookingSlot && (
              <div className="rounded-md bg-primary/5 border border-primary/20 px-4 py-3 text-sm text-foreground flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                <span>
                  {new Date(`${bookingDate}T${bookingSlot}:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}{" "}
                  at {formatSlot(bookingSlot)} · 60 min
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="lesson-notes">
                Notes for {firstName} <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="lesson-notes"
                placeholder="What would you like to focus on? Skill level, goals, piece you're working on..."
                value={bookingNotes}
                onChange={(e) => setBookingNotes(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBookingModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!bookingDate || !bookingSlot || isBookingPending}>
                {isBookingPending ? "Opening checkout..." : "Continue to Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Event Inquiry Modal ── */}
      <Dialog open={eventModalOpen} onOpenChange={(open) => { setEventModalOpen(open); if (!open) setEventSuccess(false); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Inquire for Event / Wedding</DialogTitle>
            <DialogDescription>
              Tell {firstName} about your event. They'll respond with availability and a custom quote.
            </DialogDescription>
          </DialogHeader>
          {eventSuccess ? (
            <div className="py-8 flex flex-col items-center gap-4 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <CheckCircle className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-serif font-semibold text-foreground">Inquiry Sent!</h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                {firstName} has received your event inquiry and will respond shortly.
              </p>
              <Button onClick={() => setEventModalOpen(false)} className="mt-2">Close</Button>
            </div>
          ) : (
            <form onSubmit={handleRequestEvent} className="space-y-5 pt-4">
              <div className="space-y-2">
                <Label htmlFor="event-type">Event Type</Label>
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger id="event-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wedding">Wedding</SelectItem>
                    <SelectItem value="corporate">Corporate Event</SelectItem>
                    <SelectItem value="concert">Concert / Recital</SelectItem>
                    <SelectItem value="private_party">Private Party</SelectItem>
                    <SelectItem value="funeral">Funeral / Memorial</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-date">Event Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="event-date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-notes">Event Details</Label>
                <Textarea
                  id="event-notes"
                  placeholder="Describe the event, venue, duration, repertoire preferences, or any other details..."
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  rows={4}
                  required
                />
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setEventModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createBooking.isPending}>
                  {createBooking.isPending ? "Sending..." : "Send Inquiry"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
