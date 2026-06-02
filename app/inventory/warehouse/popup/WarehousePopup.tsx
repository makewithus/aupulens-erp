import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function WarehousePopupContent({
  formData,
  setFormData,
  isViewOnly,
}: {
  formData: any;
  setFormData: any;
  isViewOnly: boolean;
}) {
  return (
    <div
      className={`space-y-6 ${isViewOnly ? "pointer-events-none opacity-90" : ""}`}
    >
      {/* Header */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Warehouse Name *</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Main Distributor"
          />
        </div>
        <div className="space-y-2">
          <Label>Short Code *</Label>
          <Input
            value={formData.warehouseCode}
            onChange={(e) =>
              setFormData({ ...formData, warehouseCode: e.target.value })
            }
            placeholder="e.g. WH-001"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={formData.type}
            onValueChange={(val) => setFormData({ ...formData, type: val })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="bonded">Bonded</SelectItem>
              <SelectItem value="cold-storage">Cold Storage</SelectItem>
              <SelectItem value="hazmat">Hazmat</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={formData.status}
            onValueChange={(val) => setFormData({ ...formData, status: val })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Address</Label>
        <Textarea
          value={formData.address}
          onChange={(e) =>
            setFormData({ ...formData, address: e.target.value })
          }
          placeholder="Full address..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Location / City</Label>
          <Input
            value={formData.location}
            onChange={(e) =>
              setFormData({ ...formData, location: e.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Capacity (Units)</Label>
          <Input
            type="number"
            value={formData.capacity}
            onChange={(e) =>
              setFormData({
                ...formData,
                capacity: parseFloat(e.target.value) || 0,
              })
            }
          />
        </div>
      </div>

      {/* Contact Info */}
      <div className="border-t pt-4 grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Manager Name</Label>
          <Input
            value={formData.manager}
            onChange={(e) =>
              setFormData({ ...formData, manager: e.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
          />
        </div>
      </div>
    </div>
  );
}
