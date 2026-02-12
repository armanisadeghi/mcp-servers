"use client";

import { useState } from "react";
import { Plus, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageShell } from "@/components/admin/page-shell";
import type { TokenInfo } from "@/lib/types";

interface TokensTabProps {
  tokens: TokenInfo[];
  onCreateToken: (label: string, role: string) => Promise<string | null>;
  onDeleteToken: (id: string) => void;
}

export function TokensTab({ tokens, onCreateToken, onDeleteToken }: TokensTabProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  async function handleCreate() {
    const token = await onCreateToken(newLabel, newRole);
    if (token) {
      setCreatedToken(token);
      setShowCreate(false);
      setNewLabel("");
      setNewRole("viewer");
    }
  }

  return (
    <PageShell
      title="Access Tokens"
      actions={
        <Button size="sm" onClick={() => { setShowCreate(true); setCreatedToken(null); setNewLabel(""); setNewRole("viewer"); }}>
          <Plus className="size-4" /> Create Token
        </Button>
      }
    >
      {createdToken && (
        <Card className="border-success/50 bg-success/5">
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm font-medium text-success">New token created — copy it now!</p>
            <div className="flex items-center gap-2">
              <code className="bg-muted px-3 py-1.5 rounded text-sm font-mono flex-1 break-all">{createdToken}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { navigator.clipboard.writeText(createdToken); toast.success("Copied!"); }}
              >
                <Copy className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">This token will not be shown again.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 text-muted-foreground font-medium hidden sm:table-cell">ID</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Label</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Role</th>
                  <th className="text-left p-3 text-muted-foreground font-medium hidden md:table-cell">Created</th>
                  <th className="text-left p-3 text-muted-foreground font-medium hidden md:table-cell">Last Used</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="p-3 font-mono text-xs hidden sm:table-cell">{t.id}</td>
                    <td className="p-3 font-medium">{t.label}</td>
                    <td className="p-3">
                      <Badge variant={t.role === "admin" ? "default" : "secondary"}>{t.role}</Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground hidden md:table-cell">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground hidden md:table-cell">
                      {t.last_used_at ? new Date(t.last_used_at).toLocaleDateString() : "Never"}
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => onDeleteToken(t.id)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {tokens.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">No tokens</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Token Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Access Token</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="My token"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="deployer">Deployer</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
