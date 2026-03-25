interface Props {
  syncType: string;
  lastSyncAt: string | null;
  status: string | null;
  expectedIntervalMin: number;
}

export function SyncStatusCard({ syncType, lastSyncAt, status, expectedIntervalMin }: Props) {
  let color = "bg-gray-100 text-gray-600";
  let statusText = "Never synced";

  if (lastSyncAt) {
    const ago = Math.round((Date.now() - new Date(lastSyncAt).getTime()) / 60000);

    if (status === "error") {
      color = "bg-red-100 text-red-700";
      statusText = `Error - ${ago}m ago`;
    } else if (status === "partial") {
      color = "bg-yellow-100 text-yellow-700";
      statusText = `Partial - ${ago}m ago`;
    } else if (ago > expectedIntervalMin * 2) {
      color = "bg-red-100 text-red-700";
      statusText = `Stale - ${ago}m ago`;
    } else {
      color = "bg-green-100 text-green-700";
      statusText = `OK - ${ago}m ago`;
    }
  }

  return (
    <div className={`rounded-lg px-3 py-2 ${color}`}>
      <div className="text-xs font-medium uppercase">{syncType}</div>
      <div className="text-sm">{statusText}</div>
    </div>
  );
}
