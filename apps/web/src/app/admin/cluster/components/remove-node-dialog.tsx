'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import type { SrsNode } from '@/hooks/use-cluster-nodes';

interface RemoveNodeDialogProps {
  node: SrsNode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function RemoveNodeDialog({
  node,
  open,
  onOpenChange,
  onSuccess,
}: RemoveNodeDialogProps) {
  const [removing, setRemoving] = useState(false);

  if (!node) return null;

  async function handleRemove() {
    setRemoving(true);
    try {
      await apiFetch(`/api/cluster/nodes/${node!.id}`, {
        method: 'DELETE',
      });
      toast.success(`Edge node '${node!.name}' removed from cluster`);
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error(`Failed to remove edge node '${node!.name}'`);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="default">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Edge Node</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove {node.name} from the cluster. Active viewers on
            this node will be disrupted and need to reconnect. This action
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleRemove}
            disabled={removing}
          >
            {removing ? 'Removing...' : 'Remove Node'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
