using System.Text.Json.Serialization;

namespace B.Models
{
    public class ProjectAccess
    {
        public int Id { get; set; }
        public int ProjectId { get; set; }
        public int UserId { get; set; }
        public string AccessLevel { get; set; } = "viewer";
        public DateTime GrantedAt { get; set; } = DateTime.UtcNow;

        [JsonIgnore]
        public Project? Project { get; set; }
    }
}