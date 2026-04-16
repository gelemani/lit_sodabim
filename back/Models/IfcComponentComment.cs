using System.ComponentModel.DataAnnotations;

namespace B.Models
{
    public class IfcComponentComment
    {
        public int Id { get; set; }
        public int ProjectId { get; set; }
        public int ProjectFileId { get; set; }
        public int ExpressId { get; set; }
        [StringLength(500)]
        public string ElementName { get; set; } = string.Empty;
        public string? ElementDataJson { get; set; }
        [Required]
        [StringLength(2000)]
        public string CommentText { get; set; } = string.Empty;
        public int UserId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
