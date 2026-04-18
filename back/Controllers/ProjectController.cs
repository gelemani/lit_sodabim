using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using B.Models;
using B.Repositories.Interfaces;
using B.Data;
using B.Hubs;

namespace B.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProjectController : ControllerBase
    {
        private readonly IProjectRepository _projectRepository;
        private readonly IUserRepository _userRepository;
        private readonly DatabaseContext _context;
        private readonly IConfiguration _configuration;
        private readonly IHubContext<CommentHub> _commentHub;

        private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".ifc", ".ifczip", ".pdf", ".docx", ".xlsx", ".dwg", ".rvt", ".png", ".jpg", ".jpeg"
        };

        public ProjectController(IProjectRepository projectRepository, IUserRepository userRepository,
            DatabaseContext context, IConfiguration configuration, IHubContext<CommentHub> commentHub)
        {
            _projectRepository = projectRepository;
            _userRepository = userRepository;
            _context = context;
            _configuration = configuration;
            _commentHub = commentHub;
        }

        private static object MapProject(Project p) => new
        {
            p.Id,
            creatorId = p.UserId,
            p.Title,
            p.CreatedAt,
            p.LastModified,
            p.AccessLevel,
            projectFiles = p.ProjectFiles.Select(f => new { f.Id, f.FileName, f.CreatedAt, f.LastModified }),
            projectAccesses = p.ProjectAccesses.Select(a => new { a.UserId, a.AccessLevel, a.GrantedAt }),
        };

        [HttpGet("list")]
        public async Task<IActionResult> GetAllProjects()
        {
            var projects = await _projectRepository.GetAllAsync();
            return Ok(projects.Select(MapProject));
        }

        [HttpGet("users")]
        public async Task<IActionResult> GetAllUsers()
        {
            var users = await _userRepository.GetAllAsync();
            var dtos = users.Select(u => new
            {
                u.Id,
                u.Login,
                u.UserName,
                u.UserSurname,
                u.Email
            });
            return Ok(dtos);
        }

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] int userId)
        {
            var projects = await _projectRepository.GetProjectsByUserIdAsync(userId);
            return Ok(projects.Select(MapProject));
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var project = await _projectRepository.GetByIdAsync(id);
            if (project == null)
                return NotFound();
            return Ok(MapProject(project));
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] ProjectCreateRequest request)
        {
            try
            {
                if (request == null)
                    return BadRequest("Project data is required.");
                if (string.IsNullOrWhiteSpace(request.Title))
                    return BadRequest("Project title is required.");
                if (request.CreatorId <= 0)
                    return BadRequest("Valid creator (creatorId) is required.");

                var project = new Project
                {
                    UserId = request.CreatorId,
                    Title = request.Title.Trim(),
                    CreatedAt = DateTime.UtcNow,
                    LastModified = DateTime.UtcNow,
                    AccessLevel = request.AccessLevel ?? "viewer",
                };

                await _projectRepository.CreateAsync(project);

                // Build accesses: always include creator as Admin
                var accesses = (request.ProjectAccesses ?? [])
                    .Where(a => a.UserId > 0)
                    .ToList();

                if (!accesses.Any(a => a.UserId == request.CreatorId))
                    accesses.Add(new ProjectAccessInput { UserId = request.CreatorId, AccessLevel = "Admin" });

                await _projectRepository.SetProjectAccessesAsync(project.Id,
                    accesses.Select(a => new ProjectAccess
                    {
                        UserId = a.UserId,
                        AccessLevel = a.AccessLevel ?? "viewer",
                        GrantedAt = DateTime.UtcNow
                    }));

                var created = await _projectRepository.GetByIdAsync(project.Id);
                return CreatedAtAction(nameof(GetById), new { id = project.Id }, MapProject(created!));
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, inner = ex.InnerException?.Message });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] ProjectUpdateRequest request)
        {
            if (request == null)
                return BadRequest();

            var existing = await _projectRepository.GetByIdAsync(id);
            if (existing == null)
                return NotFound();

            existing.Title = request.Title?.Trim() ?? existing.Title;
            existing.LastModified = DateTime.UtcNow;
            existing.AccessLevel = request.AccessLevel ?? existing.AccessLevel;
            await _projectRepository.UpdateAsync(existing);

            if (request.ProjectAccesses != null)
            {
                var accesses = request.ProjectAccesses.Where(a => a.UserId > 0).ToList();
                if (!accesses.Any(a => a.UserId == existing.UserId))
                    accesses.Add(new ProjectAccessInput { UserId = existing.UserId, AccessLevel = "Admin" });

                await _projectRepository.SetProjectAccessesAsync(id,
                    accesses.Select(a => new ProjectAccess
                    {
                        UserId = a.UserId,
                        AccessLevel = a.AccessLevel ?? "viewer",
                        GrantedAt = DateTime.UtcNow
                    }));
            }

            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            await _projectRepository.DeleteAsync(id);
            return NoContent();
        }

        // ── Access management ─────────────────────────────────────────────────

        [HttpGet("{id}/access")]
        public async Task<IActionResult> GetAccesses(int id)
        {
            var project = await _projectRepository.GetByIdAsync(id);
            if (project == null) return NotFound();
            var accesses = await _projectRepository.GetProjectAccessesAsync(id);
            return Ok(accesses.Select(a => new { a.UserId, a.AccessLevel, a.GrantedAt }));
        }

        [HttpPost("{id}/access")]
        public async Task<IActionResult> AddAccess(int id, [FromBody] ProjectAccessInput input)
        {
            var project = await _projectRepository.GetByIdAsync(id);
            if (project == null) return NotFound();
            if (input.UserId <= 0) return BadRequest("Valid userId is required.");

            await _projectRepository.UpsertProjectAccessAsync(id, input.UserId, input.AccessLevel ?? "viewer");
            return Ok();
        }

        [HttpDelete("{id}/access/{userId}")]
        public async Task<IActionResult> RemoveAccess(int id, int userId)
        {
            var project = await _projectRepository.GetByIdAsync(id);
            if (project == null) return NotFound();
            if (project.UserId == userId) return BadRequest("Cannot remove project owner access.");

            await _projectRepository.RemoveProjectAccessAsync(id, userId);
            return NoContent();
        }

        // ── Comments ──────────────────────────────────────────────────────────

        [HttpGet("ifc-comments")]
        public async Task<IActionResult> GetIfcComments([FromQuery] int projectId, [FromQuery] int fileId)
        {
            var comments = await _context.IfcComponentComments
                .Where(c => c.ProjectId == projectId && c.ProjectFileId == fileId)
                .OrderByDescending(c => c.CreatedAt)
                .Select(c => new
                {
                    c.Id,
                    c.ExpressId,
                    c.ElementName,
                    c.CommentText,
                    c.UserId,
                    c.CreatedAt,
                    c.CameraPositionJson,
                    c.SketchSvg
                })
                .ToListAsync();
            return Ok(comments);
        }

        [HttpPost("ifc-comments")]
        public async Task<IActionResult> CreateIfcComment([FromBody] IfcCommentCreateRequest request)
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
                CameraPositionJson = request.CameraPositionJson,
                SketchSvg = request.SketchSvg,
                CreatedAt = DateTime.UtcNow
            };
            _context.IfcComponentComments.Add(comment);
            await _context.SaveChangesAsync();

            var payload = new
            {
                comment.Id,
                comment.ExpressId,
                comment.ElementName,
                comment.CommentText,
                comment.UserId,
                comment.CreatedAt,
                comment.CameraPositionJson,
                comment.SketchSvg
            };

            var groupKey = $"project-{request.ProjectId}-file-{request.ProjectFileId}";
            await _commentHub.Clients.Group(groupKey).SendAsync("NewComment", payload);
            return Ok(payload);
        }

        // ── Files ─────────────────────────────────────────────────────────────

        [HttpPost("{projectId}/files")]
        public async Task<IActionResult> UploadFiles(int projectId, [FromForm] List<IFormFile> files)
        {
            if (files == null || files.Count == 0)
                return BadRequest("No files uploaded.");

            var project = await _projectRepository.GetByIdAsync(projectId);
            if (project == null)
                return NotFound($"Project with ID {projectId} not found.");

            var maxSize = _configuration.GetValue<long>("FileUpload:MaxFileSizeBytes", 524_288_000);
            var configExts = _configuration["FileUpload:AllowedExtensions"];
            var allowed = configExts != null
                ? new HashSet<string>(configExts.Split(',').Select(e => e.Trim()), StringComparer.OrdinalIgnoreCase)
                : AllowedExtensions;

            var projectFiles = new List<ProjectFile>();

            foreach (var file in files)
            {
                if (file.Length > maxSize)
                    return BadRequest($"Файл «{file.FileName}» превышает максимально допустимый размер {maxSize / 1_048_576} МБ.");

                var ext = Path.GetExtension(file.FileName);
                if (!allowed.Contains(ext))
                    return BadRequest($"Тип файла «{ext}» не разрешён. Допустимые типы: {string.Join(", ", allowed)}.");

                using var ms = new MemoryStream();
                await file.CopyToAsync(ms);

                projectFiles.Add(new ProjectFile
                {
                    FileName = file.FileName,
                    FileData = ms.ToArray(),
                    ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
                    CreatedAt = DateTime.UtcNow,
                    LastModified = DateTime.UtcNow,
                    ProjectId = projectId
                });
            }

            await _projectRepository.AddProjectFilesAsync(projectId, projectFiles);
            return Ok(new { Message = $"{files.Count} files uploaded successfully." });
        }

        [HttpGet("{projectId}/files")]
        public async Task<IActionResult> GetFiles(int projectId)
        {
            var project = await _projectRepository.GetByIdAsync(projectId);
            if (project == null)
                return NotFound($"Project with ID {projectId} not found.");

            var files = await _projectRepository.GetProjectFilesAsync(projectId);
            return Ok(files.Select(f => new { f.Id, f.FileName, f.CreatedAt, f.LastModified }));
        }

        [HttpGet("{projectId}/files/download")]
        public async Task<IActionResult> DownloadFiles(int projectId)
        {
            var project = await _projectRepository.GetByIdAsync(projectId);
            if (project == null)
                return NotFound($"Project with ID {projectId} not found.");

            var files = await _projectRepository.GetProjectFilesAsync(projectId);

            using var memoryStream = new MemoryStream();
            using (var archive = new System.IO.Compression.ZipArchive(memoryStream, System.IO.Compression.ZipArchiveMode.Create, true))
            {
                foreach (var file in files)
                {
                    var zipEntry = archive.CreateEntry(file.FileName, System.IO.Compression.CompressionLevel.Fastest);
                    using var zipStream = zipEntry.Open();
                    await zipStream.WriteAsync(file.FileData, 0, file.FileData.Length);
                }
            }

            memoryStream.Position = 0;
            return File(memoryStream.ToArray(), "application/zip", $"project_{projectId}_files.zip");
        }

        [HttpGet("files/{fileId}/download")]
        public async Task<IActionResult> DownloadFile(int fileId)
        {
            var file = await _projectRepository.GetProjectFileByIdAsync(fileId);
            if (file == null)
                return NotFound($"File with ID {fileId} not found.");

            var contentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType;
            return File(file.FileData, contentType, file.FileName);
        }

        [HttpDelete("files/{fileId}")]
        public async Task<IActionResult> DeleteFile(int fileId)
        {
            var file = await _projectRepository.GetProjectFileByIdAsync(fileId);
            if (file == null)
                return NotFound($"File with ID {fileId} not found.");

            await _projectRepository.DeleteProjectFileAsync(fileId);
            return NoContent();
        }

        [HttpPut("files/{fileId}")]
        public async Task<IActionResult> UpdateFile(int fileId, [FromForm] List<IFormFile> newFile)
        {
            if (newFile == null || newFile.Count == 0)
                return BadRequest("No file provided.");
            if (newFile.Count > 1)
                return BadRequest("Only one file allowed.");

            var existingFile = await _projectRepository.GetProjectFileByIdAsync(fileId);
            if (existingFile == null)
                return NotFound($"File with ID {fileId} not found.");

            var existingExtension = Path.GetExtension(existingFile.FileName).ToLowerInvariant();
            var newExtension = Path.GetExtension(newFile[0].FileName).ToLowerInvariant();

            if (existingExtension != newExtension)
                return BadRequest($"File extension must be the same. Expected: {existingExtension}, got: {newExtension}");

            using var ms = new MemoryStream();
            await newFile[0].CopyToAsync(ms);

            existingFile.FileData = ms.ToArray();
            existingFile.ContentType = string.IsNullOrWhiteSpace(newFile[0].ContentType) ? "application/octet-stream" : newFile[0].ContentType;
            existingFile.LastModified = DateTime.UtcNow;

            await _projectRepository.UpdateProjectFileAsync(existingFile);
            return Ok(new { Message = "File updated successfully.", FileId = existingFile.Id, FileName = existingFile.FileName });
        }

        [HttpPut("files/{fileId}/rename")]
        public async Task<IActionResult> RenameFile(int fileId, [FromBody] RenameFileRequest request)
        {
            var existingFile = await _projectRepository.GetProjectFileByIdAsync(fileId);
            if (existingFile == null)
                return NotFound($"File with ID {fileId} not found.");

            if (string.IsNullOrWhiteSpace(request.NewFileName))
                return BadRequest("New file name cannot be empty.");

            var newFileName = !Path.HasExtension(request.NewFileName)
                ? request.NewFileName + Path.GetExtension(existingFile.FileName)
                : request.NewFileName;

            var existingExtension = Path.GetExtension(existingFile.FileName).ToLowerInvariant();
            var newExtension = Path.GetExtension(newFileName).ToLowerInvariant();

            if (existingExtension != newExtension)
                return BadRequest($"File extension must be the same. Expected: {existingExtension}, got: {newExtension}");

            existingFile.FileName = newFileName;
            existingFile.LastModified = DateTime.UtcNow;

            await _projectRepository.UpdateProjectFileAsync(existingFile);
            return Ok(new { Message = "File renamed successfully.", FileName = newFileName });
        }
    }

    public class ProjectAccessInput
    {
        public int UserId { get; set; }
        public string? AccessLevel { get; set; }
    }

    public class ProjectCreateRequest
    {
        public int CreatorId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? AccessLevel { get; set; }
        public List<ProjectAccessInput>? ProjectAccesses { get; set; }
    }

    public class ProjectUpdateRequest
    {
        public string? Title { get; set; }
        public string? AccessLevel { get; set; }
        public List<ProjectAccessInput>? ProjectAccesses { get; set; }
    }

    public class RenameFileRequest
    {
        public string NewFileName { get; set; } = string.Empty;
    }
}
