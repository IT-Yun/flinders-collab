import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { MapPin } from 'lucide-react';

const statusColors = {
  arrived: '#22c55e',
  on_the_way: '#eab308',
  late: '#ef4444',
};

const STATUS_LABEL = {
  on_the_way: 'On the way',
  arrived: 'Arrived',
  late: 'Late',
};

// Default center: Flinders University, Adelaide
const DEFAULT_CENTER = [-35.0275, 138.5711];

// Stale threshold — hide markers older than 30 minutes
const STALE_MS = 30 * 60 * 1000;

export default function LocationMap({ members = [], center }) {
  const now = Date.now();

  // Filter out members with missing coordinates or stale sessions
  const validMembers = useMemo(
    () =>
      members.filter((m) => {
        if (m.latitude == null || m.longitude == null) return false;
        if (m.updated_at) {
          const age = now - new Date(m.updated_at).getTime();
          if (age > STALE_MS) return false;
        }
        return true;
      }),
    [members, now],
  );

  // Compute a center from the valid members if none provided
  const mapCenter = useMemo(() => {
    if (center) return center;
    if (validMembers.length === 0) return DEFAULT_CENTER;
    const avgLat = validMembers.reduce((sum, m) => sum + m.latitude, 0) / validMembers.length;
    const avgLng = validMembers.reduce((sum, m) => sum + m.longitude, 0) / validMembers.length;
    return [avgLat, avgLng];
  }, [center, validMembers]);

  if (validMembers.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center rounded-lg border bg-muted/30 gap-2">
        <MapPin className="h-6 w-6 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No members sharing location right now</p>
      </div>
    );
  }

  return (
    <div className="h-56 sm:h-80 w-full overflow-hidden rounded-lg border">
      <MapContainer center={mapCenter} zoom={15} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {validMembers.map((member) => {
          const displayName = member.name || member.users?.full_name || 'User';
          return (
            <Marker key={member.id} position={[member.latitude, member.longitude]}>
              <Popup>
                <div className="text-sm">
                  <p className="font-medium">{displayName}</p>
                  <p style={{ color: statusColors[member.status] || '#6b7280' }}>
                    {STATUS_LABEL[member.status] || member.status?.replace('_', ' ') || 'unknown'}
                  </p>
                  {member.updated_at && (
                    <p className="text-xs opacity-60">
                      Updated {new Date(member.updated_at).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
