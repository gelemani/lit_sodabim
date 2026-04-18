using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace B.Models
{
    public class Project
    {
        public int Id { get; set; } // Project ID

        [JsonPropertyName("creatorId")]
        public int UserId { get; set; } // User ID who created the project

        [Required]
        [StringLength(100, MinimumLength = 3)]
        public string Title { get; set; } = string.Empty;

        [DataType(DataType.DateTime)]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow; // Date of creation

        [DataType(DataType.DateTime)]
        public DateTime LastModified { get; set; } = DateTime.UtcNow; // Date of last modification

        public string AccessLevel { get; set; } = "View"; // Access level of the current user (e.g., "View", "Edit", "Admin")

        public ICollection<ProjectFile> ProjectFiles { get; set; } = new List<ProjectFile>();
        public ICollection<ProjectAccess> ProjectAccesses { get; set; } = new List<ProjectAccess>();
    }
}
