import { useState, useEffect } from "react";
import { useGetMyTeacherProfile, useUpdateMyTeacherProfile } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function TeacherProfileEdit() {
  const { data: profile, isLoading } = useGetMyTeacherProfile();
  const updateProfile = useUpdateMyTeacherProfile();

  const [formData, setFormData] = useState({
    bio: "",
    instruments: "",
    genres: "",
    city: "",
    hourlyRate: 5000,
    yearsExperience: 0,
    education: ""
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        bio: profile.bio || "",
        instruments: profile.instruments.join(", "),
        genres: profile.genres.join(", "),
        city: profile.city || "",
        hourlyRate: profile.hourlyRate || 5000,
        yearsExperience: profile.yearsExperience || 0,
        education: profile.education || ""
      });
    }
  }, [profile]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    updateProfile.mutate({
      data: {
        bio: formData.bio,
        instruments: formData.instruments.split(",").map(s => s.trim()).filter(Boolean),
        genres: formData.genres.split(",").map(s => s.trim()).filter(Boolean),
        city: formData.city,
        hourlyRate: formData.hourlyRate,
        yearsExperience: formData.yearsExperience,
        education: formData.education
      }
    }, {
      onSuccess: () => toast.success("Profile updated successfully"),
      onError: () => toast.error("Failed to update profile")
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <div className="bg-muted py-10 border-b border-border">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-3xl font-serif font-bold text-foreground">Edit Profile</h1>
          <p className="text-muted-foreground mt-1">Update your public teacher profile.</p>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12 max-w-3xl">
        <form onSubmit={handleSubmit}>
          <div className="space-y-8">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="font-serif">Basic Information</CardTitle>
                <CardDescription>This information will be displayed publicly on your profile.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="bio">Biography</Label>
                  <Textarea 
                    id="bio" 
                    value={formData.bio}
                    onChange={(e) => setFormData({...formData, bio: e.target.value})}
                    placeholder="Tell prospective students about yourself..."
                    className="min-h-[150px]"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="instruments">Instruments (comma-separated)</Label>
                    <Input 
                      id="instruments" 
                      value={formData.instruments}
                      onChange={(e) => setFormData({...formData, instruments: e.target.value})}
                      placeholder="e.g. Piano, Violin, Music Theory"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="genres">Genres (comma-separated)</Label>
                    <Input 
                      id="genres" 
                      value={formData.genres}
                      onChange={(e) => setFormData({...formData, genres: e.target.value})}
                      placeholder="e.g. Classical, Jazz, Contemporary"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="city">City / Location</Label>
                    <Input 
                      id="city" 
                      value={formData.city}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                      placeholder="e.g. New York, NY"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="yearsExperience">Years of Experience</Label>
                    <Input 
                      id="yearsExperience" 
                      type="number"
                      min="0"
                      value={formData.yearsExperience}
                      onChange={(e) => setFormData({...formData, yearsExperience: Number(e.target.value)})}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="font-serif">Rates & Qualifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2 max-w-sm">
                  <Label htmlFor="hourlyRate">Default Hourly Rate ($)</Label>
                  <Input 
                    id="hourlyRate" 
                    type="number"
                    min="0"
                    step="1"
                    value={formData.hourlyRate / 100}
                    onChange={(e) => setFormData({...formData, hourlyRate: Math.round(Number(e.target.value) * 100)})}
                  />
                  <p className="text-xs text-muted-foreground">This is your base rate for private lessons.</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="education">Education & Credentials</Label>
                  <Textarea 
                    id="education" 
                    value={formData.education}
                    onChange={(e) => setFormData({...formData, education: e.target.value})}
                    placeholder="List your degrees, conservatories, and major instructors..."
                    className="min-h-[100px]"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4 border-t border-border pt-6">
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </form>
      </main>
      
      <Footer />
    </div>
  );
}
