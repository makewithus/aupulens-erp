"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

export function WarehousePopupContent({ formData, setFormData }: any) {
  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Warehouse Code *</Label>
          <Input
            value={formData.warehouseCode}
            onChange={(e) =>
              setFormData({ ...formData, warehouseCode: e.target.value })
            }
            placeholder="e.g. WH001"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Warehouse Name *</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Main Warehouse"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <Select
          value={formData.type}
          onValueChange={(v) => setFormData({ ...formData, type: v })}
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
        <Label>Location / City *</Label>
        <Input
          value={formData.location}
          onChange={(e) =>
            setFormData({ ...formData, location: e.target.value })
          }
          placeholder="e.g. Mumbai"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Full Address</Label>
        <Input
          value={formData.address}
          onChange={(e) =>
            setFormData({ ...formData, address: e.target.value })
          }
          placeholder="Complete street address"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Manager</Label>
          <Input
            value={formData.manager}
            onChange={(e) =>
              setFormData({ ...formData, manager: e.target.value })
            }
            placeholder="Manager name"
          />
        </div>
        <div className="space-y-2">
          <Label>Contact</Label>
          <Input
            value={formData.contact}
            onChange={(e) =>
              setFormData({ ...formData, contact: e.target.value })
            }
            placeholder="Contact number"
          />
        </div>
      </div>
    </div>
  );
}
