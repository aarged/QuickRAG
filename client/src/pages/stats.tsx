import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

type Stats = {
  uniqueVisitors: number;
  countsByType: { eventType: string; count: number }[];
  recentEvents: {
    id: number;
    visitorId: string;
    eventType: string;
    metadata: string | null;
    path: string | null;
    referrer: string | null;
    createdAt: string;
  }[];
};

export default function StatsPage() {
  const [pin, setPin] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = async () => {
    if (!pin.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stats", {
        headers: { "X-Owner-Pin": pin.trim() },
      });
      if (res.status === 401) {
        setError("Incorrect PIN.");
        setStats(null);
        return;
      }
      if (!res.ok) {
        setError("Failed to load stats.");
        return;
      }
      setStats(await res.json());
    } catch {
      setError("Failed to connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") loadStats();
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0048ad]" data-testid="text-stats-title">
            QuickRag — Activity
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Anonymous in-app engagement. Owner access only.
          </p>
        </div>

        <div className="flex items-end gap-2 max-w-sm">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Owner PIN</Label>
            <Input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter owner PIN"
              data-testid="input-stats-pin"
            />
          </div>
          <Button
            onClick={loadStats}
            disabled={loading || !pin.trim()}
            className="bg-[#0048ad] hover:bg-[#0048ad]/90 text-white"
            data-testid="button-load-stats"
          >
            {loading ? "Loading..." : "View"}
          </Button>
        </div>

        {error && (
          <p className="text-xs text-destructive" data-testid="text-stats-error">{error}</p>
        )}

        {stats && (
          <div className="space-y-6">
            <div className="p-4 bg-card border rounded-lg">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Unique Visitors</p>
              <p className="text-3xl font-semibold mt-1" data-testid="text-unique-visitors">
                {stats.uniqueVisitors}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-[#0048ad] font-medium mb-2">Events by Type</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {stats.countsByType.length === 0 && (
                  <p className="text-xs text-muted-foreground col-span-full">No events recorded yet.</p>
                )}
                {stats.countsByType.map((c) => (
                  <div
                    key={c.eventType}
                    className="p-3 bg-card border rounded-lg"
                    data-testid={`stat-type-${c.eventType}`}
                  >
                    <p className="text-xs text-muted-foreground capitalize">{c.eventType}</p>
                    <p className="text-xl font-semibold mt-0.5">{c.count}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-[#0048ad] font-medium mb-2">Recent Activity</p>
              <ScrollArea className="h-[360px] border rounded-lg bg-card">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-secondary/80 backdrop-blur">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Visitor</th>
                      <th className="px-3 py-2 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentEvents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                          No activity yet.
                        </td>
                      </tr>
                    )}
                    {stats.recentEvents.map((e) => (
                      <tr key={e.id} className="border-t" data-testid={`row-event-${e.id}`}>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">
                          {new Date(e.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 capitalize">{e.eventType}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {e.visitorId.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground break-all">
                          {e.metadata || e.path || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground font-mono pt-4">True North Applied Technologies</p>
      </div>
    </div>
  );
}
