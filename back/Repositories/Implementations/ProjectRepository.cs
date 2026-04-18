using Microsoft.EntityFrameworkCore;
using B.Models;
using B.Repositories.Interfaces;
using B.Data;

namespace B.Repositories.Implementations
{
    public class ProjectRepository : IProjectRepository
    {
        private readonly DatabaseContext _context;

        public ProjectRepository(DatabaseContext context)
        {
            _context = context;
        }

        public async Task<IEnumerable<Project>> GetAllAsync()
        {
            return await _context.Projects
                .Include(p => p.ProjectAccesses)
                .ToListAsync();
        }

        public async Task<IEnumerable<Project>> GetProjectsByUserIdAsync(int userId)
        {
            return await _context.Projects
                .Include(p => p.ProjectAccesses)
                .Where(p => p.UserId == userId || p.ProjectAccesses.Any(a => a.UserId == userId))
                .ToListAsync();
        }

        public async Task<Project?> GetByIdAsync(int id)
        {
            return await _context.Projects
                .Include(p => p.ProjectAccesses)
                .FirstOrDefaultAsync(p => p.Id == id);
        }

        public async Task CreateAsync(Project project)
        {
            _context.Projects.Add(project);
            await _context.SaveChangesAsync();
        }

        public async Task UpdateAsync(Project project)
        {
            _context.Entry(project).State = EntityState.Modified;
            await _context.SaveChangesAsync();
        }

        public async Task DeleteAsync(int id)
        {
            var project = await _context.Projects.FindAsync(id);
            if (project != null)
            {
                _context.Projects.Remove(project);
                await _context.SaveChangesAsync();
            }
        }

        public async Task AddProjectFilesAsync(int projectId, IEnumerable<ProjectFile> files)
        {
            foreach (var file in files)
            {
                file.ProjectId = projectId;
                file.CreatedAt = DateTime.UtcNow;
                file.LastModified = DateTime.UtcNow;
                _context.ProjectFiles.Add(file);
            }
            await _context.SaveChangesAsync();
        }

        public async Task<IEnumerable<ProjectFile>> GetProjectFilesAsync(int projectId)
        {
            if (projectId == 0)
                return await _context.ProjectFiles.ToListAsync();

            return await _context.ProjectFiles
                .Where(f => f.ProjectId == projectId)
                .ToListAsync();
        }

        public async Task<ProjectFile?> GetProjectFileByIdAsync(int fileId)
        {
            return await _context.ProjectFiles.FindAsync(fileId);
        }

        public async Task DeleteProjectFileAsync(int fileId)
        {
            var file = await _context.ProjectFiles.FindAsync(fileId);
            if (file != null)
            {
                _context.ProjectFiles.Remove(file);
                await _context.SaveChangesAsync();
            }
        }

        public async Task UpdateProjectFileAsync(ProjectFile file)
        {
            file.LastModified = DateTime.UtcNow;
            _context.Entry(file).State = EntityState.Modified;
            await _context.SaveChangesAsync();
        }

        public async Task<IEnumerable<ProjectAccess>> GetProjectAccessesAsync(int projectId)
        {
            return await _context.ProjectAccesses
                .Where(a => a.ProjectId == projectId)
                .ToListAsync();
        }

        public async Task SetProjectAccessesAsync(int projectId, IEnumerable<ProjectAccess> accesses)
        {
            var existing = await _context.ProjectAccesses
                .Where(a => a.ProjectId == projectId)
                .ToListAsync();
            _context.ProjectAccesses.RemoveRange(existing);

            foreach (var access in accesses)
            {
                access.ProjectId = projectId;
                _context.ProjectAccesses.Add(access);
            }
            await _context.SaveChangesAsync();
        }

        public async Task<ProjectAccess?> GetProjectAccessAsync(int projectId, int userId)
        {
            return await _context.ProjectAccesses
                .FirstOrDefaultAsync(a => a.ProjectId == projectId && a.UserId == userId);
        }

        public async Task UpsertProjectAccessAsync(int projectId, int userId, string accessLevel)
        {
            var existing = await _context.ProjectAccesses
                .FirstOrDefaultAsync(a => a.ProjectId == projectId && a.UserId == userId);

            if (existing != null)
            {
                existing.AccessLevel = accessLevel;
                existing.GrantedAt = DateTime.UtcNow;
            }
            else
            {
                _context.ProjectAccesses.Add(new ProjectAccess
                {
                    ProjectId = projectId,
                    UserId = userId,
                    AccessLevel = accessLevel,
                    GrantedAt = DateTime.UtcNow
                });
            }
            await _context.SaveChangesAsync();
        }

        public async Task RemoveProjectAccessAsync(int projectId, int userId)
        {
            var access = await _context.ProjectAccesses
                .FirstOrDefaultAsync(a => a.ProjectId == projectId && a.UserId == userId);
            if (access != null)
            {
                _context.ProjectAccesses.Remove(access);
                await _context.SaveChangesAsync();
            }
        }
    }
}
