import { SignUp } from "@clerk/react";

export default function SignUpPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <div className="min-h-screen flex">
      {/* Left side - form */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24 bg-background">
        <div className="mx-auto w-full max-w-sm lg:w-[440px]">
          <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
        </div>
      </div>
      
      {/* Right side - image */}
      <div className="hidden lg:block relative w-0 flex-1 bg-muted">
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src={`${basePath}/hero.png`}
          alt="Classical music atmosphere"
        />
        <div className="absolute inset-0 bg-foreground/40 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-transparent to-transparent" />
        <div className="absolute bottom-12 left-12 right-12 text-background">
          <h2 className="text-3xl font-serif font-semibold mb-2">Join Our Community</h2>
          <p className="text-lg opacity-90">Discover teachers, attend masterclasses, and explore sheet music.</p>
        </div>
      </div>
    </div>
  );
}
