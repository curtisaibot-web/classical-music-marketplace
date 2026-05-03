import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-foreground text-background py-12 border-t border-border">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Logo" className="h-8 w-auto brightness-0 invert" />
            <span className="font-serif font-semibold text-lg">Harmonia</span>
          </div>
          <p className="text-sm text-muted-foreground/60 max-w-xs">
            The premier marketplace for classical musicians, students, and enthusiasts.
          </p>
        </div>
        <div>
          <h4 className="font-medium mb-4">Discover</h4>
          <ul className="space-y-2 text-sm text-muted-foreground/80">
            <li><Link href="/teachers" className="hover:text-background transition-colors">Find a Teacher</Link></li>
            <li><Link href="/masterclasses" className="hover:text-background transition-colors">Masterclasses</Link></li>
            <li><Link href="/store" className="hover:text-background transition-colors">Sheet Music & Plans</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-medium mb-4">For Musicians</h4>
          <ul className="space-y-2 text-sm text-muted-foreground/80">
            <li><Link href="/sign-up" className="hover:text-background transition-colors">Teach with Us</Link></li>
            <li><Link href="/sign-up" className="hover:text-background transition-colors">Sell Digital Products</Link></li>
            <li><Link href="/sign-up" className="hover:text-background transition-colors">Host a Masterclass</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-medium mb-4">Legal</h4>
          <ul className="space-y-2 text-sm text-muted-foreground/80">
            <li><a href="#" className="hover:text-background transition-colors">Terms of Service</a></li>
            <li><a href="#" className="hover:text-background transition-colors">Privacy Policy</a></li>
            <li><a href="#" className="hover:text-background transition-colors">Cookie Policy</a></li>
          </ul>
        </div>
      </div>
      <div className="container mx-auto px-4 mt-12 pt-8 border-t border-muted-foreground/20 text-center text-sm text-muted-foreground/60">
        &copy; {new Date().getFullYear()} Harmonia Marketplace. All rights reserved.
      </div>
    </footer>
  );
}
