import { useParams, Link } from "wouter";
import { useGetSeoLandingPage } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePageMeta } from "@/hooks/use-page-meta";
import { MapPin } from "lucide-react";

export default function SeoLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = useGetSeoLandingPage(slug ?? "");

  usePageMeta({
    title: data?.page?.title ?? "Find Classical Music Teachers",
    description: data?.page?.description ?? "Find verified classical music teachers and lessons.",
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-12 flex-1">
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded w-64" />
            <div className="h-4 bg-muted rounded w-96" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-12 flex-1 text-center">
          <p className="text-muted-foreground">Page not found.</p>
        </main>
        <Footer />
      </div>
    );
  }

  const teachers = data.teachers ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-6xl">
        <h1 className="text-4xl font-serif font-bold mb-4">{data.page.title}</h1>
        <p className="text-muted-foreground max-w-3xl mb-10 leading-relaxed">
          {data.page.introCopy || data.page.description}
        </p>

        {teachers.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            No teachers found for this category yet.{" "}
            <Link href="/teachers" className="text-primary hover:underline">Browse all teachers</Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teachers.map((teacher) => (
              <Card key={teacher.userId} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-5">
                  <Link
                    href={`/teachers/${teacher.userId}`}
                    className="font-semibold text-lg hover:text-primary block mb-1"
                  >
                    {(teacher as { user?: { firstName?: string; lastName?: string } }).user?.firstName}{" "}
                    {(teacher as { user?: { firstName?: string; lastName?: string } }).user?.lastName}
                  </Link>
                  <p className="text-sm text-muted-foreground mb-2">
                    {teacher.instruments?.join(" · ")}
                  </p>
                  {teacher.city && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
                      <MapPin className="h-3 w-3" /> {teacher.city}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {teacher.verificationStatus === "verified" && (
                      <Badge className="bg-emerald-600 text-white">Verified</Badge>
                    )}
                    {teacher.acceptsTrialLessons && (
                      <Badge variant="secondary">Trial Available</Badge>
                    )}
                    {teacher.hourlyRate && (
                      <Badge variant="outline">
                        ${(teacher.hourlyRate / 100).toFixed(0)}/hr
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
