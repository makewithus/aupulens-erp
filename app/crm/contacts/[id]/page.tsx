'use client';
import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Mail, Phone, MessageSquare, Trash2, Edit2 } from "lucide-react";
import ActivityTimeline from "@/components/crm/ActivityTimeline";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ContactDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/crm/contacts/${params.id}`)
      .then(res => res.json())
      .then(d => { setData(d.data); setLoading(false); });
  }, [params.id]);

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!data || !data.contact) return <div className="p-6">Contact not found</div>;

  const { contact, relationship, stats } = data;

  const executeDelete = async () => {
    setIsDeleting(true);
    try {
      await fetch(`/api/crm/contacts/${contact._id}`, { method: 'DELETE' });
      toast.success("Contact deleted");
      router.push('/crm/contacts');
    } catch {
      toast.error("Network error");
    } finally {
      setIsDeleting(false);
      setDeleteModalOpen(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start bg-card p-6 rounded-lg border border-border">
        <div className="flex gap-6 items-start">
          <div className="h-20 w-20 rounded-full bg-accent flex items-center justify-center text-3xl font-bold text-muted-foreground">
            {contact.first_name[0]}{contact.last_name[0]}
          </div>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 flex-wrap">
              {contact.first_name} {contact.last_name}
              {contact.is_decision_maker && <Badge className="bg-purple-600">Decision Maker</Badge>}
              {contact.is_primary && <Badge className="bg-blue-600">Primary Contact</Badge>}
              <Badge className={relationship?.color || 'bg-muted'}>
                Relationship: {relationship?.label || 'Unknown'} ({relationship?.score || 0})
              </Badge>
            </h1>
            <p className="text-muted-foreground mt-2 text-lg">
              {contact.designation || 'No Designation'} at {contact.account_id?.company_name ? <Link href={`/crm/accounts/${contact.account_id._id}`} className="text-blue-400 hover:underline">{contact.account_id.company_name}</Link> : 'Unknown Account'}
            </p>
            <div className="flex gap-4 mt-3 text-sm">
              <span className="flex items-center gap-1"><Mail className="w-4 h-4 text-muted-foreground" /> {contact.email || 'N/A'}</span>
              <span className="flex items-center gap-1"><Phone className="w-4 h-4 text-muted-foreground" /> {contact.mobile || 'N/A'}</span>
              <span className="flex items-center gap-1"><MessageSquare className="w-4 h-4 text-muted-foreground" /> Prefers: {contact.preferred_communication || 'Any'}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2"><Mail className="w-4 h-4" /> Email</Button>
          <EditContactModal contact={contact} onUpdate={() => window.location.reload()} />
          <Button variant="destructive" size="icon" onClick={() => setDeleteModalOpen(true)}><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>

      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Are you sure you want to delete this contact? This action cannot be undone and will permanently remove this record from the CRM.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={executeDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-card border border-border p-1 w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activities">Activities ({stats?.activitiesCount || 0})</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="cases">Cases</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="bg-card border border-border p-6 rounded-lg mt-4">
          <h2 className="text-xl font-bold mb-4">Contact Profile</h2>
          <div className="grid grid-cols-2 gap-y-6 gap-x-4 text-sm">
            <div><span className="text-muted-foreground block mb-1">Department</span> <span className="font-medium">{contact.department || '-'}</span></div>
            <div><span className="text-muted-foreground block mb-1">Role in Buying</span> <span className="font-medium">{contact.role_in_buying || '-'}</span></div>
            <div><span className="text-muted-foreground block mb-1">Opt-in Status</span> <Badge variant={contact.opt_in_status ? 'default' : 'destructive'}>{contact.opt_in_status ? 'Consented' : 'Opted Out'}</Badge></div>
            <div><span className="text-muted-foreground block mb-1">Created At</span> <span className="font-medium">{new Date(contact.createdAt).toLocaleDateString()}</span></div>
          </div>
        </TabsContent>
        
        <TabsContent value="activities" className="bg-card border border-border p-6 rounded-lg mt-4">
          <ActivityTimeline linkedRecordId={contact._id} />
        </TabsContent>
        
        <TabsContent value="communications" className="bg-card border border-border p-6 rounded-lg mt-4 text-center py-12">
          <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Communication history will appear here.</p>
        </TabsContent>
        
        <TabsContent value="opportunities" className="bg-card border border-border p-6 rounded-lg mt-4 text-center py-12">
          <p className="text-muted-foreground">Opportunities linked to this contact will appear here.</p>
        </TabsContent>
        
        <TabsContent value="cases" className="bg-card border border-border p-6 rounded-lg mt-4 text-center py-12">
          <p className="text-muted-foreground">Support cases linked to this contact will appear here.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EditContactModal({ contact, onUpdate }: { contact: any, onUpdate: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    first_name: contact.first_name, last_name: contact.last_name, email: contact.email || "", 
    mobile: contact.mobile || "", designation: contact.designation || ""
  });
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/contacts/${contact._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        toast.success("Contact updated successfully");
        setOpen(false);
        onUpdate();
      } else {
        toast.error("Failed to update contact");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}><Edit2 className="w-4 h-4" /> Edit</Button>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Contact</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>First Name</Label><Input value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} disabled={loading} /></div>
            <div className="space-y-2"><Label>Last Name</Label><Input value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} disabled={loading} /></div>
          </div>
          <div className="space-y-2"><Label>Email</Label><Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} disabled={loading} /></div>
          <div className="space-y-2"><Label>Mobile</Label><Input value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} disabled={loading} /></div>
          <div className="space-y-2"><Label>Designation</Label><Input value={form.designation} onChange={e => setForm({...form, designation: e.target.value})} disabled={loading} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading} className="bg-primary">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
