"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  children: React.ReactNode;
  className?: string;
  disableDynamicPositioning?: boolean;
  disabled?: boolean;
}

export interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  onSelect?: (value: string, label: string) => void;
  isSelected?: boolean;
}

// Define components first
export const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ value, children, onSelect, isSelected, ...props }, ref) => {
    const handleClick = () => {
      onSelect?.(value, children as string);
    };

    return (
      <div
        ref={ref}
        onClick={handleClick}
        className={cn(
          "flex cursor-pointer items-center justify-between px-3 py-2 text-sm",
          "hover:bg-gray-50 transition-colors",
          isSelected && "bg-primary-50 text-primary-900"
        )}
        {...props}
      >
        <span>{children}</span>
        {isSelected && <Check className="h-4 w-4 text-brand-primary flex-shrink-0" />}
      </div>
    );
  }
);
SelectItem.displayName = "SelectItem";

// Legacy components for compatibility
export const SelectTrigger = ({ children, className, ...props }: { children: React.ReactNode; className?: string; [key: string]: any }) => {
  return <>{children}</>;
};
SelectTrigger.displayName = "SelectTrigger";

export const SelectValue = ({ placeholder }: { placeholder?: string }) => null;
SelectValue.displayName = "SelectValue";

export const SelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>;
SelectContent.displayName = "SelectContent";

// Helper to recursively find all SelectItem children
const findSelectItems = (children: React.ReactNode): React.ReactElement<SelectItemProps>[] => {
  const items: React.ReactElement<SelectItemProps>[] = [];
  
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      const props = child.props as any;
      
      // Check if this is a SelectItem by checking for the value prop
      // SelectItem always has a value prop and children
      if (props && typeof props.value === 'string' && props.children !== undefined) {
        // This looks like a SelectItem - add it
        items.push(child as React.ReactElement<SelectItemProps>);
      } else {
        // Not a SelectItem, but might contain SelectItems - recurse
        if (props && props.children) {
          items.push(...findSelectItems(props.children));
        }
      }
    }
  });
  
  return items;
};

// Helper to find custom trigger content
const findTriggerContent = (children: React.ReactNode): { icon?: React.ReactNode; placeholder?: string } => {
  let icon: React.ReactNode = null;
  let placeholder: string | undefined;
  
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      const childType = (child.type as any)?.displayName || (child.type as any)?.name;
      if (child.type === SelectTrigger || childType === "SelectTrigger") {
        const props = child.props as { children?: React.ReactNode };
        if (props && props.children) {
          React.Children.forEach(props.children, (triggerChild) => {
            if (React.isValidElement(triggerChild)) {
              const triggerChildType = (triggerChild.type as any)?.displayName || (triggerChild.type as any)?.name;
              if (triggerChild.type === SelectValue || triggerChildType === "SelectValue") {
                const valueProps = triggerChild.props as { placeholder?: string };
                placeholder = valueProps?.placeholder;
              } else if (triggerChild.type !== SelectValue && triggerChild.type !== SelectItem && triggerChildType !== "SelectValue" && triggerChildType !== "SelectItem") {
                // Assume any other element is an icon
                icon = triggerChild;
              }
            }
          });
        }
      }
    }
  });
  
  return { icon, placeholder };
};

/** True if this element can scroll on at least one axis (nested drawers, modals, page). */
function isScrollableElement(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  const combined = `${style.overflow}${style.overflowY}${style.overflowX}`;
  if (!/(auto|scroll|overlay)/i.test(combined)) return false;
  return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
}

/** Walk up from the trigger and collect ancestors that have their own scroll (Vaul drawers, overflow panels, etc.). */
function collectScrollParents(start: HTMLElement | null): HTMLElement[] {
  const parents: HTMLElement[] = [];
  let el: HTMLElement | null = start;
  while (el) {
    if (isScrollableElement(el)) {
      parents.push(el);
    }
    el = el.parentElement;
  }
  return parents;
}

/** Visible viewport (iOS keyboard / Safari chrome); falls back to layout viewport. */
function getVisibleViewportBounds() {
  if (typeof window === "undefined") {
    return { top: 0, bottom: 768, height: 768 };
  }
  const vv = window.visualViewport;
  if (vv) {
    return {
      top: vv.offsetTop,
      bottom: vv.offsetTop + vv.height,
      height: vv.height,
    };
  }
  return { top: 0, bottom: window.innerHeight, height: window.innerHeight };
}

