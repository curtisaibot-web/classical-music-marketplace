import { useState } from "react";
import { 
  useGetTeacherListings,
  getGetTeacherListingsQueryKey,
  useCreateListing, 
  useUpdateListing, 
  useDeleteListing,
  useGetMe,
  CreateListingBodyType
} from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, MoreVertical, Music, Video, ShoppingBag } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface ListingFormState {
  title: string;
  type: CreateListingBodyType;
  priceInCents: number;
  description: string;
  instrument: string;
  durationMinutes: number;
}

const defaultForm: ListingFormState = {
  title: "",
  type: CreateListingBodyType.lesson,
  priceInCents: 5000,
  description: "",
  instrument: "",
  durationMinutes: 60,
};

export default function TeacherListings() {
  const { data: user } = useGetMe();
  const queryClient = useQueryClient();
  
  const { data: listingsData, isLoading } = useGetTeacherListings(user?.id || "", {
    query: { enabled: !!user?.id, queryKey: getGetTeacherListingsQueryKey(user?.id || "") }
  });

  const createListing = useCreateListing();
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState<ListingFormState>(defaultForm);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<ListingFormState>(defaultForm);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createListing.mutate({
      data: { ...formData, skillLevel: "all" }
    }, {
      onSuccess: () => {
        toast.success("Listing created successfully");
        setIsCreateOpen(false);
        setFormData(defaultForm);
        queryClient.invalidateQueries({ queryKey: getGetTeacherListingsQueryKey(user?.id || "") });
      },
      onError: () => toast.error("Failed to create listing")
    });
  };

  const openEdit = (listing: NonNullable<typeof listingsData>["listings"][number]) => {
    setEditData({
      title: listing.title,
      type: listing.type as CreateListingBodyType,
      priceInCents: listing.priceInCents,
      description: listing.description ?? "",
      instrument: listing.instrument ?? "",
      durationMinutes: listing.durationMinutes ?? 60,
    });
    setEditingId(listing.id);
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId === null) return;
    updateListing.mutate({
      id: editingId,
      data: {
        title: editData.title,
        description: editData.description,
        instrument: editData.instrument,
        priceInCents: editData.priceInCents,
        durationMinutes: editData.durationMinutes,
      }
    }, {
      onSuccess: () => {
        toast.success("Listing updated");
        setEditingId(null);
        queryClient.invalidateQueries({ queryKey: getGetTeacherListingsQueryKey(user?.id || "") });
      },
      onError: () => toast.error("Failed to update listing")
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this listing?")) {
      deleteListing.mutate({ id }, {
        onSuccess: () => {
          toast.success("Listing deleted");
          queryClient.invalidateQueries({ queryKey: getGetTeacherListingsQueryKey(user?.id || "") });
        },
        onError: () => toast.error("Failed to delete listing")
      });
    }
  };

  const getIcon = (type: string) => {
    switch(type) {
      case 'lesson': return <Music className="h-5 w-5" />;
      case 'masterclass': return <Video className="h-5 w-5" />;
      case 'digital_product': return <ShoppingBag className="h-5 w-5" />;
      default: return <Music className="h-5 w-5" />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <div className="bg-muted py-10 border-b border-border">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">My Listings</h1>
            <p className="text-muted-foreground mt-1">Manage your lessons, products, and events.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New Listing</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="font-serif text-2xl">Create New Listing</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="title">Title</Label>
                    <Input 
                      id="title" 
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select value={formData.type} onValueChange={(v: CreateListingBodyType) => setFormData({...formData, type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lesson">Private Lesson</SelectItem>
                        <SelectItem value="event">Event / Performance</SelectItem>
                        <SelectItem value="masterclass">Masterclass</SelectItem>
                        <SelectItem value="digital_product">Digital Product</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price">Price ($)</Label>
                    <Input 
                      id="price" 
                      type="number" 
                      min="0"
                      step="1"
                      value={formData.priceInCents / 100}
                      onChange={(e) => setFormData({...formData, priceInCents: Math.round(Number(e.target.value) * 100)})}
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="instrument">Instrument</Label>
                    <Input 
                      id="instrument" 
                      value={formData.instrument}
                      onChange={(e) => setFormData({...formData, instrument: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration (minutes)</Label>
                    <Input 
                      id="duration" 
                      type="number" 
                      value={formData.durationMinutes}
                      onChange={(e) => setFormData({...formData, durationMinutes: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea 
                      id="description" 
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      rows={3} 
                    />
                  </div>
                </div>
                <DialogFooter className="pt-4 border-t border-border">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createListing.isPending}>
                    {createListing.isPending ? "Creating..." : "Create Listing"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse bg-muted rounded-xl h-24" />
              ))}
            </div>
          ) : !listingsData?.listings.length ? (
            <div className="text-center py-20 bg-muted/30 rounded-xl border border-border border-dashed">
              <ShoppingBag className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-medium text-foreground mb-2">No listings yet</h3>
              <p className="text-muted-foreground mb-6">Create your first listing to start earning.</p>
              <Button onClick={() => setIsCreateOpen(true)}>Create Listing</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {listingsData.listings.map((listing) => (
                <Card key={listing.id} className="border-border overflow-hidden">
                  <CardContent className="p-0 flex flex-col sm:flex-row">
                    <div className="p-6 bg-muted/30 border-b sm:border-b-0 sm:border-r border-border shrink-0 flex items-center justify-center sm:w-32">
                      <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                        {getIcon(listing.type)}
                      </div>
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <Badge variant="outline" className="mb-2 uppercase text-[10px] tracking-wider px-2 py-0.5 bg-background">{listing.type.replace('_', ' ')}</Badge>
                          <h3 className="font-semibold text-lg text-foreground truncate max-w-sm">{listing.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{listing.description || "No description."}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2"><MoreVertical className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(listing)}>
                              <Edit className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer" onClick={() => handleDelete(listing.id)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      
                      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm">
                        <div className="text-muted-foreground">
                          {listing.instrument && <span className="mr-4 inline-block">{listing.instrument}</span>}
                          {listing.durationMinutes && <span>{listing.durationMinutes} min</span>}
                        </div>
                        <div className="font-bold text-foreground text-base">
                          ${(listing.priceInCents / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={editingId !== null} onOpenChange={(open) => { if (!open) setEditingId(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Edit Listing</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={editData.title}
                  onChange={(e) => setEditData({...editData, title: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-price">Price ($)</Label>
                <Input
                  id="edit-price"
                  type="number"
                  min="0"
                  step="1"
                  value={editData.priceInCents / 100}
                  onChange={(e) => setEditData({...editData, priceInCents: Math.round(Number(e.target.value) * 100)})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-duration">Duration (minutes)</Label>
                <Input
                  id="edit-duration"
                  type="number"
                  value={editData.durationMinutes}
                  onChange={(e) => setEditData({...editData, durationMinutes: Number(e.target.value)})}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit-instrument">Instrument</Label>
                <Input
                  id="edit-instrument"
                  value={editData.instrument}
                  onChange={(e) => setEditData({...editData, instrument: e.target.value})}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editData.description}
                  onChange={(e) => setEditData({...editData, description: e.target.value})}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
              <Button type="submit" disabled={updateListing.isPending}>
                {updateListing.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      <Footer />
    </div>
  );
}
