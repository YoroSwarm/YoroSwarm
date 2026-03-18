"use client"

import * as React from "react"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

interface ConfirmDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
  variant?: "default" | "destructive"
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title = "确认操作",
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  onConfirm,
  variant = "default",
}: ConfirmDialogProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [isConfirming, setIsConfirming] = React.useState(false)

  const isControlled = open !== undefined
  const currentOpen = isControlled ? open : isOpen

  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setIsOpen(newOpen)
    }
    onOpenChange?.(newOpen)
  }

  const handleConfirm = async () => {
    setIsConfirming(true)
    try {
      await onConfirm()
      handleOpenChange(false)
    } finally {
      setIsConfirming(false)
    }
  }

  return (
    <AlertDialog open={currentOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isConfirming}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={handleConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? "处理中..." : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * 用于在需要时显示确认对话框的 Hook
 */
export function useConfirmDialog() {
  const [state, setState] = React.useState<{
    open: boolean
    title: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    resolve?: (value: boolean) => void
    variant?: "default" | "destructive"
  }>({
    open: false,
    title: "确认操作",
  })

  const confirm = React.useCallback(
    (props: Omit<typeof state, "open" | "resolve">) => {
      return new Promise<boolean>((resolve) => {
        setState({
          ...props,
          open: true,
          resolve,
        })
      })
    },
    []
  )

  const handleClose = () => {
    state.resolve?.(false)
    setState((prev) => ({ ...prev, open: false }))
  }

  const handleConfirm = () => {
    state.resolve?.(true)
    setState((prev) => ({ ...prev, open: false }))
  }

  const Dialog = () => (
    <AlertDialog open={state.open} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          {state.description && (
            <AlertDialogDescription>{state.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {state.cancelLabel || "取消"}
          </Button>
          <Button variant={state.variant || "default"} onClick={handleConfirm}>
            {state.confirmLabel || "确认"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirm, Dialog }
}