export const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ value, onValueChange, placeholder, children, className, disableDynamicPositioning = false, disabled = false, ...props }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [selectedValue, setSelectedValue] = React.useState(value || "");
    const [selectedLabel, setSelectedLabel] = React.useState<string>("");
    const [mounted, setMounted] = React.useState(false);
    const selectRef = React.useRef<HTMLDivElement>(null);
    const dropdownRef = React.useRef<HTMLDivElement>(null);
    
    const selectItems = React.useMemo(() => findSelectItems(children), [children]);
    const triggerContent = React.useMemo(() => findTriggerContent(children), [children]);
    const displayPlaceholder = triggerContent.placeholder || placeholder;
    
    React.useEffect(() => {
      setMounted(true);
    }, []);
    
    React.useEffect(() => {
      setSelectedValue(value || "");
      // Find the label for the current value
      if (value) {
        const item = selectItems.find(item => item.props.value === value);
        if (item) {
          setSelectedLabel(item.props.children as string);
        }
      } else {
        setSelectedLabel("");
      }
    }, [value, selectItems]);

    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            setIsOpen(false);
          }
        }
      };

      if (isOpen) {
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
      }
    }, [isOpen]);

    // Update dropdown position when open
    React.useEffect(() => {
      if (isOpen && selectRef.current && dropdownRef.current) {
        const updatePosition = () => {
          if (selectRef.current && dropdownRef.current) {
            const rect = selectRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;

            if (disableDynamicPositioning) {
              // Simple positioning: always below, no dynamic behavior
              const { bottom: visibleBottom } = getVisibleViewportBounds();
              dropdownRef.current.style.top = `${rect.bottom + 4}px`;
              dropdownRef.current.style.left = `${rect.left}px`;
              dropdownRef.current.style.width = `${rect.width}px`;
              dropdownRef.current.style.minWidth = `${rect.width}px`;
              const simpleMax = Math.min(
                240,
                Math.max(120, visibleBottom - rect.bottom - 12)
              );
              dropdownRef.current.style.maxHeight = `${simpleMax}px`;
            } else {
              const { top: visibleTop, bottom: visibleBottom } = getVisibleViewportBounds();

              // Calculate available space (visual viewport — mobile Safari / keyboard)
              const spaceBelow = visibleBottom - rect.bottom;
              const spaceAbove = rect.top - visibleTop;
              const maxDropdownHeight = 240; // max-h-60 = 240px
              const minDropdownHeight = 100; // Minimum height to show at least a few items
              const padding = 8; // Padding from viewport edges

              // Determine if we should open upward
              // Open upward if there's more space above OR if space below is insufficient
              const shouldOpenUpward = spaceBelow < maxDropdownHeight && spaceAbove > spaceBelow;

              let topPosition: number;
              let maxHeight: number;

              if (shouldOpenUpward) {
                // Position above the trigger
                const availableHeight = spaceAbove - padding;
                maxHeight = Math.min(maxDropdownHeight, Math.max(minDropdownHeight, availableHeight));
                topPosition = rect.top - maxHeight - 4;

                // Ensure we don't go above the visible viewport
                const minTop = visibleTop + padding;
                if (topPosition < minTop) {
                  topPosition = minTop;
                  maxHeight = Math.min(maxDropdownHeight, Math.max(minDropdownHeight, rect.top - topPosition - 4));
                }
              } else {
                // Position below the trigger (default)
                const availableHeight = spaceBelow - padding;
                maxHeight = Math.min(maxDropdownHeight, Math.max(minDropdownHeight, availableHeight));
                topPosition = rect.bottom + 4;

                // Ensure we don't go below the visible viewport
                if (topPosition + maxHeight > visibleBottom - padding) {
                  maxHeight = Math.max(minDropdownHeight, visibleBottom - topPosition - padding);
                }
              }

              // Set position and size
              dropdownRef.current.style.top = `${topPosition}px`;
              dropdownRef.current.style.left = `${Math.max(padding, Math.min(rect.left, viewportWidth - rect.width - padding))}px`;
              dropdownRef.current.style.width = `${rect.width}px`;
              dropdownRef.current.style.minWidth = `${rect.width}px`;
              dropdownRef.current.style.maxHeight = `${maxHeight}px`;
            }
          }
        };

        const scheduleMeasure = () => {
          requestAnimationFrame(() => {
            updatePosition();
            requestAnimationFrame(() => {
              updatePosition();
              queueMicrotask(() => updatePosition());
            });
          });
        };

        scheduleMeasure();

        const scrollParents = collectScrollParents(selectRef.current);
        scrollParents.forEach((el) => {
          el.addEventListener("scroll", updatePosition, { passive: true });
        });

        window.addEventListener("scroll", updatePosition, true);
        window.addEventListener("resize", updatePosition);

        const vv = typeof window !== "undefined" ? window.visualViewport : null;
        if (vv) {
          vv.addEventListener("resize", updatePosition);
          vv.addEventListener("scroll", updatePosition);
        }

        return () => {
          scrollParents.forEach((el) => {
            el.removeEventListener("scroll", updatePosition);
          });
          window.removeEventListener("scroll", updatePosition, true);
          window.removeEventListener("resize", updatePosition);
          if (vv) {
            vv.removeEventListener("resize", updatePosition);
            vv.removeEventListener("scroll", updatePosition);
          }
        };
      }
    }, [isOpen, disableDynamicPositioning]);

    const handleSelect = (value: string, label: string) => {
      setSelectedValue(value);
      setSelectedLabel(label);
      onValueChange?.(value);
      setIsOpen(false);
    };

    return (
      <>
        <div ref={selectRef} className={cn("relative", className)} {...props}>
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(!isOpen)}
            disabled={disabled}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm",
              "focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary",
              "hover:border-gray-400 transition-colors",
              disabled && "cursor-not-allowed opacity-50 bg-gray-50"
            )}
          >
            <div className="flex items-center space-x-2 flex-1 min-w-0">
              {triggerContent.icon}
              <span className={cn(selectedValue ? "text-gray-900" : "text-gray-500", "truncate")}>
                {selectedLabel || displayPlaceholder}
              </span>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform flex-shrink-0", isOpen && "rotate-180")} />
          </button>
        </div>

        {mounted && isOpen && selectItems.length > 0 && createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[99999] overflow-y-auto overscroll-contain touch-pan-y rounded-md border border-gray-200 bg-white shadow-xl [-webkit-overflow-scrolling:touch]"
            style={{
              position: 'fixed',
            }}
          >
            <div className="pt-1 pb-2">
              {selectItems.map((item) => {
                return React.cloneElement(item, {
                  onSelect: handleSelect,
                  isSelected: item.props.value === selectedValue,
                  key: item.props.value,
                });
              })}
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }
);
Select.displayName = "Select";
