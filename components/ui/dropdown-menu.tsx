"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface DropdownMenuProps {
  children: React.ReactNode;
}

interface DropdownMenuTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
  className?: string;
}

interface DropdownMenuContentProps {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}

interface DropdownMenuItemProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

interface DropdownMenuSeparatorProps {
  className?: string;
}

interface ClickableElementProps {
  onClick?: (e: React.MouseEvent) => void;
  ref?: React.Ref<HTMLElement>;
  className?: string;
  [key: string]: unknown;
}

type DropdownMenuContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
};

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined | null>) {
  return (instance: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(instance);
      else if (ref && typeof ref === "object" && "current" in ref) {
        (ref as React.MutableRefObject<T | null>).current = instance;
      }
    }
  };
}

function computeMenuPosition(
  trigger: DOMRect,
  menuWidth: number,
  menuHeight: number,
  align: "start" | "center" | "end",
  viewportPadding = 8
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 8;
  let top = trigger.bottom + gap;
  let left: number;
  if (align === "end") {
    left = trigger.right - menuWidth;
  } else if (align === "center") {
    left = trigger.left + trigger.width / 2 - menuWidth / 2;
  } else {
    left = trigger.left;
  }

  left = Math.min(Math.max(left, viewportPadding), Math.max(viewportPadding, vw - menuWidth - viewportPadding));

  if (top + menuHeight > vh - viewportPadding && trigger.top - gap - menuHeight >= viewportPadding) {
    top = trigger.top - gap - menuHeight;
  } else if (top + menuHeight > vh - viewportPadding) {
    top = Math.max(viewportPadding, vh - menuHeight - viewportPadding);
  }

  return { top, left };
}

/** Hook to close the dropdown from inside (e.g. submenu actions). Must be used within a DropdownMenu. */
export function useDropdownMenuClose(): () => void {
  const context = React.useContext(DropdownMenuContext);
  if (!context) {
    throw new Error("useDropdownMenuClose must be used within a DropdownMenu");
  }
  return React.useCallback(() => context.setIsOpen(false), [context]);
}

export const DropdownMenu = React.forwardRef<HTMLDivElement, DropdownMenuProps>(
  ({ children, ...props }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);
    const triggerRef = React.useRef<HTMLElement | null>(null);
    const contentRef = React.useRef<HTMLDivElement | null>(null);

    const contextValue = React.useMemo(
      () => ({
        isOpen,
        setIsOpen,
        triggerRef,
        contentRef,
      }),
      [isOpen]
    );

    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        if (dropdownRef.current?.contains(target)) return;
        if (contentRef.current?.contains(target)) return;
        setIsOpen(false);
      };

      if (isOpen) {
        document.addEventListener("mousedown", handleClickOutside);
      }

      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [isOpen]);

    return (
      <DropdownMenuContext.Provider value={contextValue}>
        <div
          ref={(node) => {
            if (typeof ref === "function") {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
            dropdownRef.current = node;
          }}
          className="relative"
          {...props}
        >
          {children}
        </div>
      </DropdownMenuContext.Provider>
    );
  }
);

DropdownMenu.displayName = "DropdownMenu";

export const DropdownMenuTrigger = React.forwardRef<HTMLElement, DropdownMenuTriggerProps>(
  ({ children, asChild = false, className, ...props }, ref) => {
    const context = React.useContext(DropdownMenuContext);
    if (!context) {
      throw new Error("DropdownMenuTrigger must be used within a DropdownMenu");
    }

    const handleClick = (e: React.MouseEvent<Element>) => {
      e.stopPropagation();
      context.setIsOpen(!context.isOpen);
    };

    if (asChild) {
      const child = children as React.ReactElement<ClickableElementProps>;
      const { onClick: childOnClick, ref: childRef, ...childProps } = child.props;
      return React.cloneElement(child, {
        ...childProps,
        ...props,
        ref: mergeRefs(context.triggerRef, childRef, ref),
        onClick: (e: React.MouseEvent<Element>) => {
          childOnClick?.(e);
          handleClick(e);
        },
      } as Partial<ClickableElementProps>);
    }

    return (
      <button
        ref={mergeRefs(context.triggerRef, ref as React.Ref<HTMLButtonElement>)}
        type="button"
        onClick={handleClick}
        className={cn("inline-flex items-center justify-center", className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

export const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ children, className, align = "center", ...props }, ref) => {
    const context = React.useContext(DropdownMenuContext);
    if (!context) {
      throw new Error("DropdownMenuContent must be used within a DropdownMenu");
    }

    const [mounted, setMounted] = React.useState(false);
    const [coords, setCoords] = React.useState({ top: 0, left: 0 });

    React.useLayoutEffect(() => {
      setMounted(true);
    }, []);

    const updatePosition = React.useCallback(() => {
      if (!context.isOpen) return;
      const trigger = context.triggerRef.current;
      const content = context.contentRef.current;
      if (!trigger || !content) return;

      const t = trigger.getBoundingClientRect();
      const cw = content.offsetWidth || Math.max(t.width, 160);
      const ch = content.offsetHeight || 200;
      const { top, left } = computeMenuPosition(t, cw, ch, align);
      setCoords({ top, left });
    }, [context, align]);

    React.useLayoutEffect(() => {
      if (!context.isOpen) return;
      updatePosition();
      const rafId = requestAnimationFrame(() => updatePosition());

      const onScrollOrResize = () => updatePosition();
      window.addEventListener("resize", onScrollOrResize);
      window.addEventListener("scroll", onScrollOrResize, true);

      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener("resize", onScrollOrResize);
        window.removeEventListener("scroll", onScrollOrResize, true);
      };
    }, [context.isOpen, updatePosition]);

    if (!context.isOpen) return null;

    const setContentNode = (node: HTMLDivElement | null) => {
      (context.contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    };

    const panel = (
      <motion.div
        ref={setContentNode}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "tween", duration: 0.2, ease: [0, 0, 0.2, 1] }}
        style={{
          position: "fixed",
          top: coords.top,
          left: coords.left,
          zIndex: 10050,
        }}
        className={cn(
          "min-w-[10rem] p-1 overflow-x-hidden overflow-y-auto max-h-[min(70vh,520px)] rounded-xl border border-gray-200 bg-white py-1 shadow-lg",
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    );

    if (!mounted || typeof document === "undefined") {
      return null;
    }

    return createPortal(panel, document.body);
  }
);

DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = React.forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  ({ children, className, onClick, disabled = false, ...props }, ref) => {
    const context = React.useContext(DropdownMenuContext);
    if (!context) {
      throw new Error("DropdownMenuItem must be used within a DropdownMenu");
    }

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (!disabled) {
        onClick?.();
        context.setIsOpen(false);
      }
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors",
          "hover:bg-gray-100 focus:bg-gray-100 focus:outline-none",
          disabled && "pointer-events-none opacity-50",
          className
        )}
        onClick={handleClick}
        {...props}
      >
        {children}
      </div>
    );
  }
);

DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuSeparator = React.forwardRef<HTMLDivElement, DropdownMenuSeparatorProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="separator"
      className={cn("my-1 h-px shrink-0 bg-gray-200", className)}
      {...props}
    />
  )
);
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";
