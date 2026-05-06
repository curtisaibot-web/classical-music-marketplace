import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Teachers from "@/pages/teachers";
import TeacherProfile from "@/pages/teachers/profile";
import Masterclasses from "@/pages/masterclasses";
import MasterclassDetail from "@/pages/masterclasses/detail";
import Store from "@/pages/store";
import StoreDetail from "@/pages/store/detail";
import SignInPage from "@/pages/auth/sign-in";
import SignUpPage from "@/pages/auth/sign-up";
import Onboard from "@/pages/onboard";
import StudentDashboard from "@/pages/student/dashboard";
import StudentBookings from "@/pages/student/bookings";
import StudentOrders from "@/pages/student/orders";
import TeacherDashboard from "@/pages/teacher/dashboard";
import TeacherListings from "@/pages/teacher/listings";
import TeacherDigitalProducts from "@/pages/teacher/digital-products";
import TeacherProfileEdit from "@/pages/teacher/profile-edit";
import BusinessSuite from "@/pages/teacher/business-suite";
import BrowseListings from "@/pages/browse";
import Events from "@/pages/events";
import EventDetail from "@/pages/events/detail";
import Gigs from "@/pages/gigs";
import MusicianProfile from "@/pages/musicians/slug";
import PaymentSuccess from "@/pages/payment/success";
import PaymentCancel from "@/pages/payment/cancel";
import Concerts from "@/pages/concerts";
import ConcertDetail from "@/pages/concerts/detail";
import TeacherCampaigns from "@/pages/teacher/campaigns";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(43, 60%, 55%)",
    colorForeground: "hsl(220, 30%, 15%)",
    colorMutedForeground: "hsl(220, 15%, 45%)",
    colorDanger: "hsl(0, 70%, 50%)",
    colorBackground: "hsl(44, 25%, 98%)",
    colorInput: "hsl(44, 10%, 85%)",
    colorInputForeground: "hsl(220, 30%, 15%)",
    colorNeutral: "hsl(44, 10%, 85%)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0.375rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-card rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-border",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-serif font-semibold text-foreground",
    headerSubtitle: "text-sm text-muted-foreground",
    socialButtonsBlockButtonText: "font-medium text-foreground",
    formFieldLabel: "text-sm font-medium text-foreground",
    footerActionLink: "text-primary hover:text-primary/90 font-medium",
    footerActionText: "text-muted-foreground text-sm",
    dividerText: "text-xs text-muted-foreground",
    identityPreviewEditButton: "text-primary hover:text-primary/90",
    formFieldSuccessText: "text-green-600 text-xs",
    alertText: "text-sm text-destructive",
    logoBox: "h-12 w-auto mb-4",
    logoImage: "h-full w-auto object-contain",
    socialButtonsBlockButton: "border-border hover:bg-secondary/50",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
    formFieldInput: "bg-background border-input text-foreground placeholder:text-muted-foreground",
    footerAction: "bg-muted/30 pt-4 pb-6 px-8 border-t border-border flex justify-center items-center gap-2",
    dividerLine: "bg-border",
    alert: "bg-destructive/10 border-destructive/20",
    otpCodeFieldInput: "border-input text-foreground",
    formFieldRow: "mb-4",
    main: "px-8 py-6",
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) return <div className="h-screen w-full bg-background"></div>;

  return (
    <>
      <Show when="signed-in">
        <AuthRouter />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function AuthRouter() {
  const { data: user, isLoading } = useGetMe();
  
  if (isLoading) return <div className="h-screen w-full bg-background flex items-center justify-center"><div className="animate-pulse flex flex-col items-center gap-4"><div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div><p className="text-muted-foreground font-serif">Loading...</p></div></div>;
  
  if (!user?.role) {
    return <Redirect to="/onboard" />;
  }
  
  if (user.role === 'teacher') {
    return <Redirect to="/teacher-dashboard" />;
  }
  
  return <Redirect to="/dashboard" />;
}

import { useGetMe } from "@workspace/api-client-react";

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access your account",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Join the premier classical music marketplace",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/onboard" component={Onboard} />
          
          <Route path="/teachers" component={Teachers} />
          <Route path="/teachers/:userId" component={TeacherProfile} />

          <Route path="/musicians" component={Teachers} />
          <Route path="/musicians/:slug" component={MusicianProfile} />
          
          <Route path="/masterclasses" component={Masterclasses} />
          <Route path="/masterclasses/:id" component={MasterclassDetail} />
          
          <Route path="/browse" component={BrowseListings} />

          <Route path="/events" component={Events} />
          <Route path="/events/:id" component={EventDetail} />
          <Route path="/gigs" component={Gigs} />

          <Route path="/store" component={Store} />
          <Route path="/store/:id" component={StoreDetail} />
          
          <Route path="/dashboard" component={StudentDashboard} />
          <Route path="/bookings" component={StudentBookings} />
          <Route path="/orders" component={StudentOrders} />
          
          <Route path="/teacher-dashboard" component={TeacherDashboard} />
          <Route path="/listings" component={TeacherListings} />
          <Route path="/digital-products" component={TeacherDigitalProducts} />
          <Route path="/profile/edit" component={TeacherProfileEdit} />
          <Route path="/business-suite" component={BusinessSuite} />
          <Route path="/campaigns" component={TeacherCampaigns} />

          <Route path="/concerts" component={Concerts} />
          <Route path="/concerts/:id" component={ConcertDetail} />

          <Route path="/payment/success" component={PaymentSuccess} />
          <Route path="/payment/cancel" component={PaymentCancel} />
          
          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
