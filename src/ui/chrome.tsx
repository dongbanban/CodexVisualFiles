import type { ComponentProps, ReactNode, ReactElement } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "./components/ui/button.js";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./components/ui/tooltip.js";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./components/ui/dropdown-menu.js";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "./components/ui/context-menu.js";

export interface MenuAction {
  label: string;
  Icon: LucideIcon;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}
export function IconButton({
  label,
  children,
  ...props
}: ComponentProps<typeof Button> & { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            title={label}
            aria-label={label}
            {...props}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
export function ActionDropdown({
  label,
  Icon,
  actions,
  disabled,
}: {
  label: string;
  Icon: LucideIcon;
  actions: MenuAction[];
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            title={label}
            aria-label={label}
            disabled={disabled}
          >
            <Icon className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-48">
        {actions.map((item) => (
          <div key={item.label}>
            {item.separator && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={item.disabled}
              variant={item.danger ? "destructive" : "default"}
              onClick={item.action}
            >
              <item.Icon className="size-3.5" />
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function FileContext({
  actions,
  children,
}: {
  actions: MenuAction[];
  children: ReactElement;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="block" />}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        {actions.map((item) => (
          <div key={item.label}>
            {item.separator && <ContextMenuSeparator />}
            <ContextMenuItem
              disabled={item.disabled}
              variant={item.danger ? "destructive" : "default"}
              onClick={item.action}
            >
              <item.Icon className="size-3.5" />
              {item.label}
            </ContextMenuItem>
          </div>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
