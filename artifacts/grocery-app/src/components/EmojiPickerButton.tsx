import { useEffect, useRef, useState } from "react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void;
  disabled?: boolean;
  /** Extra classes for the trigger button. */
  className?: string;
  /** Icon size in px. */
  iconSize?: number;
}

/**
 * Shared emoji picker used across every chat surface.
 *
 * Design:
 * - The trigger is a small ghost-style icon button meant to live INSIDE the
 *   message input (absolute-positioned by the caller), so the textarea spans
 *   the full width of the message bar.
 * - When opened, the emoji panel is rendered in a fixed, centered overlay on
 *   screen with a very light translucent backdrop so the chat underneath
 *   stays visible.
 * - Clicking outside the panel, or pressing Escape, closes it.
 * - Picking an emoji keeps the panel open so the user can add several in a row.
 */
export default function EmojiPickerButton({
  onEmojiSelect,
  disabled,
  className,
  iconSize = 18,
}: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Insert emoji"
        className={cn(
          "p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors disabled:opacity-50",
          className,
        )}
      >
        <Smile size={iconSize} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (
              panelRef.current &&
              !panelRef.current.contains(e.target as Node)
            ) {
              setOpen(false);
            }
          }}
        >
          {/* Very light backdrop — chat stays clearly visible behind it */}
          <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]" />
          <div
            ref={panelRef}
            className="relative z-10 rounded-2xl overflow-hidden shadow-2xl"
          >
            <EmojiPicker
              onEmojiClick={(data) => onEmojiSelect(data.emoji)}
              emojiStyle={EmojiStyle.NATIVE}
              theme={Theme.AUTO}
              width={340}
              height={440}
              searchPlaceholder="Search emoji..."
              lazyLoadEmojis
              previewConfig={{ showPreview: false }}
              skinTonesDisabled={false}
            />
          </div>
        </div>
      )}
    </>
  );
}
