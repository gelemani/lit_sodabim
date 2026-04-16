using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using B.Models;
using B.Data;

namespace B.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class IfcCommentController : ControllerBase
    {
        private readonly DatabaseContext _context;

        public IfcCommentController(DatabaseContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetByFile(
            [FromQuery] int projectId,
            [FromQuery] int fileId)
        {
            var comments = await _context.IfcComponentComments
                .Where(c => c.ProjectId == projectId && c.ProjectFileId == fileId)
                .OrderByDescending(c => c.CreatedAt)
                .Select(c => new
                {
                    c.Id,
                    c.ExpressId,
                    c.ElementName,
                    c.ElementDataJson,
                    c.CommentText,
                    c.UserId,
                    c.CreatedAt
                })
                .ToListAsync();
            return Ok(comments);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] IfcCommentCreateRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.CommentText))
                return BadRequest("CommentText is required.");

            var comment = new IfcComponentComment
            {
                ProjectId = request.ProjectId,
                ProjectFileId = request.ProjectFileId,
                ExpressId = request.ExpressId,
                ElementName = request.ElementName ?? "",
                ElementDataJson = request.ElementDataJson,
                CommentText = request.CommentText.Trim(),
                UserId = request.UserId,
                CreatedAt = DateTime.UtcNow
            };

            _context.IfcComponentComments.Add(comment);
            await _context.SaveChangesAsync();

            return CreatedAtAction(
                nameof(GetByFile),
                new { projectId = comment.ProjectId, fileId = comment.ProjectFileId },
                new
                {
                    comment.Id,
                    comment.ExpressId,
                    comment.ElementName,
                    comment.CommentText,
                    comment.UserId,
                    comment.CreatedAt
                });
        }
    }

    public class IfcCommentCreateRequest
    {
        public int ProjectId { get; set; }
        public int ProjectFileId { get; set; }
        public int ExpressId { get; set; }
        public string? ElementName { get; set; }
        public string? ElementDataJson { get; set; }
        public string CommentText { get; set; } = string.Empty;
        public int UserId { get; set; }
    }
}
