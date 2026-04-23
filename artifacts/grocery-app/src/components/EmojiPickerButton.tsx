import { useState } from "react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void;
  disabled?: boolean;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

/**
 * Reusable emoji picker button used across all chat surfaces
 * (rider, vendor, agent, admin, resident).
 *
 * Opens a full unicode emoji picker in a popover when clicked,
 * and calls `onEmojiSelect(emoji)` whenever the user picks one.
 */
export default function EmojiPickerButton({
  onEmojiSelect,
  disabled,
  className,
  side = "top",
  align = "end",
}: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label="Insert emoji"
          className={className}
        >
          <Smile className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        className="p-0 w-auto border-none shadow-lg"
        // Keep focus in the textarea so users can keep typing after picking
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <EmojiPicker
          onEmojiClick={(emojiData) => {
            onEmojiSelect(emojiData.emoji);
          }}
          emojiStyle={EmojiStyle.NATIVE}
          theme={Theme.AUTO}
          width={320}
          height={400}
          searchPlaceholder="Search emoji..."
          lazyLoadEmojis
          previewConfig={{ showPreview: false }}
          skinTonesDisabled={false}
        />
      </PopoverContent>
    </Popover>
  );
}
