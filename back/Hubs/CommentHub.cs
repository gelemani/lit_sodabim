using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace B.Hubs
{
    public class CommentHub : Hub
    {
        private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, PresenceUser>> _rooms = new();
        private static readonly ConcurrentDictionary<string, string> _connectionToRoom = new();
        private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, CursorPosition>> _cursors = new();

        public async Task JoinProject(string projectFileKey, int userId = 0, string userName = "", string userSurname = "")
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, projectFileKey);

            var user = new PresenceUser(userId, userName, userSurname);
            _rooms.GetOrAdd(projectFileKey, _ => new()).TryAdd(Context.ConnectionId, user);
            _connectionToRoom[Context.ConnectionId] = projectFileKey;

            await Clients.Group(projectFileKey).SendAsync("PresenceUpdated", GetRoomUsers(projectFileKey));
        }

        public async Task LeaveProject(string projectFileKey)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, projectFileKey);
            Cleanup(Context.ConnectionId, projectFileKey);
            await Clients.Group(projectFileKey).SendAsync("PresenceUpdated", GetRoomUsers(projectFileKey));
        }

        public async Task UpdateCursor(string projectFileKey, double nx, double ny)
        {
            if (!_rooms.TryGetValue(projectFileKey, out var room) ||
                !room.TryGetValue(Context.ConnectionId, out var user))
                return;

            _cursors.GetOrAdd(projectFileKey, _ => new())
                    [Context.ConnectionId] = new CursorPosition(user.UserId, user.UserName, user.UserSurname, nx, ny);

            await Clients.OthersInGroup(projectFileKey).SendAsync("CursorUpdated", GetRoomCursors(projectFileKey));
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            if (_connectionToRoom.TryRemove(Context.ConnectionId, out var roomKey))
            {
                Cleanup(Context.ConnectionId, roomKey);
                await Clients.Group(roomKey).SendAsync("PresenceUpdated", GetRoomUsers(roomKey));
            }
            await base.OnDisconnectedAsync(exception);
        }

        private static void Cleanup(string connectionId, string roomKey)
        {
            if (_rooms.TryGetValue(roomKey, out var room))
            {
                room.TryRemove(connectionId, out _);
                if (room.IsEmpty) _rooms.TryRemove(roomKey, out _);
            }
            if (_cursors.TryGetValue(roomKey, out var cursors))
            {
                cursors.TryRemove(connectionId, out _);
                if (cursors.IsEmpty) _cursors.TryRemove(roomKey, out _);
            }
            _connectionToRoom.TryRemove(connectionId, out _);
        }

        private static List<PresenceUser> GetRoomUsers(string roomKey)
        {
            if (!_rooms.TryGetValue(roomKey, out var room)) return [];
            return [.. room.Values.GroupBy(u => u.UserId).Select(g => g.First())];
        }

        private static List<CursorPosition> GetRoomCursors(string roomKey)
        {
            if (!_cursors.TryGetValue(roomKey, out var cursors)) return [];
            return [.. cursors.Values.GroupBy(c => c.UserId).Select(g => g.First())];
        }
    }

    public record PresenceUser(int UserId, string UserName, string UserSurname);
    public record CursorPosition(int UserId, string UserName, string UserSurname, double Nx, double Ny);
}
