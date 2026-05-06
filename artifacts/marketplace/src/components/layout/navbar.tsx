import { Link } from "wouter";
import { Show, useClerk, useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { useGetMe } from "@workspace/api-client-react";
import { useOrg } from "@/context/OrgContext";

export function Navbar() {
  const { signOut } = useClerk();
  const { data: dbUser } = useGetMe();
  const { user: clerkUser } = useUser();
  const { org, orgSlug } = useOrg();

  const role =
    dbUser?.role ??
    ((clerkUser?.publicMetadata?.role as string | undefined) || null);

  const orgSuffix = orgSlug ? `?org=${orgSlug}` : "";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          {org ? (
            <Link href={`/${orgSuffix}`} className="flex items-center gap-2">
              {org.logoUrl ? (
                <img src={org.logoUrl} alt={org.name} className="h-8 w-auto object-contain" />
              ) : (
                <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Logo" className="h-8 w-auto" />
              )}
              <span className="font-serif font-semibold text-lg hidden sm:inline-block text-primary">{org.name}</span>
            </Link>
          ) : (
            <Link href="/" className="flex items-center gap-2">
              <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Logo" className="h-8 w-auto" />
              <span className="font-serif font-semibold text-lg hidden sm:inline-block text-primary">Harmonia</span>
            </Link>
          )}
          <nav className="hidden md:flex gap-6">
            <Link href={`/teachers${orgSuffix}`} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Teachers</Link>
            {!orgSlug && <>
              <Link href="/musicians" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Musicians</Link>
              <Link href="/masterclasses" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Masterclasses</Link>
              <Link href="/concerts" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Concerts</Link>
              <Link href="/events" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Events</Link>
              <Link href="/gigs" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Gigs</Link>
              <Link href="/browse" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Browse</Link>
              <Link href="/store" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Store</Link>
              <Link href="/scores" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Scores</Link>
              <Link href="/coaching" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Coaching</Link>
              <Link href="/audition-prep" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Audition Prep</Link>
            </>}
            {orgSlug && (
              <Link href={`/org-admin${orgSuffix}`} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Admin</Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Show when="signed-out">
            <div className="flex items-center gap-2">
              <Link href="/sign-in" className="text-sm font-medium hover:underline px-3 py-2">Log in</Link>
              <Link href="/sign-up" className="text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md transition-colors">Sign up</Link>
            </div>
          </Show>
          <Show when="signed-in">
            <nav className="flex items-center gap-4">
              {role === 'teacher' ? (
                <>
                  <Link href="/teacher-dashboard" className="text-sm font-medium hover:underline">Dashboard</Link>
                  <Link href="/listings" className="text-sm font-medium hover:underline hidden sm:inline-block">Listings</Link>
                  <Link href="/digital-products" className="text-sm font-medium hover:underline hidden sm:inline-block">Products</Link>
                  <Link href="/campaigns" className="text-sm font-medium hover:underline hidden sm:inline-block">Campaigns</Link>
                  <Link href="/audition-programs" className="text-sm font-medium hover:underline hidden sm:inline-block">Audition Prep</Link>
                  <Link href="/business-suite" className="text-sm font-medium hover:underline hidden sm:inline-block text-amber-600">Business Suite</Link>
                </>
              ) : role === 'student' ? (
                <>
                  <Link href="/dashboard" className="text-sm font-medium hover:underline">Dashboard</Link>
                  <Link href="/bookings" className="text-sm font-medium hover:underline hidden sm:inline-block">Bookings</Link>
                  <Link href="/orders" className="text-sm font-medium hover:underline hidden sm:inline-block">Downloads</Link>
                </>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => signOut()}>Sign out</Button>
            </nav>
          </Show>
        </div>
      </div>
    </header>
  );
}
