using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace B.Models
{
    public class ProjectFile
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int ProjectId { get; set; }

        [Required]
        [StringLength(255)]
        public string FileName { get; set; } = string.Empty;

        [Required]
        public byte[] FileData { get; set; } = Array.Empty<byte>();

        [DataType(DataType.DateTime)]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [DataType(DataType.DateTime)]
        public DateTime LastModified { get; set; } = DateTime.UtcNow;

        [ForeignKey("ProjectId")]
        public Project? Project { get; set; }

        [Required]
        [StringLength(100)]
        public string ContentType { get; set; } = string.Empty;
    }
}
