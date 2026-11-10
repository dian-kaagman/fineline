// Small decorative icons (always next to text, so hidden from assistive technology).
export type IconName = "info" | "success" | "warning" | "danger" | "check";

const PATHS: Record<IconName, string> = {
  info: "M12 8h.01M11 12h1v5h1",
  success: "M7 12.5l3.5 3.5L17 9",
  warning: "M12 8v5M12 16.5h.01",
  danger: "M9 9l6 6M15 9l-6 6",
  check: "M6 12.5l4 4L18 8",
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className={`icon icon--${name}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {name !== "check" && <circle cx="12" cy="12" r="10" />}
      <path d={PATHS[name]} />
    </svg>
  );
}
