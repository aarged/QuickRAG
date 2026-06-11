const VISITOR_ID_KEY = "quickrag_visitor_id";

export function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(VISITOR_ID_KEY, id);
  }
  return id;
}

export type EventType = "visit" | "chat" | "upload" | "search";

export function track(eventType: EventType, metadata?: Record<string, unknown>): void {
  try {
    const body = {
      visitorId: getVisitorId(),
      eventType,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
      referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
    };

    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* tracking must never break the user's action */
  }
}
