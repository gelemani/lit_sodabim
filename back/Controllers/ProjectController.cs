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

        [HttpGet("list")]
        public async Task<IActionResult> GetAllProjects()
        {
            var projects = await _projectRepository.GetAllAsync();
            return Ok(projects);
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
            return Ok(projects);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var project = await _projectRepository.GetByIdAsync(id);
            if (project == null)
                return NotFound();
            return Ok(project);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] Project project)
        {
            try
            {
                if (project == null)
                {
                    return BadRequest("Project data is required.");
                }
                if (string.IsNullOrWhiteSpace(project.Title))
                {
                    return BadRequest("Project title is required.");
                }
                if (project.UserId <= 0)
                {
                    return BadRequest("Valid creator (UserId) is required.");
                }
                await _projectRepository.CreateAsync(project);
                return CreatedAtAction(nameof(GetById), new { id = project.Id }, project);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, inner = ex.InnerException?.Message });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(int id, [FromBody] Project project)
        {
            if (project == null || id != project.Id)
                return BadRequest();
            var existing = await _projectRepository.GetByIdAsync(id);
            if (existing == null)
                return NotFound();
            existing.Title = project.Title;
            existing.LastModified = DateTime.UtcNow;
            existing.AccessLevel = project.AccessLevel ?? existing.AccessLevel;
            await _projectRepository.UpdateAsync(existing);
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            await _projectRepository.DeleteAsync(id);
            return NoContent();
        }

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

            // Оповещаем всех подключённых клиентов в комнате проекта
            var groupKey = $"project-{request.ProjectId}-file-{request.ProjectFileId}";
            await _commentHub.Clients.Group(groupKey).SendAsync("NewComment", payload);

            return Ok(payload);
        }

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
                    ContentType = string.IsNullOrWhiteSpace(file.ContentType)
                        ? "application/octet-stream"
                        : file.ContentType,
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
            {
                return NotFound($"Project with ID {projectId} not found.");
            }

            var files = await _projectRepository.GetProjectFilesAsync(projectId);

            var fileDtos = files.Select(f => new
            {
                f.Id,
                f.FileName,
                f.CreatedAt,
                f.LastModified
            });

            return Ok(fileDtos);
        }

        [HttpGet("{projectId}/files/download")]
        public async Task<IActionResult> DownloadFiles(int projectId)
        {
            var project = await _projectRepository.GetByIdAsync(projectId);
            if (project == null)
            {
                return NotFound($"Project with ID {projectId} not found.");
            }

            var files = await _projectRepository.GetProjectFilesAsync(projectId);

            using (var memoryStream = new System.IO.MemoryStream())
            {
                using (var archive = new System.IO.Compression.ZipArchive(memoryStream, System.IO.Compression.ZipArchiveMode.Create, true))
                {
                    foreach (var file in files)
                    {
                        var zipEntry = archive.CreateEntry(file.FileName, System.IO.Compression.CompressionLevel.Fastest);
                        using (var zipStream = zipEntry.Open())
                        {
                            await zipStream.WriteAsync(file.FileData, 0, file.FileData.Length);
                        }
                    }
                }

                memoryStream.Position = 0;
                var zipFileName = $"project_{projectId}_files.zip";
                return File(memoryStream.ToArray(), "application/zip", zipFileName);
            }
        }

        [HttpGet("files/{fileId}/download")]
        public async Task<IActionResult> DownloadFile(int fileId)
        {
            var file = await _projectRepository.GetProjectFileByIdAsync(fileId);
            if (file == null)
            {
                return NotFound($"File with ID {fileId} not found.");
            }

            var contentType = string.IsNullOrWhiteSpace(file.ContentType) 
                ? "application/octet-stream" 
                : file.ContentType;

            return File(file.FileData, contentType, file.FileName);
        }

        [HttpDelete("files/{fileId}")]
        public async Task<IActionResult> DeleteFile(int fileId)
        {
            var file = await _projectRepository.GetProjectFileByIdAsync(fileId);
            if (file == null)
            {
                return NotFound($"File with ID {fileId} not found.");
            }

            await _projectRepository.DeleteProjectFileAsync(fileId);
            return NoContent();
        }

        [HttpPut("files/{fileId}")]
        public async Task<IActionResult> UpdateFile(int fileId, [FromForm] List<IFormFile> newFile)
        {
            IFormFile file = newFile[0];
            if (file == null || newFile.Count == 0)
            {
                return BadRequest("No file provided.");
            }
            if (newFile.Count > 1)
            {
                return BadRequest("Only one file allowed.");
            }

            var existingFile = await _projectRepository.GetProjectFileByIdAsync(fileId);
            if (existingFile == null)
            {
                return NotFound($"File with ID {fileId} not found.");
            }

            // Проверяем расширение файла
            var existingExtension = Path.GetExtension(existingFile.FileName).ToLowerInvariant();
            var newExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
            
            if (existingExtension != newExtension)
            {
                return BadRequest($"File extension must be the same. Expected: {existingExtension}, got: {newExtension}");
            }

            // Читаем содержимое нового файла
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            var fileBytes = ms.ToArray();

            // Обновляем только содержимое файла, сохраняя оригинальное имя и projectId
            existingFile.FileData = fileBytes;
            existingFile.ContentType = string.IsNullOrWhiteSpace(file.ContentType) 
                ? "application/octet-stream" 
                : file.ContentType;
            existingFile.LastModified = DateTime.UtcNow;

            await _projectRepository.UpdateProjectFileAsync(existingFile);
            return Ok(new { Message = "File updated successfully.", FileId = existingFile.Id, FileName = existingFile.FileName });
        }

        [HttpPut("files/{fileId}/rename")]
        public async Task<IActionResult> RenameFile(int fileId, [FromBody] RenameFileRequest request)
        {
            var existingFile = await _projectRepository.GetProjectFileByIdAsync(fileId);
            if (existingFile == null)
            {
                return NotFound($"File with ID {fileId} not found.");
            }

            if (string.IsNullOrWhiteSpace(request.NewFileName))
            {
                return BadRequest("New file name cannot be empty.");
            }

            // Если новое имя не содержит расширение, добавляем его из текущего имени файла
            var newFileName = !Path.HasExtension(request.NewFileName)
                ? request.NewFileName + Path.GetExtension(existingFile.FileName)
                : request.NewFileName;

            // Проверяем, что расширение файла не изменилось
            var existingExtension = Path.GetExtension(existingFile.FileName).ToLowerInvariant();
            var newExtension = Path.GetExtension(newFileName).ToLowerInvariant();
            
            if (existingExtension != newExtension)
            {
                return BadRequest($"File extension must be the same. Expected: {existingExtension}, got: {newExtension}");
            }

            existingFile.FileName = newFileName;
            existingFile.LastModified = DateTime.UtcNow;

            await _projectRepository.UpdateProjectFileAsync(existingFile);
            return Ok(new { Message = "File renamed successfully.", FileName = newFileName });
        }
    }

    public class RenameFileRequest
    {
        public string NewFileName { get; set; } = string.Empty;
    }
}
