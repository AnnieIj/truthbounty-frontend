import { TimelineEvent } from "@/app/types/dispute";
import { Clock, AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useMemo } from "react";

// Helper to determine status icon based on event type or state
const getStatusIcon = (type: string, isRecent: boolean) => {
  if (isRecent) {
    return <Loader2 size={14} className="animate-spin text-indigo-500" />;
  }

  switch (type.toLowerCase()) {
    case "provisional":
    case "pending":
      return <Clock size={14} className="text-yellow-500" />;
    case "final":
    case "settled":
      return <CheckCircle2 size={14} className="text-green-500" />;
    case "rejected":
    case "challenged":
      return <XCircle size={14} className="text-red-500" />;
    case "error":
    case "failed":
      return <AlertCircle size={14} className="text-red-500" />;
    default:
      return <div className="w-3.5 h-3.5 rounded-full bg-gray-600" />;
  }
};

export const TimelineOfEvents = ({ events }: { events: TimelineEvent[] }) => {
  const hasEvents = events && events.length > 0;

  // Filter out empty or invalid events to prevent rendering placeholders
  const validEvents = useMemo(
    () => events.filter((e) => e && e.id && e.title),
    [events]
  );

  if (!hasEvents || validEvents.length === 0) {
    return (
      <div className="bg-[#13141b] border border-gray-800 rounded-xl p-6">
        <div className="flex items-center space-x-2 text-white font-medium mb-6">
          <Clock size={18} />
          <h2>Timeline of Events</h2>
        </div>
        <div className="text-sm text-gray-500 text-center py-4">
          No events recorded yet.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#13141b] border border-gray-800 rounded-xl p-6">
      <div className="flex items-center space-x-2 text-white font-medium mb-6">
        <Clock size={18} />
        <h2>Timeline of Events</h2>
      </div>
      <div className="relative pl-3 space-y-6">
        {/* Vertical Line */}
        <div className="absolute left-3.75 top-2 bottom-2 w-0.5 bg-gray-800"></div>

        {validEvents.map((event) => (
          <div key={event.id} className="relative flex items-start">
            <div className="absolute left-0 mt-1.5 mr-4 z-10">
              {getStatusIcon(event.type || "", event.isRecent)}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-200">{event.title}</p>
              <div className="text-xs text-gray-500 flex space-x-2 mt-1">
                <span>{event.timeAgo}</span>
                <span>·</span>
                <span>{event.actor}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};